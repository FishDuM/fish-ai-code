import { memo, useState, useCallback } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ChatInputProps {
  isStreaming: boolean;
  isBackgroundGenerating: boolean;
  /** 只读模式（非主人非管理员查看他人应用时禁用输入） */
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

function ChatInputInner({ isStreaming, isBackgroundGenerating, disabled, onSend, onCancel }: ChatInputProps) {
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
          placeholder={disabled
            ? '登录后可以编辑此应用'
            : isStreaming
              ? 'AI 正在生成中...'
              : isBackgroundGenerating
                ? '后台正在完成上一轮生成，请稍候...'
                : '描述你想要的网站... (Enter 发送, Shift+Enter 换行)'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={disabled || isStreaming || isBackgroundGenerating}
        />
        {isStreaming ? (
          <Button danger onClick={onCancel}>
            停止
          </Button>
        ) : isBackgroundGenerating ? (
          <Button disabled>后台处理中</Button>
        ) : (
          <Button
            className="btn-gradient"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={disabled}
          >
            发送
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(ChatInputInner);
