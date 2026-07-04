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
 * This helper inserts a newline before any opening fence — ```html,
 * ```css, ```js, ```typescript, etc. — that immediately follows a
 * non-whitespace character. Closing fences (``` on its own) and inline
 * backticks aren't affected because they don't carry a language
 * identifier.
 */
export function normalizeMarkdownForStreaming(content: string): string {
  if (!content) return content;
  // ``` followed by a language identifier ([A-Za-z][\w-]*) and preceded
  // by a non-whitespace character → inject a newline.
  //
  // 加 `(?<!\x60)` 负向断言：上一字符是反引号时（典型场景：AI 在行内 `` `code` ``
  // 后面紧跟 ```html 起新代码块），不插换行 —— 否则会把单行 inline code 拆散。
  return content.replace(/(?<!\x60)(\S)(```[A-Za-z][\w-]*)/g, '$1\n$2');
}