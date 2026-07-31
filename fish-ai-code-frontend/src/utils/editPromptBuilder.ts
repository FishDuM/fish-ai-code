import type { SelectedElement } from '@/types/editMode';

function escapeMarkdownFenceContent(value: string): string {
  return value.replace(/```/g, '``\\`');
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
