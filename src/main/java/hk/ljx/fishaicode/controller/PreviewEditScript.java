package hk.ljx.fishaicode.controller;

final class PreviewEditScript {

    private PreviewEditScript() {
    }

    static String content() {
        return """
                (() => {
                  if (window.__fishEditModeLoaded) return;
                  window.__fishEditModeLoaded = true;
                  const source = 'fish-edit-mode';
                  let enabled = false;
                  let selected = null;
                  const overlay = document.createElement('div');
                  overlay.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #36d2be;border-radius:2px;display:none;box-sizing:border-box';
                  document.documentElement.appendChild(overlay);
                  const selector = (element) => {
                    const parts = [];
                    let current = element;
                    while (current && current !== document.body && parts.length < 10) {
                      if (current.id && document.querySelectorAll('#' + CSS.escape(current.id)).length === 1) {
                        parts.unshift('#' + CSS.escape(current.id));
                        break;
                      }
                      const siblings = [...current.parentElement.children].filter((item) => item.tagName === current.tagName);
                      const index = siblings.indexOf(current) + 1;
                      parts.unshift(current.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${index})` : ''));
                      current = current.parentElement;
                    }
                    return ['body', ...parts].join(' > ');
                  };
                  const show = (element, color) => {
                    const rect = element.getBoundingClientRect();
                    overlay.style.display = 'block';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.top = rect.top + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';
                    overlay.style.borderColor = color;
                  };
                  const clear = () => { if (!selected) overlay.style.display = 'none'; };
                  document.addEventListener('mousemove', (event) => {
                    if (!enabled || !event.target || event.target === overlay || event.target === selected) return;
                    show(event.target, '#36d2be');
                  }, true);
                  document.addEventListener('click', (event) => {
                    if (!enabled || !event.target || event.target === overlay) return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    selected = event.target;
                    show(selected, '#f5222d');
                    const rect = selected.getBoundingClientRect();
                    parent.postMessage({ source, type: 'select', element: {
                      tag: selected.tagName,
                      id: selected.id || undefined,
                      className: typeof selected.className === 'string' ? selected.className.trim() || undefined : undefined,
                      textContent: (selected.textContent || '').trim().slice(0, 120),
                      outerHTML: (selected.outerHTML || '').trim().slice(0, 600),
                      selector: selector(selected),
                      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
                    } }, '*');
                  }, true);
                  addEventListener('message', (event) => {
                    const data = event.data;
                    if (!data || data.source !== source) return;
                    if (data.type === 'enable') enabled = true;
                    if (data.type === 'disable') { enabled = false; selected = null; overlay.style.display = 'none'; }
                    if (data.type === 'unselect') { selected = null; overlay.style.display = 'none'; }
                    if (data.type === 'highlight' && data.selector) {
                      const element = document.querySelector(data.selector);
                      if (element) { selected = element; show(element, '#f5222d'); }
                    }
                  });
                  parent.postMessage({ source, type: 'ready' }, '*');
                })();
                """;
    }
}
