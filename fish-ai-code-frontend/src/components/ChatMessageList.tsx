import { memo, useRef, useEffect, useCallback } from 'react';
import { Button } from 'antd';
import { CodeOutlined, HistoryOutlined, LoadingOutlined } from '@ant-design/icons';
import ChatMessage from './ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createTime: string;
}

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  currentCode: string;
  hasMoreHistory: boolean;
  loadingMore: boolean;
  sseError: Error | null;
  onLoadMore: () => void;
}

function ChatMessageList({ messages, isStreaming, currentCode, hasMoreHistory, loadingMore, sseError, onLoadMore }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track if user is near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 100;
  }, []);

  return (
    <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: 16 }} onScroll={handleScroll}>
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
          <CodeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
          <div style={{ color: 'rgba(17,25,37,0.45)' }}>输入描述，AI 将为你生成网站代码</div>
        </div>
      )}

      {messages.map((msg) => (
        <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
      ))}

      {isStreaming && (
        <ChatMessage role="ai" content={currentCode} isStreaming />
      )}

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
