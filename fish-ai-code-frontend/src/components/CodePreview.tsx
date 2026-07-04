import { Button, App } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useHighlighter } from '@/hooks/useHighlighter';
import { resolveLanguage } from '@/utils/codeLanguage';

interface CodePreviewProps {
  code: string;
  /**
   * Language hint. Accepts a file extension (`ts`, `vue`, `css`) or a
   * canonical language name (`typescript`, `html`, ...). Anything we don't
   * recognise falls back to no-language rendering (still monospace, just
   * uncolored).
   */
  language?: string;
  /**
   * When true, skip the syntax highlighter and render a plain `<pre>`.
   * Use this during streaming to avoid paying the 400KB lazy-import cost
   * on every chunk.
   */
  isStreaming?: boolean;
}

// one-dark 给每个 token 加 `text-shadow: 0 1px rgba(0,0,0,0.3)`，
// 高亮文本会看起来有点糊。这里关掉它。提到模块级常量以避免每次
// render 重建内联对象传给 highlighter（浅比较稳定）。
const CODE_TAG_PROPS: { style: CSSProperties } = {
  style: { textShadow: 'none' },
};

function CodePreview({ code, language, isStreaming = false }: CodePreviewProps) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const highlighter = useHighlighter();
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用 ref 持有最新 code，让 handleCopy 不依赖 code，避免每次流式
  // chunk（code 引用变）都重建 onClick 回调。
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Clean up the "copied" timer so we don't setState on an unmounted
  // component if the user navigates away within 2s.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeRef.current);
      setCopied(true);
      message.success('已复制到剪贴板');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      message.error('复制失败');
    }
  }, [message]);

  // Resolve language once per render so changing the prop re-runs cheaply.
  const prismLanguage = resolveLanguage(language);

  // Highlighted path: highlighter bundle is loaded AND caller isn't
  // streaming. Otherwise fall back to a plain <pre> so the user still sees
  // their code while it's arriving or while we wait for the import.
  const canHighlight = !isStreaming && highlighter !== null && prismLanguage !== undefined;
  const display = code || '// 等待 AI 生成代码...';

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Button
        type="text"
        size="small"
        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={handleCopy}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
      >
        {copied ? '已复制' : '复制'}
      </Button>
      {canHighlight && highlighter ? (
        <highlighter.Component
          language={prismLanguage}
          style={highlighter.style}
          codeTagProps={CODE_TAG_PROPS}
          customStyle={{
            margin: 0,
            padding: '16px',
            paddingTop: '40px',
            background: '#1e1e1e',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
            height: '100%',
            boxSizing: 'border-box',
            whiteSpace: 'pre',
            wordBreak: 'normal',
          }}
        >
          {display}
        </highlighter.Component>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: '16px',
            paddingTop: '40px',
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
            height: '100%',
            boxSizing: 'border-box',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {display}
        </pre>
      )}
    </div>
  );
}

// 用 React.memo 包一层，父组件只传 code/language/isStreaming 三个
// primitive/字符串 props，浅比较足以避免无关重渲（例如父组件其它
// state 变化时）。
export default memo(CodePreview);