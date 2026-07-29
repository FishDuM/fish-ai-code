declare module 'react-syntax-highlighter/dist/esm/prism-light' {
  import type { ComponentType, CSSProperties, ReactNode } from 'react';

  const PrismLight: ComponentType<{
    language?: string;
    style?: Record<string, CSSProperties>;
    customStyle?: CSSProperties;
    codeTagProps?: { style?: CSSProperties };
    children?: ReactNode;
  }> & {
    registerLanguage: (name: string, syntax: unknown) => void;
  };
  export default PrismLight;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/*' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/*' {
  const style: Record<string, import('react').CSSProperties>;
  export default style;
}
