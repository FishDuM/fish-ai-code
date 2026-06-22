import { Button, App } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface CodePreviewProps {
  code: string;
  language?: string;
}

export default function CodePreview({ code }: CodePreviewProps) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      message.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Button
        type="text"
        size="small"
        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={handleCopy}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
      >
        {copied ? '已复制' : '复制'}
      </Button>
      <pre
        style={{
          margin: 0,
          padding: '16px',
          paddingTop: '40px',
          background: '#1e1e1e',
          color: '#d4d4d4',
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.6,
          height: '100%',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {code || '// 等待 AI 生成代码...'}
      </pre>
    </div>
  );
}
