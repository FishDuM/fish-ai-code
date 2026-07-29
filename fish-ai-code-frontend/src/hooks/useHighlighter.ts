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
// Use the light Prism renderer and register only languages this product can
// generate or display. The full `Prism` export pulls in 297 grammars (almost
// 1 MB minified in the production build) even though code generation is
// overwhelmingly HTML/CSS/JS/Vue. Keeping the imports explicit also makes
// adding a supported language a deliberate, measurable choice.
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
const registeredLanguages = new Set<string>();
const languagePromises = new Map<string, Promise<void>>();

type LightPrismComponent = HighlighterBundle['Component'] & {
  registerLanguage: (name: string, syntax: unknown) => void;
};

type LanguageModule = { default: unknown };
type LanguageLoader = () => Promise<LanguageModule>;

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  markup: () => import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
  css: () => import('react-syntax-highlighter/dist/esm/languages/prism/css'),
  javascript: () => import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
  jsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
  typescript: () => import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
  tsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
  scss: () => import('react-syntax-highlighter/dist/esm/languages/prism/scss'),
  less: () => import('react-syntax-highlighter/dist/esm/languages/prism/less'),
  json: () => import('react-syntax-highlighter/dist/esm/languages/prism/json'),
  bash: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
  yaml: () => import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
  python: () => import('react-syntax-highlighter/dist/esm/languages/prism/python'),
  java: () => import('react-syntax-highlighter/dist/esm/languages/prism/java'),
  c: () => import('react-syntax-highlighter/dist/esm/languages/prism/c'),
  cpp: () => import('react-syntax-highlighter/dist/esm/languages/prism/cpp'),
  csharp: () => import('react-syntax-highlighter/dist/esm/languages/prism/csharp'),
  sql: () => import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
  markdown: () => import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
  docker: () => import('react-syntax-highlighter/dist/esm/languages/prism/docker'),
};

function canonicalLanguage(language: string): string {
  return language === 'html' || language === 'xml' ? 'markup' : language;
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

function loadBaseHighlighter(): Promise<HighlighterBundle> {
  if (cachedBundle) return Promise.resolve(cachedBundle);
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      try {
        const [prismLightMod, styleMod] = await Promise.all([
          // Import the light entry directly. Importing the package root as a
          // namespace keeps the full Prism export reachable and defeats tree
          // shaking, even when we only read PrismLight from that namespace.
          import('react-syntax-highlighter/dist/esm/prism-light'),
          import('react-syntax-highlighter/dist/esm/styles/prism/one-dark'),
        ]);
        cachedBundle = {
          Component: prismLightMod.default as unknown as LightPrismComponent,
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
  }
  return highlighterPromise;
}

async function ensureLanguage(language: string): Promise<void> {
  const canonical = canonicalLanguage(language);
  if (registeredLanguages.has(canonical) || !LANGUAGE_LOADERS[canonical]) return;
  const inFlight = languagePromises.get(canonical);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const [bundle, languageModule] = await Promise.all([
      loadBaseHighlighter(),
      LANGUAGE_LOADERS[canonical](),
    ]);
    const component = bundle.Component as LightPrismComponent;
    component.registerLanguage(canonical, languageModule.default);
    if (canonical === 'markup') {
      component.registerLanguage('html', languageModule.default);
      component.registerLanguage('xml', languageModule.default);
    }
    registeredLanguages.add(canonical);
    notify();
  })();
  languagePromises.set(canonical, promise);
  try {
    await promise;
  } catch (error) {
    languagePromises.delete(canonical);
    throw error;
  }
}

function loadHighlighter(languages: readonly string[] = []): Promise<HighlighterBundle> {
  return loadBaseHighlighter().then(async (bundle) => {
    await Promise.all([...new Set(languages)].map(ensureLanguage));
    return bundle;
  });
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
export function useHighlighter(language?: string): HighlighterBundle | null {
  // 首次需要代码高亮时才加载基础渲染器和对应语法；重复调用共享 promise。
  useEffect(() => {
    loadHighlighter(language ? [language] : []).catch(() => {
      // 失败已在 loadHighlighter 内部清空 promise 并通知，这里只需 swallow
      // 避免 unhandled rejection 噪音。
    });
  }, [language]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
