/**
 * Parsed code blocks from AI's markdown response
 */
export interface ParsedCode {
  htmlCode: string;
  cssCode: string;
  jsCode: string;
}

const HTML_CODE_PATTERN = /```html\s*\n([\s\S]*?)```/i;
const CSS_CODE_PATTERN = /```css\s*\n([\s\S]*?)```/i;
const JS_CODE_PATTERN = /```(?:js|javascript)\s*\n([\s\S]*?)```/i;

function extractFirst(pattern: RegExp, content: string): string {
  const match = pattern.exec(content);
  return match ? match[1].trim() : '';
}

/**
 * Parse multi-file code from AI's markdown response.
 * Extracts ```html, ```css, ```js code blocks.
 */
export function parseMultiFileCode(rawCode: string): ParsedCode {
  return {
    htmlCode: extractFirst(HTML_CODE_PATTERN, rawCode),
    cssCode: extractFirst(CSS_CODE_PATTERN, rawCode),
    jsCode: extractFirst(JS_CODE_PATTERN, rawCode),
  };
}

/**
 * Parse single-file HTML code from AI's markdown response.
 * If ```html block exists, extract it; otherwise use raw content as-is.
 */
export function parseHtmlCode(rawCode: string): string {
  const extracted = extractFirst(HTML_CODE_PATTERN, rawCode);
  return extracted || rawCode.trim();
}

/**
 * Merge HTML + CSS + JS into a single HTML document for iframe srcDoc.
 */
export function mergeToHtmlDoc(code: ParsedCode): string {
  const html = code.htmlCode || '<body></body>';
  const hasHead = html.includes('<head>') || html.includes('<Head>');
  const styleTag = code.cssCode ? `<style>\n${code.cssCode}\n</style>` : '';
  const scriptTag = code.jsCode ? `<script>\n${code.jsCode}\n<\/script>` : '';

  if (hasHead) {
    // Inject style into <head> and script before </body>
    let result = html.replace(/<head>/i, `<head>\n${styleTag}`);
    if (html.includes('</body>')) {
      result = result.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    } else {
      result += `\n${scriptTag}`;
    }
    return result;
  }
  return `${styleTag}\n${html}\n${scriptTag}`;
}
