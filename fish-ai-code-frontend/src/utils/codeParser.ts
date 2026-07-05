import { normalizeCodeFenceBoundaries } from './markdownNormalize';

/**
 * Parsed code blocks from AI's markdown response
 */
export interface ParsedCode {
  htmlCode: string;
  cssCode: string;
  jsCode: string;
}

export interface ProjectFile {
  path: string;
  content: string;
}

// CommonMark requires the opening fence and its content to be separated
// by at least one newline, but the AI frequently streams ` ```html<!DOCTYPE...`
// with no newline after the language identifier. The original `\s*\n`
// pattern silently failed in that case, leaking the raw markdown into
// the iframe (where it was parsed as HTML) and the chat panel (where
// react-markdown treated the prose + inline backticks as one big
// paragraph). `\s*` is more permissive — zero-or-more whitespace is
// enough to delimit the language tag from the body.
const HTML_CODE_PATTERN = /```html\s*([\s\S]*?)```/i;
const CSS_CODE_PATTERN = /```css\s*([\s\S]*?)```/i;
const JS_CODE_PATTERN = /```(?:js|javascript)\s*([\s\S]*?)```/i;

// 收集 rawCode 中所有匹配的代码块，按出现顺序拼接。
// CSS / JS 在 AI 多轮增量编辑时会拆成多个 ```css ...``` 补丁，旧实现只取
// 第一个 → 后续补丁被吞 → 用户感觉"改了之后样式没生效"。
function extractAll(pattern: RegExp, content: string): string {
  // 每次新建一个带 g 标志的正则，避免 lastIndex 在多次调用之间残留导致
  // 第二次调用直接从上一次结束的位置继续扫描。
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1] != null) parts.push(m[1].trim());
    // 防御零长度匹配导致的死循环（理论上 [\s\S]*? 不会出现，但加一道保险）。
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return parts.join('\n\n');
}

// Extract a raw HTML document when the model omitted fences. Be conservative:
// prose that merely contains "<div>" should not be treated as iframe srcDoc.
function extractRawHtmlDoc(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (!trimmed) return '';

  const docStart = trimmed.search(/<!doctype\s+html\b|<html\b/i);
  if (docStart >= 0) {
    const doc = trimmed.slice(docStart);
    const endMatch = /<\/html\s*>/i.exec(doc);
    if (!endMatch) return doc.trim();
    return doc.slice(0, endMatch.index + endMatch[0].length).trim();
  }

  if (/^<(body|div|main|section|article)\b/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

// Pattern to extract tool-called files from Vue project output:
// [工具调用] 写入文件 src/App.vue
// ```lang
// content
// ```

// Lightweight FNV-1a 32-bit hash. Used as cache key so we don't keep the
// full rawCode string in memory. Collisions are tolerable here — worst case
// we return a stale parse result (still correct code, just maybe from a
// different input with the same hash).
function hashKey(rawCode: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < rawCode.length; i++) {
    h ^= rawCode.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Simple LRU cache to avoid repeated regex parsing of the same raw code.
// Keyed by a short hash of the raw code (NOT the raw code itself) so a 5MB
// AI response doesn't pin 5MB in the cache map.
const parseCache = new Map<string, ParsedCode>();
const CACHE_MAX = 20;

function extractFirst(pattern: RegExp, content: string): string {
  const match = pattern.exec(content);
  return match ? match[1].trim() : '';
}

/**
 * Parse multi-file code from AI's markdown response.
 * Extracts ```html, ```css, ```js code blocks.
 * Results are cached (by content hash) to avoid redundant regex execution.
 *
 * 增量编辑语义：当 rawCode 里没有 ```html 块、且原文不像完整 HTML 文档时，
 * 返回 `htmlCode: ''` 的空标记 —— 由调用方（Chat.tsx 的 buildPreviewHtml）
 * 决定是清空 iframe 还是保留旧预览。CSS/JS 仍然照常收集（代码预览 tab 用得到）。
 */
export function parseMultiFileCode(rawCode: string): ParsedCode {
  const normalizedRaw = normalizeCodeFenceBoundaries(rawCode);
  const key = hashKey(normalizedRaw);
  const cached = parseCache.get(key);
  if (cached) return cached;

  const htmlBlocks = extractFirst(HTML_CODE_PATTERN, normalizedRaw);
  const cssBlocks = extractAll(CSS_CODE_PATTERN, normalizedRaw);
  const jsBlocks = extractAll(JS_CODE_PATTERN, normalizedRaw);

  let htmlCode = htmlBlocks;
  if (!htmlCode) {
    htmlCode = extractRawHtmlDoc(normalizedRaw);
  }
  if (!htmlCode) {
    // 空标记：调用方需根据此信号决定是否保留旧预览。
    const empty: ParsedCode = { htmlCode: '', cssCode: cssBlocks, jsCode: jsBlocks };
    if (parseCache.size >= CACHE_MAX) {
      const firstKey = parseCache.keys().next().value;
      if (firstKey !== undefined) parseCache.delete(firstKey);
    }
    parseCache.set(key, empty);
    return empty;
  }

  const result: ParsedCode = {
    htmlCode,
    cssCode: cssBlocks,
    jsCode: jsBlocks,
  };

  if (parseCache.size >= CACHE_MAX) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(key, result);

  return result;
}

/**
 * Extract file list from Vue project AI output text.
 * The backend formats tool calls as:
 *   [工具调用] 写入文件 src/App.vue
 *   ```vue
 *   content
 *   ```
 */
export function extractVueProjectFiles(rawCode: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const seenPaths = new Set<string>();

  // Reset regex state (global regex needs to be fresh each call)
  const regex = /\[工具调用\] 写入文件\s+([^\n]+)\n```(?:\w+)?\n([\s\S]*?)```/gi;
  let match;

  while ((match = regex.exec(rawCode)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();
    if (filePath && content && !seenPaths.has(filePath)) {
      seenPaths.add(filePath);
      files.push({ path: filePath, content });
    }
  }

  return files;
}

/**
 * Clean Vue project AI output for display in the chat panel.
 * Strips internal tool-call markers, replaces them with a friendly icon,
 * and collapses excessive blank lines.
 */
export function cleanVueOutput(rawCode: string): string {
  return rawCode
    .replace(/\[选择工具\][\s\S]*?(?=\n?\[(?:选择工具|工具调用)\]|$)/g, '')
    .replace(/\[工具调用\] 写入文件 /g, '📄 ')
    .replace(/\[工具调用\] 修改文件 /g, '🛠️ ')
    .replace(/\[工具调用\] 删除文件 /g, '🗑️ ')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

/**
 * Parse single-file HTML code from AI's markdown response.
 *
 * - If ```html block exists, extract its content.
 * - Else if rawCode 本身像完整 HTML 文档（<html|<body|<div|...），直接返回原文。
 * - 否则返回 '' —— 增量编辑场景下 AI 只补 ```css 补丁时，调用方应根据空字符串
 *   决定是清空 iframe 还是保留旧预览。
 */
export function parseHtmlCode(rawCode: string): string {
  const normalizedRaw = normalizeCodeFenceBoundaries(rawCode);
  const extracted = extractFirst(HTML_CODE_PATTERN, normalizedRaw);
  if (extracted) return extracted;
  return extractRawHtmlDoc(normalizedRaw);
}

/**
 * Escape any `</script>` substring inside AI-generated JS so it doesn't
 * terminate the outer <script> tag in the preview iframe. Without this, a
 * string literal like `const s = "</script>"` would close the script early.
 */
function escapeScriptClose(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/**
 * Merge HTML + CSS + JS into a single HTML document for iframe srcDoc.
 *
 * The injection regexes accept attributes (or whitespace) on the opening
 * tag — AI models frequently emit `<head lang="en">` or `<head >`, and a
 * strict `<head>` match would silently drop the injected style/script
 * even though `hasHead` detected the element. That mismatch is exactly
 * what caused the "CSS missing after generation" bug.
 */
export function mergeToHtmlDoc(code: ParsedCode): string {
  const html = code.htmlCode || '<body></body>';
  const hasHead = /<head[\s>]/i.test(html);
  const styleTag = code.cssCode ? `<style>\n${code.cssCode}\n</style>` : '';
  const scriptTag = code.jsCode ? `<script>\n${escapeScriptClose(code.jsCode)}\n</script>` : '';

  if (hasHead) {
    // Capture any attributes / whitespace after `<head` and preserve them
    // in the replacement so we don't strip `<head class="x">` down to `<head>`.
    let result = html.replace(/<head(\s[^>]*)?>/i, `<head$1>\n${styleTag}`);
    if (/<\/body\s*>/i.test(html)) {
      // Same permissiveness for the closing tag.
      result = result.replace(/<\/body(\s[^>]*)?>/i, `${scriptTag}\n</body$1>`);
    } else {
      result += `\n${scriptTag}`;
    }
    return result;
  }
  return `${styleTag}\n${html}\n${scriptTag}`;
}
