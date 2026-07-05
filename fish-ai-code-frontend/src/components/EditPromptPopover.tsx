import { useEffect, useRef, useState, useCallback } from 'react';
import { Input, Button, Space, Tag } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { SendOutlined, CloseOutlined } from '@ant-design/icons';
import type { SelectedElement } from '@/types/editMode';

interface EditPromptPopoverProps {
  /** Selected element metadata from the iframe. */
  element: SelectedElement;
  /**
   * Position in PARENT (page) coordinates — the caller translates the
   * iframe's getBoundingClientRect() + element.rect into a single point.
   * Typically the top-left corner of the selected element, or just below it
   * if the element is near the top of the viewport.
   */
  position: { left: number; top: number };
  /** True while the parent is streaming the AI response. */
  sending: boolean;
  /** Send the composed prompt. Parent composes the full message + starts SSE. */
  onSend: (instruction: string) => void;
  /** Close the popover without sending. */
  onCancel: () => void;
}

const MAX_WIDTH = 360;
const GAP_PX = 8;

/**
 * Floating popover that appears anchored to the element the user selected
 * in the preview iframe. Renders an element summary + a TextArea + send /
 * cancel buttons. Keeps its own draft state, so navigating between
 * selections or hitting cancel doesn't leak text between attempts.
 *
 * Positioning is driven entirely by `position` — this component does not
 * touch the iframe. Translation work happens in Chat.tsx where the iframe
 * ref is in scope.
 */
export default function EditPromptPopover({
  element,
  position,
  sending,
  onSend,
  onCancel,
}: EditPromptPopoverProps) {
  const [draft, setDraft] = useState('');
  // antd 6's Input.TextArea forwards a TextAreaRef (focus/blur/select +
  // nativeElement), not the raw HTMLTextAreaElement.
  const inputRef = useRef<TextAreaRef | null>(null);

  // Focus the textarea as soon as the popover mounts so the user can
  // start typing without an extra click.
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || sending) return;
    onSend(text);
  }, [draft, sending, onSend]);

  // Esc cancels; Enter sends; Shift+Enter keeps the normal textarea newline.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, onCancel],
  );

  // TextArea onChange 提到 useCallback，避免每次 render 重建箭头函数。
  const handleDraftChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value),
    [],
  );

  // 用 state + resize 监听维护视口宽度：原先在 render 期直接读
  // window.innerWidth，窗口缩放或多屏拖动时位置会短暂越界。
  const [viewportW, setViewportW] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;
    const flush = () => {
      rafId = 0;
      setViewportW(window.innerWidth);
    };
    const onResize = () => {
      // rAF 节流：连续 resize 事件合并到下一帧读取一次宽度。
      if (rafId) return;
      rafId = window.requestAnimationFrame(flush);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Clamp the popover inside the visible viewport horizontally so very
  // wide selections near the right edge don't push the card off-screen.
  const left = Math.max(GAP_PX, Math.min(position.left, viewportW - MAX_WIDTH - GAP_PX));

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left,
        top: position.top,
        width: MAX_WIDTH,
        zIndex: 1000,
        background: '#ffffff',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(17, 25, 37, 0.18), 0 2px 6px rgba(17, 25, 37, 0.08)',
        border: '1px solid rgba(17, 25, 37, 0.08)',
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Tag color="green" style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace' }}>
          {element.tag.toLowerCase()}
        </Tag>
        {element.id && (
          <Tag style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace' }}>#{element.id}</Tag>
        )}
        {element.className && (
          <Tag style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            .{element.className.split(/\s+/).slice(0, 2).join('.')}
          </Tag>
        )}
      </div>
      {element.textContent && (
        <div
          style={{
            fontSize: 12,
            color: 'rgba(17, 25, 37, 0.55)',
            marginBottom: 8,
            maxHeight: 36,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={element.textContent}
        >
          {element.textContent}
        </div>
      )}
      <Input.TextArea
        ref={inputRef}
        value={draft}
        onChange={handleDraftChange}
        onKeyDown={handleKeyDown}
        placeholder="告诉 AI 怎么修改这个元素，例如：改成红色圆角"
        autoSize={{ minRows: 2, maxRows: 5 }}
        disabled={sending}
        style={{ marginBottom: 8 }}
      />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<CloseOutlined />} onClick={onCancel} disabled={sending}>
          取消
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={sending}
          disabled={!draft.trim()}
        >
          {sending ? '生成中…' : '发送'}
        </Button>
      </Space>
    </div>
  );
}
