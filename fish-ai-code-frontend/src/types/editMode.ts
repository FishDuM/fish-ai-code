/**
 * Types for the AI-generated-site visual edit mode.
 *
 * The user toggles "edit mode" from the Preview tab. While edit mode is on,
 * the preview iframe injects a small script that highlights elements on
 * hover and, on click, sends the element's metadata back to the parent
 * window via postMessage. The parent renders a prompt popover; on submit it
 * composes a structured message ("element context + user instruction") and
 * feeds it into the existing SSE chat pipeline.
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
