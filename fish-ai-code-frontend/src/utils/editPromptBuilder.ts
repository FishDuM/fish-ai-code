import type { SelectedElement } from '@/types/editMode';

/**
 * Compose the final prompt sent to the AI backend from a user instruction
 * and (optionally) the element the user selected in edit mode.
 *
 * The backend's `AiCodeGeneratorService` treats the entire query string as
 * a single `@UserMessage`. We embed the element context as a structured
 * prefix so the model clearly separates "what was selected" from "what to
 * change", and we keep the user instruction verbatim at the end.
 *
 * When no element was selected, we pass the user's raw instruction through
 * untouched — preserves the existing chat behaviour for normal messages.
 */
export function buildEditPrompt(
  instruction: string,
  element?: SelectedElement | null,
): string {
  if (!element) return instruction;

  const lines: string[] = [];
  lines.push('用户对页面上的元素提出了修改请求。请只修改下方选中的元素,保持页面其余部分不变,返回修改后的完整 HTML。');
  lines.push('');
  lines.push('【选中元素】');
  lines.push(`- 标签: ${element.tag}`);
  if (element.id) lines.push(`- id: ${element.id}`);
  if (element.className) lines.push(`- class: ${element.className}`);
  if (element.textContent) lines.push(`- 文本内容: ${element.textContent}`);
  lines.push(`- CSS 选择器路径: ${element.selector}`);
  lines.push(`- HTML 片段:`);
  lines.push('```html');
  lines.push(element.outerHTML || `<${element.tag.toLowerCase()}>`);
  lines.push('```');
  lines.push('');
  lines.push('【用户指令】');
  lines.push(instruction.trim());

  return lines.join('\n');
}