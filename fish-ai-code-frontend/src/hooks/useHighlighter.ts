import { useEffect, useSyncExternalStore } from 'react';

// Shape we need from react-syntax-highlighter. We only touch `Component` and
// `style`, so a narrow structural type keeps the consumer honest without
// pulling in the heavy default export type.
export type HighlighterStyle = Record<string, React.CSSProperties>;

export interface HighlighterBundle {
  Component: React.ComponentType<{
    language?: string;
    style?: HighlighterStyle;
    customStyle?: React.CSSProperties;
    // Real prop on react-syntax-highlighter; we use it to override the
    // `text-shadow` baked into one-dark. Keep typing explicit so callers
    // get autocomplete for the inner `style` object.
    codeTagProps?: { style?: React.CSSProperties };
    children?: React.ReactNode;
  }>;
  style: HighlighterStyle;
}

// Module-level shared lazy loader: every component on the page reuses the
// same dynamic import promise so the syntax-highlighter + style bundles
// only get fetched/parsed once.
//
// We use `prism` (full) rather than `prism-light`. `prism-light` only
// exposes an empty `refractor/core` instance — the individual language
// modules in `react-syntax-highlighter/dist/esm/languages/prism/*.js`
// are NOT pre-registered, so passing `language="markup"` etc. silently
// does nothing and the code renders without token colors. `prism` is
// built on `refractor/all`, which registers 297 languages up front and
// is what we actually want here. The bundle is loaded lazily on the
// first code block render, so the upfront cost is deferred until then.
//
// We import `Prism` from the well-declared top-level package entry so
// TypeScript's bundler resolution picks it up cleanly. Only the style
// subpath lacks a bundled declaration — see the inline suppression.
//
// 修复两点历史问题：
//  1. 之前 reject 之后 highlighterPromise 永久缓存，一次打包/网络失败就让全站
//     代码块永远走 <pre> fallback 且无法自愈 — 这里在 catch 里把 promise 重置
//     为 null 并通知订阅者，允许下次挂载重新尝试。
//  2. 之前每个 useHighlighter() 调用方各自一份 useState + useEffect，promise
//     resolve 时 N 个组件各自 setState 触发 N 次独立重渲染（聊天列表每条消息
//     一份）。现在用模块级单例 + useSyncExternalStore 订阅，加载完成只在
//     全模块触发一次通知；订阅者各自在 React 调度的批处理里重新渲染。
let highlighterPromise: Promise<HighlighterBundle> | null = null;
let cachedBundle: HighlighterBundle | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

function loadHighlighter(): Promise<HighlighterBundle> {
  // 已经成功加载过：直接同步返回缓存的 bundle，避免多余 Promise 包装。
  if (cachedBundle) return Promise.resolve(cachedBundle);
  // 正在加载中（或历史上曾失败已被重置）：复用同一个 promise。
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = (async () => {
    try {
      const [{ Prism }, styleMod] = await Promise.all([
        // The `Prism` named export from the top-level package is the
        // full bundle (refractor/all + prism styling). Using the top-level
        // path also lets Rollup recognise this as a code-split point.
        import('react-syntax-highlighter'),
        // The one-dark style lives at a deep subpath that has no bundled
        // .d.ts. The runtime module is fine; we tag the line so the type
        // checker doesn't complain and cast the result immediately.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — no bundled type declaration for this subpath
        import('react-syntax-highlighter/dist/esm/styles/prism/one-dark'),
      ]);
      cachedBundle = {
        Component: Prism as unknown as HighlighterBundle['Component'],
        style: styleMod.default as HighlighterStyle,
      };
      // 一次通知唤醒所有订阅者；每个订阅组件在自己的 React 调度里重新渲染，
      // 不再是 N 个独立 setState。cachedBundle 是稳定引用，后续 React 的
      // bail-out 可以直接跳过无变化的渲染。
      notify();
      return cachedBundle;
    } catch (err) {
      // reject 后清空缓存的 promise，下次调用 loadHighlighter 会重新发起 import。
      // 否则一次失败就会让全站代码块永久走 <pre> fallback 且无任何自愈路径。
      // 这里同步触发一次通知：订阅者重新渲染时 snapshot 仍是 null，所以视觉
      // 上仍是 fallback <pre>，但状态机已经被清干净，下次挂载能重试。
      highlighterPromise = null;
      notify();
      throw err;
    }
  })();
  return highlighterPromise;
}

// useSyncExternalStore 的 subscribe：把订阅回调放进模块级 Set，
// loadHighlighter resolve/reject 时统一 notify。cachedBundle 是稳定引用，
// 满足 useSyncExternalStore 对 getSnapshot 返回值引用稳定的要求。
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): HighlighterBundle | null {
  return cachedBundle;
}

// 本项目不做 SSR；服务端 snapshot 直接返回 null（"尚未加载"）。
function getServerSnapshot(): HighlighterBundle | null {
  return null;
}

/**
 * Subscribe a component to the shared lazy-loaded syntax highlighter.
 * Returns the bundle once it has loaded, or null while still loading
 * (or if loading permanently failed — see comments above for retry).
 *
 * Return shape is intentionally identical to the previous implementation
 * (`HighlighterBundle | null`) so callers (ChatMessage, CodePreview, ...)
 * don't need to change.
 */
export function useHighlighter(): HighlighterBundle | null {
  // 第一次挂载时确保 import 已启动。preloadHighlighter() 之外的调用方（例如
  // 直接挂载 CodePreview 的部署预览页可能不会经过 Chat 页）也能触发加载。
  // 与模块级 promise 共享，重复调用是廉价的命中。
  useEffect(() => {
    loadHighlighter().catch(() => {
      // 失败已在 loadHighlighter 内部清空 promise 并通知，这里只需 swallow
      // 避免 unhandled rejection 噪音。
    });
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Kick off the highlighter fetch without subscribing to its state.
 * Call this at module top-level on pages that know they'll need the
 * highlighter (e.g. the Chat page) so the dynamic import starts running
 * during initial bundle parse instead of after the first `<CodeBlock>`
 * mounts — that way historical AI messages don't flash through the
 * plain `<pre>` fallback before the bundle arrives.
 *
 * Signature unchanged.
 */
export function preloadHighlighter(): void {
  loadHighlighter().catch(() => {
    // Preload is best-effort; the next `useHighlighter` invocation will
    // retry on its own. No need to surface this to the user.
  });
}