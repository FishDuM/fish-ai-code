import { memo, useState, useCallback } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ChatInputProps {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

function ChatInputInner({ isStreaming, onSend, onCancel }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = value.trim();
      if (text) {
        onSend(text);
        setValue('');
      }
    }
  }, [onSend, value]);

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (text) {
      onSend(text);
      setValue('');
    }
  }, [onSend, value]);

  return (
    <div className="chat-input-shell">
      <div className="chat-input-row">
        <Input.TextArea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'AI 正在生成中...' : '描述你想要的网站... (Enter 发送, Shift+Enter 换行)'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button danger onClick={onCancel}>
            停止
          </Button>
        ) : (
          <Button
            className="btn-gradient"
            icon={<SendOutlined />}
            onClick={handleSend}
          >
            发送
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(ChatInputInner);
