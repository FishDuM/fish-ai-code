import { useEffect, useSyncExternalStore } from 'react';

// react-syntax-highlighter 样式类型定义
export type HighlighterStyle = Record<string, React.CSSProperties>;

export interface HighlighterBundle {
  Component: React.ComponentType<{
    language?: string;
    style?: HighlighterStyle;
    customStyle?: React.CSSProperties;
    codeTagProps?: { style?: React.CSSProperties };
    children?: React.ReactNode;
  }>;
  style: HighlighterStyle;
}

// 模块级单例缓存：按需加载轻量级 Prism 渲染器和语言包，避免重复加载
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
          import('react-syntax-highlighter/dist/esm/prism-light'),
          import('react-syntax-highlighter/dist/esm/styles/prism/one-dark'),
        ]);
        cachedBundle = {
          Component: prismLightMod.default as unknown as LightPrismComponent,
          style: styleMod.default as HighlighterStyle,
        };
        notify();
        return cachedBundle;
      } catch (err) {
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
    if (cachedBundle) {
      cachedBundle = { ...cachedBundle };
    }
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

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): HighlighterBundle | null {
  return cachedBundle;
}

function getServerSnapshot(): HighlighterBundle | null {
  return null;
}

/**
 * 订阅语法高亮器（按需异步加载）
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
