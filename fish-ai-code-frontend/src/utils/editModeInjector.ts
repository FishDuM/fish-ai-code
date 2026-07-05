/**
 * Returns the JavaScript source that gets injected into the preview iframe
 * (srcDoc) when edit mode is enabled. The script wires up:
 *   - a hover overlay that follows the user's mouse,
 *   - click capture that snapshots element metadata and posts it to the
 *     parent window,
 *   - a "highlight" handler that re-paints the overlay when the parent
 *     asks us to focus a specific selector (used after AI regeneration
 *     to keep the user's selection visible on the freshly rendered page).
 *
 * Kept as a TS string (rather than a separate JS file) because the iframe
 * loads via `srcDoc` (about:srcdoc), which has a null origin and refuses
 * to load external scripts.
 *
 * The returned string is intended to be placed inside a <script> tag in
 * HTML. We do NOT pre-escape for HTML here — the caller is responsible
 * for embedding it as raw script content. To keep it safe, we use a single
 * global function name and reference it by ID rather than re-injecting.
 *
 * Any literal "</script>" inside would terminate the enclosing tag early,
 * so we split that one token across a string concat: "</" + "script>".
 */
export function buildEditModeScript(): string {
  // The string body is plain JS. We escape carefully only where the
  // template-literal layer of TS would otherwise interpret the chars.
  // Inside a backtick literal, `\n` is a newline, `\s` is the 2-char
  // sequence backslash-s, `\$` is a literal dollar sign, etc.
  const script = `
(function () {
  function initFishEditMode() {
    if (window.__fishEditModeInjected) return;
    window.__fishEditModeInjected = true;

    var SOURCE = 'fish-edit-mode';
    var HOVER_BORDER = '2px solid #36D2BE';
    var SELECT_BORDER = '2px solid #f5222d';
    var PREFIX = '__em-';
    var enabled = true;

  function cssEscape(s) {
    try {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
      }
    } catch (e) {}
    return String(s).replace(/([^\\w-])/g, '\\$1');
  }

  function isValidCssIdent(s) {
    return /^[A-Za-z_][\\w-]*$/.test(s);
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.body) return 'body';
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur !== document.body && depth < 10) {
      var tag = cur.tagName.toLowerCase();
      if (cur.id && isValidCssIdent(cur.id)) {
        var dup = document.querySelectorAll('#' + cssEscape(cur.id));
        if (dup.length === 1) {
          parts.unshift('#' + cssEscape(cur.id));
          break;
        }
      }
      var parent = cur.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      var sameTag = Array.prototype.filter.call(
        parent.children,
        function (s) { return s.tagName === cur.tagName; }
      );
      var idx = sameTag.indexOf(cur) + 1;
      parts.unshift(sameTag.length > 1 ? (tag + ':nth-of-type(' + idx + ')') : tag);
      cur = parent;
      depth += 1;
    }
    if (cur === document.body && parts.length > 0) parts.unshift('body');
    return parts.join(' > ');
  }

  function truncate(s, maxChars, maxLines) {
    if (!s) return '';
    // 先按换行切分，再对每行单独归一化空白：原实现先归一化所有空白
    // 会把换行也吃掉，后续再按换行切分只能得到 1 行，maxLines 形同虚设。
    var rawLines = String(s).split('\\n');
    var normalized = [];
    for (var i = 0; i < rawLines.length; i++) {
      var line = rawLines[i].replace(/\\s+/g, ' ').trim();
      if (line) normalized.push(line);
    }
    var kept = normalized.slice(0, maxLines || 20);
    var joined = kept.join('\\n');
    if (joined.length <= maxChars) return joined;
    return joined.slice(0, maxChars) + '…';
  }

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-fish-edit-mode', '1');
  styleEl.textContent =
    '.__em-overlay{position:fixed;pointer-events:none;z-index:2147483646;' +
    'border-radius:2px;transition:all 80ms ease-out;box-sizing:border-box;}' +
    '.__em-tooltip{position:fixed;z-index:2147483647;pointer-events:none;' +
    'background:#111925;color:#fff;font:12px/1.4 -apple-system,Segoe UI,sans-serif;' +
    'padding:4px 8px;border-radius:4px;max-width:320px;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);}';
  (document.head || document.documentElement).appendChild(styleEl);

  var overlay = document.createElement('div');
  overlay.className = PREFIX + 'overlay';
  overlay.style.display = 'none';
  document.documentElement.appendChild(overlay);

  var tooltip = document.createElement('div');
  tooltip.className = PREFIX + 'tooltip';
  tooltip.style.display = 'none';
  document.documentElement.appendChild(tooltip);

  var selectedEl = null;

  function clearHover() {
    // 只收起 overlay 显示，不再擦掉 border：原先擦 border 会导致
    // onMouseMove 命中“已选元素”分支时把 SELECT 红框也一起清掉。
    overlay.style.display = 'none';
  }

  function applyHover(el) {
    var r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.border = HOVER_BORDER;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.max(4, r.left) + 'px';
    tooltip.style.top = Math.max(4, r.top - 24) + 'px';
    var label = el.tagName.toLowerCase();
    if (el.id) label += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cn = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      if (cn) label += '.' + cn;
    }
    tooltip.textContent = label;
  }

  // 用 rAF 把 mousemove 的 getBoundingClientRect 读 + 5 个 inline style 写
  // 合并到下一帧执行，避免每个 mousemove 事件都触发同步 layout thrashing。
  var pendingHoverTarget = null;
  var hoverRafId = 0;
  function scheduleHover(el) {
    pendingHoverTarget = el;
    if (hoverRafId) return;
    hoverRafId = (window.requestAnimationFrame || function (cb) {
      return window.setTimeout(cb, 16);
    })(function () {
      hoverRafId = 0;
      var target = pendingHoverTarget;
      pendingHoverTarget = null;
      if (!target) return;
      applyHover(target);
    });
  }

  function onMouseMove(e) {
    if (!enabled) return;
    var t = e.target;
    if (!t || t === overlay || t === tooltip) return;
    if (selectedEl && (t === selectedEl || selectedEl.contains(t))) {
      // 鼠标在已选中元素上时直接 return，不要调 clearHover()：
      // clearHover 会把 border 重置，导致用户看不到选中反馈。
      return;
    }
    scheduleHover(t);
  }

  function onClick(e) {
    if (!enabled) return;
    var t = e.target;
    if (!t || t === overlay || t === tooltip) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    if (selectedEl === t) {
      selectedEl = null;
      overlay.style.border = HOVER_BORDER;
      window.parent.postMessage({ source: SOURCE, type: 'select', element: null }, '*');
      return;
    }
    selectedEl = t;
    var r = t.getBoundingClientRect();
    overlay.style.border = SELECT_BORDER;
    var payload = {
      source: SOURCE,
      type: 'select',
      element: {
        tag: t.tagName,
        id: t.id || undefined,
        className: (typeof t.className === 'string' ? t.className.trim() : '') || undefined,
        textContent: truncate(t.textContent || '', 120, 4),
        outerHTML: truncate(t.outerHTML || '', 600, 20),
        selector: buildSelector(t),
        rect: { x: r.left, y: r.top, width: r.width, height: r.height }
      }
    };
    window.parent.postMessage(payload, '*');
  }

  function highlightSelector(selector) {
    if (!selector) return;
    try {
      var el = document.querySelector(selector);
      if (!el) return;
      var r = el.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.left = r.left + 'px';
      overlay.style.top = r.top + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = r.height + 'px';
      overlay.style.border = SELECT_BORDER;
      selectedEl = el;
      var label = el.tagName.toLowerCase();
      if (el.id) label += '#' + el.id;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.max(4, r.left) + 'px';
      tooltip.style.top = Math.max(4, r.top - 24) + 'px';
      tooltip.textContent = label + ' (last selected)';
    } catch (err) {}
  }

  function onMessage(e) {
    var d = e.data;
    if (!d || d.source !== SOURCE) return;
    if (d.type === 'enable') {
      enabled = true;
      document.documentElement.style.cursor = 'crosshair';
    } else if (d.type === 'disable') {
      enabled = false;
      selectedEl = null;
      clearHover();
      if (tooltip && tooltip.parentNode) tooltip.style.display = 'none';
      document.documentElement.style.cursor = '';
    } else if (d.type === 'highlight') {
      if (!enabled) return;
      highlightSelector(d.selector);
    } else if (d.type === 'unselect') {
      selectedEl = null;
      // 取消选中时一并收起 overlay，否则会留下一个孤儿悬浮框。
      clearHover();
      if (tooltip && tooltip.parentNode) tooltip.style.display = 'none';
    }
  }

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseleave', clearHover, true);
    window.addEventListener('message', onMessage);
    document.documentElement.style.cursor = 'crosshair';
    window.parent.postMessage({ source: SOURCE, type: 'ready' }, '*');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFishEditMode, { once: true });
  } else {
    initFishEditMode();
  }
})();
`;
  // Defensive: if the script ever contains a literal closing tag we split
  // it so it can't terminate the enclosing <script> element early.
  return script.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Returns the HTML wrapper that should be appended to a preview srcDoc to
 * enable edit mode. The actual <script> tag is generated here so callers
 * don't have to know about the "</script>" escaping rule.
 */
export function wrapEditModeScript(script: string): string {
  return `<script>${script}</script>`;
}

/**
 * Given a preview srcDoc and the edit-mode flag, returns the srcDoc that
 * should actually be passed to the iframe. We append the injector only
 * when edit mode is on; turning edit mode off is just a re-render with
 * `editMode=false` — no need to clean up DOM inside the iframe.
 */
export function applyEditModeToSrcDoc(srcDoc: string, editMode: boolean): string {
  if (!editMode || !srcDoc) return srcDoc;
  const script = buildEditModeScript();
  const wrapper = wrapEditModeScript(script);

  // If the doc already has a <body> tag, inject before its closing tag.
  // Otherwise (rare: doc is just a fragment), inject at the end. We use
  // a case-insensitive match because authors write <BODY> too.
  const closeBody = /<\/body\s*>/i;
  if (closeBody.test(srcDoc)) {
    return srcDoc.replace(closeBody, wrapper + '</body>');
  }
  const closeHtml = /<\/html\s*>/i;
  if (closeHtml.test(srcDoc)) {
    return srcDoc.replace(closeHtml, wrapper + '</html>');
  }
  return srcDoc + wrapper;
}
