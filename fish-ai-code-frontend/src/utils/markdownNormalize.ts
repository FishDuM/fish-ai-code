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
 * This helper inserts:
 *   - a newline before any opening fence that immediately follows prose,
 *   - a newline after common language tags when code starts on the same line.
 *   - newlines around closing fences when the model streams
 *     `</html>```###说明` as one physical line.
 *
 * Inline backticks aren't affected because these rules only touch triple
 * fences that look like markdown block fences.
 */
export function normalizeCodeFenceBoundaries(content: string): string {
  if (!content) return content;
  // ``` followed by a language identifier and preceded by a non-whitespace
  // character → inject a newline.
  //
  // 加 `(?<!\x60)` 负向断言：上一字符是反引号时（典型场景：AI 在行内 `` `code` ``
  // 后面紧跟 ```html 起新代码块），不插换行 —— 否则会把单行 inline code 拆散。
  return content
    .replace(/(?<!\x60)(\S)(```[A-Za-z][\w-]*)/g, '$1\n$2')
    .replace(
      /```(html|css|js|javascript|jsx|ts|typescript|tsx|vue|json|xml|svg|markdown|md)[^\S\r\n]*(?=\S)/gi,
      '```$1\n',
    )
    // Closing fence immediately after code content: </html>```###...
    // The negative lookahead keeps opening fences such as ```html intact.
    .replace(/(?<!\x60)([^\r\n])```(?![A-Za-z][\w-]*)/g, '$1\n```')
    // Closing fence immediately followed by markdown/prose: ```###说明.
    .replace(/```[^\S\r\n]*(?![A-Za-z][\w-]*)(?=\S)/g, '```\n');
}

export function normalizeMarkdownForStreaming(content: string): string {
  const normalized = normalizeCodeFenceBoundaries(content);
  const fenceCount = normalized.match(/```/g)?.length ?? 0;
  if (fenceCount % 2 === 1) {
    return `${normalized}\n\`\`\``;
  }
  return normalized;
}
