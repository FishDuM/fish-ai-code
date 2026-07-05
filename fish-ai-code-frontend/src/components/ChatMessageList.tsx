import { memo, useRef, useCallback, useLayoutEffect } from 'react';
import { Button } from 'antd';
import { CodeOutlined, HistoryOutlined, LoadingOutlined } from '@ant-design/icons';
import ChatMessage from './ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createTime: string;
  /** Runtime-only flag. Only meaningful on the live streaming bubble. Never
   *  persisted in chat history. */
  isStreaming?: boolean;
}

interface ChatMessageListProps {
  messages: Message[];
  /** Live AI message currently being streamed. Lives OUTSIDE messages[] while
   *  streaming so committed history doesn't churn on every 200ms tick — but
   *  it's rendered through the same ChatMessage path so there's no
   *  unmount/remount at the moment the stream finishes. */
  streamingMessage?: Message | null;
  hasMoreHistory: boolean;
  loadingMore: boolean;
  sseError: Error | null;
  onLoadMore: () => void;
}

function ChatMessageList({
  messages,
  streamingMessage,
  hasMoreHistory,
  loadingMore,
  sseError,
  onLoadMore,
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTimeRef = useRef(0);
  const userScrolledUpRef = useRef(false);

  // Effective list shown to the user. Append the streaming bubble at the tail
  // when active. We do NOT mutate `messages` to keep its reference stable
  // (history scrolls/back won't trigger full re-render of every message).
  const allMessages = streamingMessage
    ? [...messages, streamingMessage]
    : messages;
  const isStreaming = Boolean(streamingMessage);

  // Force scroll to the bottom on every message / streaming-chunk change.
  // We use useLayoutEffect (synchronous after DOM commit, before paint) +
  // requestAnimationFrame (waits one frame so the new DOM has settled) +
  // the anchor `<div ref={messagesEndRef}>` at the end of the message list
  // — `scrollIntoView({ block: 'end' })` brings the anchor into view at
  // the bottom edge of the scroll container.
  //
  // We only respect "user manually scrolled up" as a temporary suppression:
  // if the user scrolls up within the last 400ms, we hold the scroll.
  // Otherwise we always re-anchor to the bottom. This way streaming
  // chunks never end up below the fold even when the previous scroll
  // position was at the top.
  //
  // 依赖项只放 messages / streamingMessage：旧实现把 currentCode 也放进依赖，
  // 导致流式每 200ms 触发一次 scrollIntoView —— 浏览器会报 [Violation] 'message'
  // handler took Xms / Forced reflow。流式滚动的视觉靠 streamingMessage 的
  // 内容变化（chat 流式期 React 仍因 ChatMessage 内部渲染追加了节点），不靠
  // currentCode 的轮转。
  useLayoutEffect(() => {
    const sinceUserScroll = Date.now() - lastScrollTimeRef.current;
    if (userScrolledUpRef.current && sinceUserScroll < 400) return;
    userScrolledUpRef.current = false;

    const tick = () => {
      const end = messagesEndRef.current;
      if (end) {
        end.scrollIntoView({ block: 'end' });
      } else {
        const c = scrollContainerRef.current;
        if (c) c.scrollTop = c.scrollHeight;
      }
    };
    tick();
    requestAnimationFrame(tick);
  }, [messages, streamingMessage]);

  // Track manual user scrolls: if the user has scrolled away from the
  // bottom within the last 400ms, suppress the next auto-scroll so the
  // panel doesn't yank them back. After 400ms of inactivity we resume.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 100) {
      userScrolledUpRef.current = true;
      lastScrollTimeRef.current = Date.now();
    }
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      style={{ flex: 1, overflow: 'auto', padding: 16 }}
      onScroll={handleScroll}
    >
      {/* Load more button */}
      {hasMoreHistory && messages.length > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <Button
            type="link"
            icon={loadingMore ? <LoadingOutlined /> : <HistoryOutlined />}
            onClick={onLoadMore}
            disabled={loadingMore}
            size="small"
          >
            {loadingMore ? '加载中...' : '加载更多历史消息'}
          </Button>
        </div>
      )}

      {messages.length === 0 && !isStreaming && (
        <div style={{ textAlign: 'center', color: 'rgba(17,25,37,0.45)', marginTop: 80 }}>
          <CodeOutlined
            style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }}
          />
          <div style={{ color: 'rgba(17,25,37,0.45)' }}>输入描述，AI 将为你生成网站代码</div>
        </div>
      )}

      {allMessages.map((msg) => (
        <ChatMessage
          key={msg.id}
          role={msg.role}
          content={msg.content}
          isStreaming={msg.isStreaming}
        />
      ))}

      {sseError && (
        <div style={{ textAlign: 'center', color: '#EF4444', padding: '8px 0', fontSize: 13 }}>
          生成失败：{sseError.message || '未知错误'}，请重试
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export default memo(ChatMessageList);
