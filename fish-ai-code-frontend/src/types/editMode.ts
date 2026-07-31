/**
 * AI 生成站点的可视化编辑模式类型：iframe 内高亮元素，点击后经 postMessage
 * 回传元素元数据，由父窗口组装 prompt 走 SSE 聊天链路。
 */

export interface SelectedElement {
  /** Tag name in upper case, e.g. "BUTTON". */
  tag: string;
  /** Element id attribute, if any. */
  id?: string;
  /** Element className string, if any. */
  className?: string;
  /** Truncated visible text (already trimmed, length-bounded). */
  textContent: string;
  /** Truncated outerHTML snapshot of the element (already trimmed). */
  outerHTML: string;
  /**
   * Unique CSS selector path from <body> down to this element. Built with
   * nth-of-type so it still resolves after the AI rewrites the page.
   */
  selector: string;
  /** Bounding rect in viewport coordinates — used to anchor the popover. */
  rect: { x: number; y: number; width: number; height: number };
}

/** Discriminator carried on every postMessage from the iframe. */
export const EDIT_MODE_SOURCE = 'fish-edit-mode';

export type EditModePostMessage =
  | {
      source: typeof EDIT_MODE_SOURCE;
      type: 'select';
      element: SelectedElement | null;
    }
  | {
      source: typeof EDIT_MODE_SOURCE;
      type: 'ready';
    };

/** Messages the parent sends back into the iframe to toggle behaviour. */
export type EditModeControlMessage =
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'highlight'; selector: string | null }
  | { type: 'unselect' };
