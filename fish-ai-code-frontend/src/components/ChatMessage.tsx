import { Avatar, Button, App } from 'antd';
import { UserOutlined, RobotOutlined, CopyOutlined, CheckOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, FileSearchOutlined, FolderOpenOutlined, ToolOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useHighlighter } from '@/hooks/useHighlighter';
import { normalizeMarkdownForStreaming } from '@/utils/markdownNormalize';
import { formatCodeForDisplay } from '@/utils/codeFormatter';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

// React.memo 包裹：流式期间 markdown 节流触发的 re-render 会让 CodeBlock 的 props
// (language, children) 保持不变，React 会跳过它的整个子树（高亮器不重新 tokenize、
// 复制按钮不重建）。这是个低成本却收益很高的优化。
const CodeBlock = React.memo(function CodeBlock({
  language,
  children,
  isStreaming = false,
}: {
  language: string;
  children: string;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const highlighter = useHighlighter(language || undefined);
  const { message } = App.useApp();
  const copyTimerRef = useRef<number | null>(null);

  // 组件卸载时清理复制提示的定时器，避免在已卸载组件上 setState
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('复制失败');
    }
  }, [children, message]);

  return (
    <div style={{ position: 'relative', margin: '8px 0', maxWidth: '100%', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 12px',
          background: '#282c34',
          borderRadius: '8px 8px 0 0',
          fontSize: 12,
          color: '#888',
          boxSizing: 'border-box',
        }}
      >
        <span>{language || 'code'}</span>
        <Button
          type="text"
          size="small"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          style={{ color: copied ? '#52c41a' : '#888', fontSize: 12 }}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      {!isStreaming && highlighter ? (
        <highlighter.Component
          language={language || 'text'}
          style={highlighter.style}
          codeTagProps={{
            // one-dark sets `text-shadow: 0 1px rgba(0,0,0,0.3)` on every
            // token; strip it so the highlighted code reads crisp.
            style: {
              textShadow: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            },
          }}
          customStyle={{
            margin: 0,
            borderRadius: '0 0 8px 8px',
            fontSize: 13,
            lineHeight: 1.5,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {children}
        </highlighter.Component>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '0 0 8px 8px',
            fontSize: 13,
            lineHeight: 1.5,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {children}
        </pre>
      )}
    </div>
  );
});

// Module-level constant — same across renders and across all messages.
const markdownBaseComponents: Components = {
  p({ children }) {
    return <p style={{ margin: '0 0 8px 0', lineHeight: 1.7 }}>{children}</p>;
  },
  ul({ children }) {
    return <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>;
  },
  ol({ children }) {
    return <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>;
  },
  li({ children }) {
    return <li style={{ margin: '2px 0' }}>{children}</li>;
  },
  h1({ children }) {
    return <h1 style={{ fontSize: '1.4em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h1>;
  },
  h2({ children }) {
    return <h2 style={{ fontSize: '1.2em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h2>;
  },
  h3({ children }) {
    return <h3 style={{ fontSize: '1.1em', margin: '8px 0 4px', fontWeight: 700 }}>{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid #d9d9d9',
          paddingLeft: 12,
          margin: '8px 0',
          color: '#666',
        }}
      >
        {children}
      </blockquote>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#36D2BE' }}>
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <table
        style={{
          borderCollapse: 'collapse',
          margin: '8px 0',
          width: '100%',
          fontSize: 13,
        }}
      >
        {children}
      </table>
    );
  },
  th({ children }) {
    return (
      <th
        style={{
          border: '1px solid #d9d9d9',
          padding: '6px 10px',
          background: '#fafafa',
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td
        style={{
          border: '1px solid #d9d9d9',
          padding: '6px 10px',
        }}
      >
        {children}
      </td>
    );
  },
};

function ChatMessageInner({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';

  // Props passed by react-markdown to the `code` component. The lib passes
  // `children` as a single ReactNode (often a string from the markdown
  // source), `className` like "language-tsx" for fenced blocks, and the
  // rest are forwarded HTML attributes we want to spread on inline <code>.
  type CodeProps = {
    className?: string;
    children?: React.ReactNode;
    node?: unknown;
    inline?: boolean;
  } & React.HTMLAttributes<HTMLElement>;

  // Same `code` render path during streaming and after — `useDeferredValue`
  // below already throttles ReactMarkdown so the highlighter import /
  // rerender doesn't pile up. (The previous "stream = SimpleCodeBlock"
  // shortcut was the source of the `display: none` flicker and the
  // post-stream markdown loss — drop it entirely.)
  const components = useMemo<Components>(() => {
    // react-markdown can hand us children of any shape during a stream:
    //   - string for normal text content
    //   - undefined for an unclosed ```` ``` ```` fence waiting for content
    //   - an array of strings for inline + fenced composites
    //   - a React element for nested HTML/markdown that has already been
    //     rendered to a node
    // `String(children ?? '')` blows up on the latter two with
    // "Cannot convert object to primitive value", which then crashes the
    // whole chat panel. Coalesce to text before calling String.
    const toCodeString = (children: React.ReactNode): string => {
      if (children === null || children === undefined) return '';
      if (typeof children === 'string') return children;
      if (typeof children === 'number') return String(children);
      if (Array.isArray(children)) {
        return children.map(toCodeString).join('');
      }
      // React elements / objects — drill in if possible, otherwise drop.
      const props = (children as { props?: { children?: React.ReactNode } })?.props;
      if (props && 'children' in props) return toCodeString(props.children);
      return '';
    };

    function Code({ className, children, inline, ...props }: CodeProps) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = toCodeString(children).replace(/\n$/, '');
      const language = match ? match[1] : '';
      const displayCode = formatCodeForDisplay(codeString, language);
      if (inline && !codeString.includes('\n')) {
        return (
          <code
            style={{
              background: 'rgba(17,25,37,0.08)',
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: '0.9em',
              textShadow: 'none',
              boxShadow: 'none',
            }}
            {...props}
          >
            {codeString}
          </code>
        );
      }
      return <CodeBlock language={language} children={displayCode} isStreaming={isStreaming} />;
    }

    // 工具调用段落：识别后端输出 "[工具调用] 读取目录 根目录" / "[选择工具] 写入文件"
    // （动作名不带方括号），以及 AI 自由输出可能带的 "[修改文件] src/App.vue"（动作带方括号），
    // 统一渲染成带 SVG 图标的醒目气泡卡片。
    // 动作词白名单限定（写入/修改/删除/读取文件、读取目录），避免把 "[注意]" 这类普通文本误渲染。
    // 路径优先匹配带扩展名的（src/pages/Dashboard.vue），扩展名后即停，避免吞掉叙述文字。
    const TOOL_ACTIONS = '写入文件|修改文件|删除文件|读取文件|读取目录';
    const TOOL_CALL_SPLIT_RE = new RegExp(
      `((?:\\[(?:工具调用|选择工具)\\]\\s*(?:${TOOL_ACTIONS})\\s*(?:[^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6}|[^\\s[\\]，。、；：（）()]+)?)|(?:\\[(?:${TOOL_ACTIONS})\\]\\s+(?:[^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6}|[^\\s[\\]，。、；：（）()]+)))`,
      'g',
    );
    // 动作作为捕获组 1，路径作为捕获组 2（带扩展名）/ 3（不带）——与下方解构一一对应。
    // 兼容三种格式：[工具调用] 写入文件 [路径] / [选择工具] 写入文件 / [修改文件] src/App.vue（动作带方括号）
    const TOOL_ACTION_RE = new RegExp(
      `^(?:\\[(?:工具调用|选择工具)\\]\\s*)?\\[?(${TOOL_ACTIONS})\\]?(?:\\s+(?:([^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6})|([^\\s[\\]，。、；：（）()]+)))?$`,
    );
    function ToolCallParagraph({ children }: { children?: React.ReactNode }) {
      const text = toCodeString(children);
      const parts = text.split(TOOL_CALL_SPLIT_RE);
      // 无工具标记：用 div 代替 p（工具调用行常与代码块相邻，p 不能嵌套 div/pre）
      if (parts.length === 1) {
        return <div>{children}</div>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '4px 0' }}>
          {parts.map((part, i) => {
            // split 结果奇数索引是工具捕获片段，偶数索引是普通叙述：只解析工具片段，
            // 避免 "已完成" 这类普通词被 TOOL_ACTION_RE 误匹配渲染成卡片。
            if (i % 2 === 0) {
              return part ? <span key={i}>{part}</span> : null;
            }
            const m = TOOL_ACTION_RE.exec(part.trim());
            if (!m) {
              return part ? <span key={i}>{part}</span> : null;
            }
            const action = m[1];
            const [, , extPath, rawPath] = m;
            const filePath = extPath ?? rawPath;
            const Icon =
              action === '写入文件' ? FileTextOutlined :
              action === '修改文件' ? EditOutlined :
              action === '删除文件' ? DeleteOutlined :
              action === '读取文件' ? FileSearchOutlined :
              action === '读取目录' ? FolderOpenOutlined :
              ToolOutlined;
            return (
              <span
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  margin: '4px 0',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(54,210,190,0.10), rgba(79,157,255,0.06))',
                  border: '1px solid rgba(54,210,190,0.22)',
                  fontSize: '0.92em',
                  color: '#374151',
                  width: 'fit-content',
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    color: '#0e9f92',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon style={{ fontSize: 16, color: '#16ab9c' }} />
                  {action}
                </span>
                {filePath ? (
                  <code
                    style={{
                      fontFamily: 'inherit',
                      wordBreak: 'break-all',
                      color: '#374151',
                    }}
                  >
                    {filePath}
                  </code>
                ) : null}
              </span>
            );
          })}
        </div>
      );
    }

    return {
      ...markdownBaseComponents,
      code: Code,
      p: ToolCallParagraph,
    };
  }, [isStreaming]);

  // `useDeferredValue` was previously used here to keep the markdown
  // reparse off the critical path during streaming, but the React 19
  // lazy state initializer triggers "Cannot convert object to primitive
  // value" once the streaming content gets long enough that react-markdown
  // passes an object-shaped `children` to one of our renderers. Until
  // we have a React-19-safe throttling strategy, just render directly.
  // The 200ms debounce in useSSE already keeps the parse frequency
  // bounded, so streaming text stays visible.
  //
  // 防御性节流（~120ms）：useSSE 端是 200ms 防抖，但如果将来调快、或上层绕过
  // useSSE 直接 setContent，这里把 ReactMarkdown 的输入再节一次。流式结束
  // （isStreaming=false）时**立即**刷新为最终完整内容，绝不能因节流丢尾。
  const [renderedContent, setRenderedContent] = useState(
    () => (isUser ? content : normalizeMarkdownForStreaming(content)),
  );
  const lastFlushRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用来在补帧 timer 触发时读最新 content / isUser，避免 setTimeout 闭包
  // 拿到旧值导致丢字符。
  const latestContentRef = useRef(content);
  const latestIsUserRef = useRef(isUser);
  useLayoutEffect(() => {
    latestContentRef.current = content;
    latestIsUserRef.current = isUser;
  }, [content, isUser]);
  useEffect(() => {
    const normalized = isUser ? content : normalizeMarkdownForStreaming(content);
    if (!isStreaming) {
      // 流结束：取消可能挂起的节流 timer，立即同步到最新完整内容。
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      lastFlushRef.current = Date.now();
      setRenderedContent(normalized);
      return;
    }
    // 流式期间：距上次 flush >= 120ms 立即更新，否则挂一个补 timer 把尾帧
    // 兜上去（防止 content 在节流窗口内变化但还没到 timer 触发时机就被卡住）。
    const now = Date.now();
    const elapsed = now - lastFlushRef.current;
    if (elapsed >= 120) {
      lastFlushRef.current = now;
      setRenderedContent(normalized);
    } else if (!pendingTimerRef.current) {
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        lastFlushRef.current = Date.now();
        // 从 ref 读最新值，不读闭包里的旧 content / isUser。
        const c = latestContentRef.current;
        setRenderedContent(
          latestIsUserRef.current ? c : normalizeMarkdownForStreaming(c),
        );
      }, 120 - elapsed);
    }
  }, [content, isStreaming, isUser]);

  // 组件卸载时清掉未触发的 timer，避免在已 unmount 的组件上 setState。
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        gap: isUser ? 8 : 6,
        width: '100%',
        minWidth: 0,
        // 长对话中，离开视口的历史消息无需参与布局和绘制。React 仍保留
        // 节点与滚动高度，所以不会破坏“加载更多”或流式消息的锚定逻辑。
        contentVisibility: isStreaming ? 'visible' : 'auto',
        containIntrinsicSize: isStreaming ? undefined : '0 280px',
      }}
    >
      {!isUser && (
        <Avatar
          size={22}
          icon={<RobotOutlined />}
          style={{ backgroundColor: '#36D2BE', flexShrink: 0 }}
        />
      )}
      <div
        style={{
          width: isUser ? 'fit-content' : 'calc(100% - 28px)',
          maxWidth: isUser ? '88%' : 'calc(100% - 28px)',
          minWidth: 0,
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: isUser ? '#111925' : 'rgba(17,25,37,0.05)',
          color: isUser ? '#fff' : '#111925',
          fontSize: 14,
          lineHeight: 1.6,
          // wordBreak + overflowWrap on the bubble itself prevents long
          // code lines / URLs from extending past the bubble width and
          // being clipped by overflow:hidden — that clip is what made
          // the markdown look "crammed together" before.
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {content}
          </div>
        ) : content ? (
          // Both streaming and committed: full markdown render. The
          // `useDeferredValue` above keeps the parse off the critical path,
          // so we always render through ReactMarkdown — no more
          // "plain text during stream, formatted after" swap that
          // could drop content mid-transition.
          <div className="markdown-body">
            <ReactMarkdown components={components}>
              {renderedContent}
            </ReactMarkdown>
          </div>
        ) : isStreaming ? (
          // Stream just started, no text yet — show typing dots instead
          // of an empty bubble so the user sees the AI is "alive".
          <span className="typing-hint">
            正在生成中，请耐心等待
            <span className="typing-dots">
              <span>●</span>
              <span>●</span>
              <span>●</span>
            </span>
          </span>
        ) : null}
      </div>
      {isUser && (
        <Avatar
          size={22}
          icon={<UserOutlined />}
          style={{ backgroundColor: '#111925', flexShrink: 0 }}
        />
      )}
    </div>
  );
}

const ChatMessage = React.memo(ChatMessageInner, (prev, next) => {
  // 流结束或 content 变化必须重渲染，否则 renderedContent 卡在流式中间态
  return (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming
  );
});
export default ChatMessage;
