import { Avatar, Button, App } from 'antd';
import { UserOutlined, RobotOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import React, { useState, useCallback } from 'react';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const [Highlighter, setHighlighter] = useState<React.ComponentType<any> | null>(null);
  const [highlighterStyle, setHighlighterStyle] = useState<any>(null);
  const { message } = App.useApp();

  // Lazy-load the heavy syntax highlighter (~400KB) on first code block render
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hlMod, styleMod] = await Promise.all([
          import('react-syntax-highlighter/dist/esm/prism-light'),
          import('react-syntax-highlighter/dist/esm/styles/prism/one-dark'),
        ]);
        if (cancelled) return;
        setHighlighter(() => hlMod.default);
        setHighlighterStyle(styleMod.default);
      } catch {
        // Fallback for different bundler resolutions
        try {
          const hlFull = await import('react-syntax-highlighter');
          if (cancelled) return;
          setHighlighter(() => hlFull.Prism);
          const styleFull = await import('react-syntax-highlighter/dist/esm/styles/prism');
          if (!cancelled) setHighlighterStyle(styleFull.oneDark);
        } catch {
          // Stay with fallback <pre> rendering
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      {Highlighter && highlighterStyle ? (
        <Highlighter
          language={language || 'text'}
          style={highlighterStyle}
          customStyle={{
            margin: 0,
            borderRadius: '0 0 8px 8px',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {children}
        </Highlighter>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '0 0 8px 8px',
            fontSize: 13,
            lineHeight: 1.5,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {children}
        </pre>
      )}
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
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#36D2BE' }}>
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
          style={{ backgroundColor: '#36D2BE', flexShrink: 0 }}
        />
      )}
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: isUser ? '#111925' : 'rgba(17,25,37,0.05)',
          color: isUser ? '#fff' : '#111925',
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
            {isStreaming ? (
              // During streaming: skip heavy markdown/syntax-highlighter, render as plain code
              <div style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {content || (
                  <span className="typing-dots">
                    <span>●</span><span>●</span><span>●</span>
                  </span>
                )}
              </div>
            ) : (
              <ReactMarkdown components={markdownComponents}>
                {content || ''}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <Avatar
          size="small"
          icon={<UserOutlined />}
          style={{ backgroundColor: '#111925', flexShrink: 0 }}
        />
      )}
    </div>
  );
}

const ChatMessage = React.memo(ChatMessageInner);
export default ChatMessage;
