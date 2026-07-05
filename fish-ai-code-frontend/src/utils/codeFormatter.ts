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

  if (tokens.length <= 1) return code;

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

  if (lang === 'html' || lang === 'markup' || lang === 'xml' || lang === 'svg') {
    return formatHtmlLike(code);
  }
  return formatBraces(code);
}
