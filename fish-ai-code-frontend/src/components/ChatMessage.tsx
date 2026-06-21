import { Avatar, Typography } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

export default function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        gap: 8,
      }}
    >
      {!isUser && (
        <Avatar
          size="small"
          icon={<RobotOutlined />}
          style={{ backgroundColor: '#1677ff', flexShrink: 0 }}
        />
      )}
      <div
        style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: isUser ? '#1677ff' : '#f5f5f5',
          color: isUser ? '#fff' : '#333',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {content || (isStreaming ? '' : '（无内容）')}
        {isStreaming && !content && (
          <span className="typing-dots">
            <span>●</span><span>●</span><span>●</span>
          </span>
        )}
      </div>
      {isUser && (
        <Avatar
          size="small"
          icon={<UserOutlined />}
          style={{ backgroundColor: '#87d068', flexShrink: 0 }}
        />
      )}
    </div>
  );
}
