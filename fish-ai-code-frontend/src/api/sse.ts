import { API_BASE_URL, ERROR_CODES } from '@/constants';
import { handleAuthExpired } from './authExpired';

/**
 * SSE 事件块可能跨多行（一个事件多个 data: 行），每行剥一次前缀即可。
 * 不能 while 循环反复剥：AI 生成的代码里 `data: [...]`、`event: click` 会被误改写。
 */
function stripSSEPrefix(line: string): string {
  return line
    .split('\n')
    .map((l) => {
      if (l.startsWith('data: ')) return l.slice(6);
      if (l.startsWith('data:')) return l.slice(5);
      if (l.startsWith('event: ')) return l.slice(7);
      if (l.startsWith('event:')) return l.slice(6);
      if (l.startsWith('id: ') || l.startsWith('retry: ')) {
        const colon = l.indexOf(':');
        return l.slice(colon + 2);
      }
      if (l.startsWith('id:') || l.startsWith('retry:')) {
        const colon = l.indexOf(':');
        return l.slice(colon + 1);
      }
      return l;
    })
    .join('\n');
}

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onToolExecuted?: (toolName: string, filePath: string, content: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  onBusinessError?: (code: number, message: string) => void;
}

interface ParsedSSEEvent {
  event: string;
  data: string;
}

/**
 * Parse a raw SSE event block into its event type and data payload.
 * Handles multi-line data values (consecutive "data:" lines).
 */
function parseSSEEventBlock(block: string): ParsedSSEEvent {
  const lines = block.split('\n');
  let eventType = '';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5));
    }
  }

  return { event: eventType, data: dataLines.join('\n') };
}

/**
 * Start an SSE stream for AI code generation.
 * Backend returns Flux<String> (Spring wraps each value as SSE data:xxx\n\n).
 *
 * Current backend usually emits markdown/plain-text chunks for every app type.
 * Older or future VUE_PROJECT streams may emit JSON messages with types:
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
  let receivedBusinessError = false;

  /** 统一处理 business-error 事件：40100 视为会话过期，走统一登出 */
  const handleBusinessError = (raw: string) => {
    let code: number;
    let errorMessage = '生成过程中出现错误';
    try {
      const errData = JSON.parse(raw);
      code = errData.code ?? 0;
      errorMessage = errData.message || errorMessage;
    } catch {
      // Malformed payload — fall through to the raw-data handler
      handleRawData(raw);
      return;
    }
    if (code === ERROR_CODES.NOT_LOGIN_ERROR) {
      handleAuthExpired();
      // 会话过期同样回调业务错误，让上层收尾流状态（isStreaming 置 false），
      // 否则跳转被延迟/拦截时输入框会一直处于生成中状态
      callbacks.onBusinessError?.(code, errorMessage);
      return;
    }
    callbacks.onBusinessError?.(code, errorMessage);
  };

  const handleRawData = (rawData: string) => {
    if (!rawData) return;

    const maybeJson = rawData.trimStart();

    // Try JSON parse for typed messages; otherwise keep this transport
    // layer plain-text compatible with the current backend.
    if (maybeJson.startsWith('{')) {
      try {
        const parsed = JSON.parse(maybeJson);
        const type = parsed.type;

        // 后端全局异常处理返回的 BaseResponse 格式错误（如限流 42900、参数校验失败等）
        if (parsed.code !== undefined && typeof parsed.code === 'number' && parsed.code !== 0) {
          receivedBusinessError = true;
          handleBusinessError(maybeJson);
          return;
        }

        if (type === 'ai_response' && parsed.data != null) {
          callbacks.onChunk(parsed.data);
        } else if (type === 'tool_request') {
          // AI is requesting to call a tool — silently skip for now
          // Could show a notification like "正在写入文件..."
        } else if (type === 'tool_executed') {
          // Tool execution result — extract file content for display.
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
  };

  (async () => {
    try {
      const url = `${API_BASE_URL}/app/chat/gen/code`;
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId, message }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleAuthExpired();
        }
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

        let chunk = decoder.decode(value, { stream: true });
        // 跨 chunk 边界处理：若上一个 chunk 以 \r 结尾而本 chunk 以 \n 开头，
        // 先拼上再归一化，避免漏掉边界处的 CRLF。
        if (buffer.endsWith('\r') && chunk.startsWith('\n')) {
          buffer = buffer.slice(0, -1) + '\n';
          chunk = chunk.slice(1);
        }
        buffer += chunk.replace(/\r\n/g, '\n');

        // Scan for complete SSE events (separated by \n\n)
        while (searchStart < buffer.length) {
          const eventEnd = buffer.indexOf('\n\n', searchStart);
          if (eventEnd === -1) break;

          const block = buffer.slice(searchStart, eventEnd).trim();
          searchStart = eventEnd + 2;

          if (!block) continue;

          // Parse SSE event type + data payload. This is needed to
          // distinguish custom events like "business-error" from the
          // default unnamed "data:" events that Spring WebFlux emits.
          const parsed = parseSSEEventBlock(block);

          if (parsed.event === 'business-error') {
            receivedBusinessError = true;
            handleBusinessError(parsed.data);
            continue;
          }

          // Strip SSE protocol prefixes (Spring WebFlux adds "data:" prefix)
          const rawData = stripSSEPrefix(block);
          handleRawData(rawData);
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
        const block = buffer.slice(searchStart, eventEnd).trim();
        searchStart = eventEnd + 2;
        if (!block) continue;
        const parsed = parseSSEEventBlock(block);
        if (parsed.event === 'business-error') {
          receivedBusinessError = true;
          handleBusinessError(parsed.data);
          continue;
        }
        const rawData = stripSSEPrefix(block);
        handleRawData(rawData);
      }
      // 收尾：残留 buffer 没有 `\n\n` 也当成一段事件解析 —— 这是修尾帧丢失的关键。
      if (searchStart < buffer.length) {
        const tailBlock = buffer.slice(searchStart).trim();
        if (tailBlock) {
          const parsed = parseSSEEventBlock(tailBlock);
          if (parsed.event === 'business-error') {
            receivedBusinessError = true;
            handleBusinessError(parsed.data);
          } else {
            const rawData = stripSSEPrefix(tailBlock);
            handleRawData(rawData);
          }
        }
      }

      // 业务失败已经由 onBusinessError 处理，不能再把它作为成功完成处理。
      if (!receivedBusinessError) {
        callbacks.onDone();
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name !== 'AbortError') {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return controller;
}
