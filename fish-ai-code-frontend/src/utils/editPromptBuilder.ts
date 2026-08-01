import type { SelectedElement } from '@/types/editMode';

function escapeMarkdownFenceContent(value: string): string {
  return value.replace(/```/g, '``\\`');
}

/**
 * 组装批量编辑 prompt：把多条"选中元素 + 修改指令"合并为一次请求，
 * 让 AI 一次性修改全部元素。每条编辑一个【修改项】块。
 */
export function buildBatchEditPrompt(
  edits: Array<{ element: SelectedElement; instruction: string }>,
): string {
  if (edits.length === 0) return '';
  if (edits.length === 1) {
    return buildEditPrompt(edits[0].instruction, edits[0].element);
  }

  const lines: string[] = [];
  lines.push('用户对页面上的多个元素提出了修改请求。请一次性完成以下全部修改,保持页面其余部分不变,并按当前应用类型返回修改后的完整代码。');
  lines.push('');
  edits.forEach((edit, idx) => {
    const { element, instruction } = edit;
    lines.push(`【修改项 ${idx + 1}】`);
    lines.push(`- 标签: ${element.tag}`);
    if (element.id) lines.push(`- id: ${element.id}`);
    if (element.className) lines.push(`- class: ${element.className}`);
    if (element.textContent) lines.push(`- 文本内容: ${element.textContent}`);
    lines.push(`- CSS 选择器路径: ${element.selector}`);
    lines.push(`- HTML 片段:`);
    lines.push('```html');
    lines.push(escapeMarkdownFenceContent(element.outerHTML || `<${element.tag.toLowerCase()}>`));
    lines.push('```');
    lines.push(`- 修改要求: ${instruction.trim()}`);
    lines.push('');
  });
  lines.push('请完整执行以上所有修改项,不要遗漏任何一项。');

  return lines.join('\n');
}

/**
 * 组装发送给 AI 的最终 prompt：将选中元素信息作为结构化前缀注入，
 * 用户指令原样保留在末尾（无选中元素时原样透传，保持普通聊天行为）。
 */
export function buildEditPrompt(
  instruction: string,
  element?: SelectedElement | null,
): string {
  if (!element) return instruction;

  const lines: string[] = [];
  lines.push('用户对页面上的元素提出了修改请求。请只修改下方选中的元素,保持页面其余部分不变,并按当前应用类型返回修改后的完整代码。');
  lines.push('');
  lines.push('【选中元素】');
  lines.push(`- 标签: ${element.tag}`);
  if (element.id) lines.push(`- id: ${element.id}`);
  if (element.className) lines.push(`- class: ${element.className}`);
  if (element.textContent) lines.push(`- 文本内容: ${element.textContent}`);
  lines.push(`- CSS 选择器路径: ${element.selector}`);
  lines.push(`- HTML 片段:`);
  lines.push('```html');
  lines.push(escapeMarkdownFenceContent(element.outerHTML || `<${element.tag.toLowerCase()}>`));
  lines.push('```');
  lines.push('');
  lines.push('【用户指令】');
  lines.push(instruction.trim());

  return lines.join('\n');
}
