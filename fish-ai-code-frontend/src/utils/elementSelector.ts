/**
 * Build a unique CSS selector path for a DOM element.
 *
 * Used by the edit-mode injector: when the user clicks an element inside the
 * preview iframe, we capture a selector that the AI can re-use to find the
 * same element after it rewrites the page. nth-of-type handles the common
 * case of repeated siblings (e.g. several <li> in a list).
 *
 * We intentionally avoid relying on id/class alone — both are frequently
 * absent on AI-generated markup, and class names are often generic
 * (".card", ".container") so they'd match multiple elements.
 */
export function buildCssSelector(el: Element): string {
  if (!el || el.nodeType !== 1) return '';
  if (el === document.body) return 'body';

  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  const MAX_DEPTH = 10;

  while (cur && cur !== document.body && depth < MAX_DEPTH) {
    const tag = cur.tagName.toLowerCase();

    // Prefer id when it's unique and a valid CSS identifier.
    if (cur.id && isUniqueById(cur)) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }

    const parent: Element | null = cur.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    // Gather same-tag siblings via an explicit loop. Using Array.from on
    // HTMLCollection confuses some TS versions when the generic can't be
    // inferred from a bare HTMLCollection (Element type not propagated).
    const sameTagSiblings: Element[] = [];
    for (const child of Array.from(parent.children)) {
      if (child.tagName === cur.tagName) sameTagSiblings.push(child);
    }
    const idx = sameTagSiblings.indexOf(cur) + 1;
    parts.unshift(
      sameTagSiblings.length > 1
        ? `${tag}:nth-of-type(${idx})`
        : tag,
    );
    cur = parent;
    depth += 1;
  }

  if (cur === document.body && parts.length > 0) {
    parts.unshift('body');
  }

  return parts.join(' > ');
}

function isUniqueById(el: Element): boolean {
  if (!el.id) return false;
  if (!isValidCssIdent(el.id)) return false;
  return document.querySelectorAll(`#${cssEscape(el.id)}`).length === 1;
}

/**
 * Conservative CSS identifier check — `#foo bar` would be invalid as an id
 * selector. We only treat the id as safe to splice when it's letters,
 * digits, dashes and underscores.
 */
function isValidCssIdent(s: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(s);
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/([^\w-])/g, '\\$1');
}

/**
 * Truncate a string for inclusion in a chat message — bounded both by
 * character count and line count, so the AI prompt stays well-formed and we
 * don't blow the message budget with a 50KB outerHTML.
 */
export function truncate(s: string, maxChars = 600, maxLines = 20): string {
  if (!s) return '';
  // 先按换行切分，再对每行单独归一化空白：原实现先 replace(/\s+/g,' ')
  // 会把换行也吃掉，后续 split('\n') 只能得到 1 行，maxLines 形同虚设。
  const rawLines = String(s).split('\n');
  const normalized: string[] = [];
  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line) normalized.push(line);
  }
  const kept = normalized.slice(0, maxLines).join('\n');
  if (kept.length <= maxChars) return kept;
  return kept.slice(0, maxChars) + '…';
}