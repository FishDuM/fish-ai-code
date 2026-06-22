import { Avatar, Button, App } from 'antd';
import { UserOutlined, RobotOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import React, { useState, useCallback } from 'react';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const { message } = App.useApp();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('复制失败');
    }
  }, [children, message]);

  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 12px',
          background: '#282c34',
          borderRadius: '8px 8px 0 0',
          fontSize: 12,
          color: '#888',
        }}
      >
        <span>{language || 'code'}</span>
        <Button
          type="text"
          size="small"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          style={{ color: copied ? '#52c41a' : '#888', fontSize: 12 }}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

// Extract to module level so the reference is stable across renders
const markdownComponents = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    if (!match && !codeString.includes('\n')) {
      return (
        <code
          style={{
            background: '#e8e8e8',
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: '0.9em',
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock language={match ? match[1] : ''} children={codeString} />;
  },
  p({ children }: any) {
    return <p style={{ margin: '0 0 8px 0', lineHeight: 1.7 }}>{children}</p>;
  },
  ul({ children }: any) {
    return <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>;
  },
  ol({ children }: any) {
    return <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>;
  },
  li({ children }: any) {
    return <li style={{ margin: '2px 0' }}>{children}</li>;
  },
  h1({ children }: any) {
    return <h1 style={{ fontSize: '1.4em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 style={{ fontSize: '1.2em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 style={{ fontSize: '1.1em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h3>;
  },
  blockquote({ children }: any) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid #d9d9d9',
          paddingLeft: 12,
          margin: '8px 0',
          color: '#666',
        }}
      >
        {children}
      </blockquote>
    );
  },
  a({ href, children }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff' }}>
        {children}
      </a>
    );
  },
  table({ children }: any) {
    return (
      <table
        style={{
          borderCollapse: 'collapse',
          margin: '8px 0',
          width: '100%',
          fontSize: 13,
        }}
      >
        {children}
      </table>
    );
  },
  th({ children }: any) {
    return (
      <th
        style={{
          border: '1px solid #d9d9d9',
          padding: '6px 10px',
          background: '#fafafa',
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        {children}
      </th>
    );
  },
  td({ children }: any) {
    return (
      <td
        style={{
          border: '1px solid #d9d9d9',
          padding: '6px 10px',
        }}
      >
        {children}
      </td>
    );
  },
};

function ChatMessageInner({ role, content, isStreaming }: ChatMessageProps) {
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
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: isUser ? '#1677ff' : '#f5f5f5',
          color: isUser ? '#fff' : '#333',
          fontSize: 14,
          lineHeight: 1.6,
          overflow: 'hidden',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {content}
          </div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown components={markdownComponents}>
              {content || ''}
            </ReactMarkdown>
            {isStreaming && !content && (
              <span className="typing-dots">
                <span>●</span><span>●</span><span>●</span>
              </span>
            )}
          </div>
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

const ChatMessage = React.memo(ChatMessageInner);
export default ChatMessage;
