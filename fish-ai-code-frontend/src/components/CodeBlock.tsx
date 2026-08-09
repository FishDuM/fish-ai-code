import { Button, App } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useHighlighter } from '@/hooks/useHighlighter';

// 流式期间 markdown 节流触发的 re-render 不会重建此子树（props 不变则跳过高亮器重 tokenize）
const CodeBlock = React.memo(function CodeBlock({
  language,
  children,
  rawCode,
  isStreaming = false,
}: {
  language: string;
  /** 展示用代码（可经格式化，仅用于渲染） */
  children: string;
  /** 复制用原始代码：不传时回退到 children（未格式化场景） */
  rawCode?: string;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const highlighter = useHighlighter(language || undefined);
  const { message } = App.useApp();
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      // 复制原始代码而非展示层格式化后的字符串
      await navigator.clipboard.writeText(rawCode ?? children);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('复制失败');
    }
  }, [rawCode, children, message]);

  const codeBlockStyle: React.CSSProperties = {
    margin: 0,
    borderRadius: '0 0 8px 8px',
    fontSize: 13,
    lineHeight: 1.5,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  };

  return (
    <div style={{ position: 'relative', margin: '8px 0', maxWidth: '100%', minWidth: 0 }}>
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
          boxSizing: 'border-box',
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
      {!isStreaming && highlighter ? (
        <highlighter.Component
          language={language || 'text'}
          style={highlighter.style}
          codeTagProps={{
            // one-dark 会给每个 token 加 text-shadow，关掉让代码更清晰
            style: {
              textShadow: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            },
          }}
          customStyle={codeBlockStyle}
        >
          {children}
        </highlighter.Component>
      ) : (
        <pre
          style={{
            ...codeBlockStyle,
            padding: 16,
            background: '#1e1e1e',
            color: '#d4d4d4',
            overflowY: 'auto',
          }}
        >
          {children}
        </pre>
      )}
    </div>
  );
});

export default CodeBlock;
