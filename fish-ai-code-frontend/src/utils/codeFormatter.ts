const FORMATTABLE_LANGS = new Set([
  'html',
  'markup',
  'xml',
  'svg',
  'css',
  'js',
  'javascript',
  'jsx',
  'ts',
  'typescript',
  'tsx',
]);

// 按格式化方式分组：HTML 类按标签拆行（formatHtmlLike），花括号类按 {}; 拆行（formatBraces）。
// 分组用于引号检测与长单行跳过，避免每处各写一份语言名单。
const HTML_LIKE_LANGS = new Set(['html', 'markup', 'xml', 'svg']);
const BRACE_LANGS = new Set(['css', 'js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx']);

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function normalizeCompactHtml(code: string): string {
  return code
    .replace(/<!DOCTYPEhtml>/gi, '<!DOCTYPE html>')
    .replace(/<([a-z][\w-]*)(?=(?:id|class|style|src|href|alt|title|type|rel|name|content|charset|lang|data-|aria-|role|onclick|onload)=)/gi, '<$1 ')
    .replace(/\s+(id|class|style|src|href|alt|title|type|rel|name|content|charset|lang|role)=/gi, ' $1=')
    .replace(/<metacharset=/gi, '<meta charset=')
    .replace(/<metaname=/gi, '<meta name=')
    .replace(/<linkrel=/gi, '<link rel=')
    .replace(/<scriptsrc=/gi, '<script src=');
}

function formatHtmlLike(code: string): string {
  const compact = normalizeCompactHtml(code).trim();
  if (!compact) return code;

  const tokens = compact
    .replace(/>\s*</g, '><')
    .split(/(<[^>]+>)/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length <= 1) return compact;

  const lines: string[] = [];
  let indent = 0;

  tokens.forEach((token) => {
    const closeMatch = /^<\/([a-z][\w-]*)/i.exec(token);
    const openMatch = /^<([a-z][\w-]*)\b/i.exec(token);
    const isComment = /^<!--/.test(token);
    const isDoctype = /^<!doctype/i.test(token);
    const isClosing = Boolean(closeMatch);
    const tagName = (openMatch?.[1] || closeMatch?.[1] || '').toLowerCase();
    const isVoid = VOID_HTML_TAGS.has(tagName);
    const isSelfClosing = /\/>$/.test(token);

    if (isClosing) {
      indent = Math.max(0, indent - 1);
    }

    lines.push(`${'  '.repeat(indent)}${token}`);

    if (openMatch && !isClosing && !isVoid && !isSelfClosing && !isComment && !isDoctype) {
      indent += 1;
    }
  });

  return lines.join('\n');
}

/**
 * 检测代码里是否有引号包裹的 { } ;（如 const s = "a;b";、key: "x;y"）。
 * 简单的引号感知扫描：处理单引号、双引号、模板字符串与转义。
 */
function containsPunctuationInQuotes(code: string): boolean {
  let quote: "'" | '"' | '`' | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') {
        i++; // 跳过转义字符
      } else if (ch === quote) {
        quote = null;
      } else if (ch === ';' || ch === '{' || ch === '}') {
        return true;
      }
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    }
  }
  return false;
}

function formatBraces(code: string): string {
  return code
    .replace(/\s*([{};])\s*/g, '$1\n')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .reduce<{ indent: number; lines: string[] }>(
      (acc, rawLine) => {
        const line = rawLine.trim();
        if (!line) return acc;
        if (line.startsWith('}')) acc.indent = Math.max(0, acc.indent - 1);
        acc.lines.push(`${'  '.repeat(acc.indent)}${line}`);
        if (line.endsWith('{')) acc.indent += 1;
        return acc;
      },
      { indent: 0, lines: [] },
    )
    .lines.join('\n');
}

export function formatCodeForDisplay(code: string, language: string): string {
  const lang = language.toLowerCase();
  if (!FORMATTABLE_LANGS.has(lang)) return code;
  if (code.includes('\n') && code.split('\n').length > 4) return code;
  // 流式未闭合的代码块是长单行；对 js/ts 跳过格式化防拆坏字符串字面量。
  // html/css 的格式化是按标签/花括号拆行，长单行（多文件模式模型输出偶尔
  // 压扁成一行）反而需要它来恢复可读性，不能一并跳过。
  if (!code.includes('\n') && code.length > 200 && BRACE_LANGS.has(lang) && lang !== 'css') return code;
  // 引号内出现 { } ; 时（如 const s = "a;b";、css 的 content: "a;b"），
  // formatBraces 拆行会破坏字符串字面量，跳过格式化。HTML 类按标签拆行，
  // 属性引号内容不受影响，无需此检查。
  if (BRACE_LANGS.has(lang) && containsPunctuationInQuotes(code)) return code;

  if (HTML_LIKE_LANGS.has(lang)) {
    return formatHtmlLike(code);
  }
  return formatBraces(code);
}
