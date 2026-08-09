/**
 * Streaming-friendly markdown normalisation.
 *
 * CommonMark requires fenced code blocks to start at the beginning of a
 * line (with up to 3 spaces of leading indentation). When the AI streams
 * a response it often concatenates the opening prose and the code fence
 * onto the same physical line — e.g.
 *
 *     好的，我来帮您```html
 *     <!DOCTYPE html>...
 *
 * react-markdown (via remark) parses this as a single paragraph with
 * literal backticks and inline-escaped HTML, which renders as a wall of
 * text rather than a properly formatted code block.
 *
 * This helper scans line by line, tracking open/close fence state, and:
 *   - inserts a newline before an opening fence that follows prose,
 *   - splits `</html>```css` (closing fence fused with next opening fence),
 *   - splits language tags fused with first code line (` ```css body{}`),
 *   - splits a closing fence fused with trailing prose (` ```###说明`).
 *
 * Inline backticks aren't affected because these rules only touch fence
 * sequences (3+ backticks) in line-leading or content-fusing positions.
 */

// 已知语言名单：围栏后跟这些词才被认为是"开围栏 + 语言名"，
// 避免把代码内容里的 ```` ``` ```` 误判为围栏
const KNOWN_LANGS = new Set([
  'html', 'css', 'js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx',
  'vue', 'json', 'xml', 'svg', 'markdown', 'md', 'bash', 'sh', 'python',
  'java', 'c', 'cpp', 'csharp', 'sql', 'yaml', 'yml', 'docker', 'text',
]);

// 行内围栏：3+ 反引号，前可有内容（用于拼接修复），后可有语言名/内容
const FENCE_IN_LINE_RE = /(`{3,})([^\r\n]*)$/;

function extractFenceLang(rest: string): { lang: string; afterLang: string } {
  const m = /^\s*([A-Za-z][\w-]*)/.exec(rest);
  if (m && KNOWN_LANGS.has(m[1].toLowerCase())) {
    return { lang: m[1], afterLang: rest.slice(m[1].length) };
  }
  // 无已知语言名：afterLang 原样返回，由调用方决定如何处理围栏后的内容
  return { lang: '', afterLang: rest };
}

/**
 * 修复行内围栏拼接：把"内容 + 围栏"、"围栏 + 语言名 + 代码首行"、
 * "闭合围栏 + 后续文字"拆成独立行。
 *
 * @param inCodeBlock 当前是否在代码块内（用于区分"内容行的反引号"与"闭合围栏"）
 * @returns 修复后的行数组（可能多行），并更新 inCodeBlock 状态
 */
function fixFenceLine(line: string, inCodeBlock: boolean): { lines: string[]; inCodeBlock: boolean } {
  const fenceMatch = FENCE_IN_LINE_RE.exec(line);
  if (!fenceMatch) {
    return { lines: [line], inCodeBlock };
  }

  const fence = fenceMatch[1];
  const before = line.slice(0, fenceMatch.index);
  const rest = fenceMatch[2];
  const { lang, afterLang } = extractFenceLang(rest);
  const afterLangTrimmed = afterLang.trim();

  // 围栏在行首（前面只有空白）
  if (before.trim() === '') {
    if (!lang) {
      // 行首 ``` 无语言名：可能是开围栏（```\n）或闭合围栏（``` + 后续文字）
      if (afterLangTrimmed) {
        // ```###说明 → 闭合围栏 + 后续文字拆行；inCodeBlock 从代码块内切换出来
        return { lines: [fence, afterLangTrimmed], inCodeBlock: false };
      }
      // 纯 ``` 行：翻转状态
      return { lines: [line], inCodeBlock: !inCodeBlock };
    }
    // ```css body{} → 语言名与代码首行拆行
    const lines = afterLangTrimmed ? [fence + lang, afterLangTrimmed] : [fence + lang];
    return { lines, inCodeBlock: true };
  }

  // 围栏前有内容
  if (!inCodeBlock) {
    // 普通文本 + 开围栏：好的，我来帮您```html → 拆行
    const lines = lang
      ? [before.trimEnd(), fence + lang, ...(afterLangTrimmed ? [afterLangTrimmed] : [])]
      : afterLangTrimmed
        ? [before.trimEnd(), fence, afterLangTrimmed]
        : [before.trimEnd(), fence];
    return { lines, inCodeBlock: true };
  }

  // 在代码块内，围栏前是代码内容：</html>```css
  // 先闭合当前代码块，再尝试打开新代码块
  const lines = [before.trimEnd(), fence];
  if (lang) {
    lines.push(fence + lang);
    if (afterLangTrimmed) {
      lines.push(afterLangTrimmed);
    }
    return { lines, inCodeBlock: true };
  }
  if (afterLangTrimmed) {
    lines.push(afterLangTrimmed);
  }
  return { lines, inCodeBlock: false };
}

export function normalizeCodeFenceBoundaries(content: string): string {
  if (!content) return content;
  let inCodeBlock = false;
  const outLines: string[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const { lines, inCodeBlock: next } = fixFenceLine(line, inCodeBlock);
    inCodeBlock = next;
    outLines.push(...lines);
  }
  return outLines.join('\n');
}

export function normalizeMarkdownForStreaming(content: string): string {
  const normalized = normalizeCodeFenceBoundaries(content);
  // 与 normalizeCodeFenceBoundaries 相同的状态机判断结尾是否在代码块内，
  // 流式未闭合时补一个结束围栏
  let inCodeBlock = false;
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    ({ inCodeBlock } = fixFenceLine(line, inCodeBlock));
  }
  if (inCodeBlock) {
    return `${normalized}\n\`\`\``;
  }
  return normalized;
}
