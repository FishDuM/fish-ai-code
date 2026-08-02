import { memo, useState, useCallback } from 'react';
import { Input, Button, Tag, Tooltip } from 'antd';
import { SendOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { SelectedElement } from '@/types/editMode';

interface PendingEditItem {
  id: string;
  element: SelectedElement;
  instruction: string;
}

interface ChatInputProps {
  isStreaming: boolean;
  isBackgroundGenerating: boolean;
  /** 准备中：请求已发出但后端还在校验/收集素材/增强提示词，首个 chunk 未到 */
  preparing?: boolean;
  /** 只读模式（非主人非管理员查看他人应用时禁用输入） */
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  /** 编辑模式：输入框切换为"批量编辑队列 + 保存" */
  editMode?: boolean;
  pendingEdits?: PendingEditItem[];
  savingEdits?: boolean;
  onRemoveEdit?: (id: string) => void;
  onSaveEdits?: () => void;
}

export const MAX_EDITS = 15;

function ChatInputInner({
  isStreaming,
  isBackgroundGenerating,
  preparing = false,
  disabled,
  onSend,
  onCancel,
  editMode = false,
  pendingEdits = [],
  savingEdits = false,
  onRemoveEdit,
  onSaveEdits,
}: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 输入法选词回车（composition 中）不触发发送
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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

  const canSave = pendingEdits.length > 0 && !savingEdits && !isStreaming && !isBackgroundGenerating;

  return (
    <div className="chat-input-shell">
      {editMode && pendingEdits.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginBottom: 8,
            padding: '8px 10px',
            background: 'rgba(54, 210, 190, 0.06)',
            border: '1px solid rgba(54, 210, 190, 0.25)',
            borderRadius: 8,
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'rgba(17,25,37,0.55)',
              marginBottom: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>批量编辑队列（{pendingEdits.length}/{MAX_EDITS}）</span>
            {!canSave && !savingEdits && isStreaming && (
              <span style={{ color: 'rgba(17,25,37,0.4)' }}>正在生成上一条，完成后继续…</span>
            )}
          </div>
          {pendingEdits.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                padding: '3px 6px',
                background: '#fff',
                borderRadius: 6,
                border: '1px solid rgba(17,25,37,0.06)',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: '#36D2BE',
                  color: '#fff',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontWeight: 600,
                }}
              >
                {idx + 1}
              </span>
              <Tooltip title={item.element.selector}>
                <Tag style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.element.tag.toLowerCase()}
                  {item.element.className ? `.${item.element.className.split(/\s+/)[0]}` : ''}
                </Tag>
              </Tooltip>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'rgba(17,25,37,0.75)',
                }}
              >
                {item.instruction}
              </span>
              {!savingEdits && (
                <CloseCircleOutlined
                  style={{ color: 'rgba(17,25,37,0.35)', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => onRemoveEdit?.(item.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <Input.TextArea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            editMode
              ? disabled
                ? '登录后可以编辑此应用'
                : '点击预览中的元素并输入修改指令，可批量添加多条后统一发送（最多 15 条）'
              : disabled
                ? '登录后可以编辑此应用'
                : preparing
                  ? '正在校验并准备素材...'
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
            {preparing ? '准备中…' : '停止'}
          </Button>
        ) : isBackgroundGenerating ? (
          <Button disabled>后台处理中</Button>
        ) : editMode ? (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSaveEdits}
            disabled={!canSave}
            loading={savingEdits}
            style={{ background: savingEdits ? undefined : '#36D2BE', borderColor: savingEdits ? undefined : '#36D2BE' }}
          >
            {savingEdits ? '发送中…' : `发送 (${pendingEdits.length})`}
          </Button>
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
