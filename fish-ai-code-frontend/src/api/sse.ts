import { API_BASE_URL } from '@/constants';

/**
 * Strip SSE protocol prefixes from every line in the event body.
 * Spring WebFlux wraps Flux<String> as SSE, adding "data:" prefix per line.
 * A multi-line value is sent as multiple consecutive "data:" lines within one event:
 *   data:line1
 *   data:line2
 *   data:line3
 * This must be handled by stripping "data:" from EVERY line, not just the first.
 */
function stripSSEPrefix(line: string): string {
  return line
    .split('\n')
    .map((l) => {
      let s = l.trim();
      while (s.startsWith('data:') || s.startsWith('event:') || s.startsWith('id:') || s.startsWith('retry:')) {
        const colon = s.indexOf(':');
        if (colon === -1) break;
        s = s.slice(colon + 1).trim();
      }
      return s;
    })
    .join('\n')
    .trim();
}

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onToolExecuted?: (toolName: string, filePath: string, content: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

/**
 * Start an SSE stream for AI code generation.
 * Backend returns Flux<String> (Spring wraps each value as SSE data:xxx\n\n).
 *
 * For HTML / MULTI_FILE: raw text chunks.
 * For VUE_PROJECT: JSON messages with types:
 *   - ai_response  → { type: "ai_response", data: "..." }
 *   - tool_request → { type: "tool_request", id, name, arguments }
 *   - tool_executed→ { type: "tool_executed", id, name, arguments, result }
 *
 * Stream ends when the HTTP connection closes (ReadableStream done signal),
 * no trailing event:done.
 *
 * `message` is the raw prompt — callers that want to attach element context
 * (visual edit mode) should compose the final string themselves before
 * passing it in. The SSE layer is intentionally transport-only.
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

      // 显式判空：response.body 在某些环境（如 fetch polyfill、异常状态）下可能为 null，
      // 用非空断言会让底层 stream 静默失败、聊天窗一直空着，难以排查。
      if (!response.body) {
        throw new Error('SSE 响应体为空');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Index in `buffer` where the next SSE event scan should start.
      // Persists across reads so a \n\n split across two chunks is still
      // parsed once the second chunk arrives.
      let searchStart = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Scan for complete SSE events (separated by \n\n)
        while (searchStart < buffer.length) {
          const eventEnd = buffer.indexOf('\n\n', searchStart);
          if (eventEnd === -1) break;

          const event = buffer.slice(searchStart, eventEnd).trim();
          searchStart = eventEnd + 2;

          if (!event) continue;

          // Strip SSE protocol prefixes (Spring WebFlux adds "data:" prefix)
          const rawData = stripSSEPrefix(event);
          if (!rawData) continue;

          // Try JSON parse for typed messages (VUE_PROJECT)
          if (rawData.startsWith('{')) {
            try {
              const parsed = JSON.parse(rawData);
              const type = parsed.type;

              if (type === 'ai_response' && parsed.data != null) {
                callbacks.onChunk(parsed.data);
              } else if (type === 'tool_request') {
                // AI is requesting to call a tool — silently skip for now
                // Could show a notification like "正在写入文件..."
              } else if (type === 'tool_executed') {
                // Tool execution result — extract file content for display
                if (callbacks.onToolExecuted) {
                  try {
                    const args = typeof parsed.arguments === 'string'
                      ? JSON.parse(parsed.arguments)
                      : parsed.arguments;
                    callbacks.onToolExecuted(parsed.name, args?.relativeFilePath || '', args?.content || '');
                  } catch {
                    callbacks.onToolExecuted(parsed.name, '', '');
                  }
                }
              } else {
                // 未知 JSON 类型：不要再把 rawData 当文本吐给 onChunk —— 会把
                // JSON 串塞进聊天窗污染 markdown 渲染。静默跳过，让上层只看到
                // ai_response / tool_executed 的内容。
              }
            } catch {
              // Not JSON or parse error, treat as plain text chunk
              callbacks.onChunk(rawData);
            }
          } else {
            // Plain text chunk (HTML / MULTI_FILE)
            callbacks.onChunk(rawData);
          }
        }

        // Trim processed portion to keep the buffer bounded
        if (searchStart > buffer.length / 2) {
          buffer = buffer.slice(searchStart);
          searchStart = 0;
        }
      }

      // Flush any remaining bytes held by the streaming TextDecoder
      // (last multi-byte UTF-8 char may have been split across chunks).
      const tail = decoder.decode();
      if (tail) buffer += tail;
      // One final scan for trailing events. The previous implementation only
      // split on `\n\n`, so if the backend's last event didn't end with a
      // blank line (very common with Spring WebFlux — the connection simply
      // closes after the last `data:` block), the tail got silently dropped
      // and the user lost the AI's final code/text segment.
      //
      // Strategy: scan `\n\n`-delimited events first, then if anything is
      // still left in the buffer, treat the rest as one final event.
      while (searchStart < buffer.length) {
        const eventEnd = buffer.indexOf('\n\n', searchStart);
        if (eventEnd === -1) break;
        const event = buffer.slice(searchStart, eventEnd).trim();
        searchStart = eventEnd + 2;
        if (!event) continue;
        const rawData = stripSSEPrefix(event);
        if (!rawData) continue;
        if (rawData.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawData);
            if (parsed.type === 'ai_response' && parsed.data != null) {
              callbacks.onChunk(parsed.data);
            }
            // 未知 JSON 类型同样跳过，理由同主循环。
          } catch {
            callbacks.onChunk(rawData);
          }
        } else {
          callbacks.onChunk(rawData);
        }
      }
      // 收尾：残留 buffer 没有 `\n\n` 也当成一段事件解析 —— 这是修尾帧丢失的关键。
      if (searchStart < buffer.length) {
        const tailEvent = buffer.slice(searchStart).trim();
        if (tailEvent) {
          const rawData = stripSSEPrefix(tailEvent);
          if (rawData) {
            if (rawData.startsWith('{')) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.type === 'ai_response' && parsed.data != null) {
                  callbacks.onChunk(parsed.data);
                }
                // 未知 JSON 跳过
              } catch {
                callbacks.onChunk(rawData);
              }
            } else {
              callbacks.onChunk(rawData);
            }
          }
        }
      }

      callbacks.onDone();
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name !== 'AbortError') {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return controller;
}
