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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop()!; // keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue;

          let eventType = '';
          let data = '';

          for (const line of event.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            }
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
