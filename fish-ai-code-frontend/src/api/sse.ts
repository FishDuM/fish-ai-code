import { API_BASE_URL } from '@/constants';

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

/**
 * Start an SSE stream for AI code generation.
 * Uses fetch + ReadableStream instead of EventSource because
 * EventSource cannot reliably send cookies cross-origin,
 * and this backend requires JSESSIONID for authentication.
 *
 * Optimized: scans buffer incrementally rather than re-splitting the entire buffer.
 */
export function startCodeGenSSE(
  appId: string,
  message: string,
  callbacks: SSECallbacks
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const url = `${API_BASE_URL}/app/chat/gen/code?appId=${encodeURIComponent(appId)}&message=${encodeURIComponent(message)}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Accept': 'text/event-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`SSE 请求失败: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let processedLen = 0; // track how much of buffer has been fully parsed

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Only scan the new portion of the buffer for complete events
        let searchStart = processedLen;
        while (searchStart < buffer.length) {
          const eventEnd = buffer.indexOf('\n\n', searchStart);
          if (eventEnd === -1) break; // no complete event yet

          const event = buffer.slice(searchStart, eventEnd);
          searchStart = eventEnd + 2;

          if (!event.trim()) continue;

          let eventType = '';
          let data = '';

          // Parse event lines
          let lineStart = 0;
          while (lineStart < event.length) {
            const lineEnd = event.indexOf('\n', lineStart);
            const line = lineEnd === -1 ? event.slice(lineStart) : event.slice(lineStart, lineEnd);

            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            }

            if (lineEnd === -1) break;
            lineStart = lineEnd + 1;
          }

          if (eventType === 'done') {
            callbacks.onDone();
            return;
          }

          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.d !== undefined) {
                callbacks.onChunk(parsed.d);
              }
            } catch {
              callbacks.onChunk(data);
            }
          }
        }

        // Trim processed portion to keep buffer from growing unbounded
        if (searchStart > buffer.length / 2) {
          buffer = buffer.slice(searchStart);
          processedLen = 0;
        } else {
          processedLen = searchStart;
        }
      }

      callbacks.onDone();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks.onError(err);
      }
    }
  })();

  return controller;
}
