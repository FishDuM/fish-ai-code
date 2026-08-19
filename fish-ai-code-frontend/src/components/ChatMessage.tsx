import { Avatar } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, FileSearchOutlined, FolderOpenOutlined, ToolOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import React, { useMemo } from 'react';
import CodeBlock from '@/components/CodeBlock';
import { normalizeMarkdownForStreaming } from '@/utils/markdownNormalize';
import { formatCodeForDisplay } from '@/utils/codeFormatter';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

// react-markdown 传给 `code` 组件的 props：className 形如 "language-tsx"，
// children 在流式中可能是各种形状（见 toCodeString），其余属性透传给内联 <code>
type CodeProps = {
  className?: string;
  children?: React.ReactNode;
  node?: unknown;
  inline?: boolean;
} & React.HTMLAttributes<HTMLElement>;

// react-markdown 传入的 children 可能是 string / undefined（未闭合代码围栏）/
// 数组 / 已渲染元素，统一转成文本
function toCodeString(children: React.ReactNode): string {
  if (children === null || children === undefined) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children.map(toCodeString).join('');
  }
  const props = (children as { props?: { children?: React.ReactNode } })?.props;
  if (props && 'children' in props) return toCodeString(props.children);
  return '';
}

function ChatMessageInner({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';

  const components = useMemo<Components>(() => {
    function Code({ className, children, inline, ...props }: CodeProps) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = toCodeString(children).replace(/\n$/, '');
      const language = match ? match[1] : '';
      if (inline && !codeString.includes('\n')) {
        return <code {...props}>{codeString}</code>;
      }
      // 流结束后仍为空的代码块（AI 输出残缺围栏）不渲染，避免出现空白代码区域
      if (!isStreaming && !codeString.trim()) {
        return null;
      }
      const displayCode = formatCodeForDisplay(codeString, language);
      // 展示用格式化副本，复制始终用原始 codeString
      return <CodeBlock language={language} rawCode={codeString} isStreaming={isStreaming}>{displayCode}</CodeBlock>;
    }

    // 工具调用段落：支持中文动作（写入文件/修改文件等）与英文函数名（writeToFile/modifyFile等），
    // 动作词白名单限定，避免把 "[注意]" 这类普通文本误渲染
    const TOOL_ACTION_CONFIG: Record<string, { label: string; icon: typeof ToolOutlined }> = {
      '写入文件': { label: '写入文件', icon: FileTextOutlined },
      '写入': { label: '写入文件', icon: FileTextOutlined },
      'writeToFile': { label: '写入文件', icon: FileTextOutlined },
      'fileWrite': { label: '写入文件', icon: FileTextOutlined },
      '修改文件': { label: '修改文件', icon: EditOutlined },
      '修改': { label: '修改文件', icon: EditOutlined },
      'modifyFile': { label: '修改文件', icon: EditOutlined },
      'fileModify': { label: '修改文件', icon: EditOutlined },
      '删除文件': { label: '删除文件', icon: DeleteOutlined },
      '删除': { label: '删除文件', icon: DeleteOutlined },
      'deleteFile': { label: '删除文件', icon: DeleteOutlined },
      'fileDelete': { label: '删除文件', icon: DeleteOutlined },
      '读取文件': { label: '读取文件', icon: FileSearchOutlined },
      '读取': { label: '读取文件', icon: FileSearchOutlined },
      'readFile': { label: '读取文件', icon: FileSearchOutlined },
      'fileRead': { label: '读取文件', icon: FileSearchOutlined },
      '读取目录': { label: '读取目录', icon: FolderOpenOutlined },
      'readDir': { label: '读取目录', icon: FolderOpenOutlined },
      'listDir': { label: '读取目录', icon: FolderOpenOutlined },
    };

    const TOOL_ACTION_KEYS = Object.keys(TOOL_ACTION_CONFIG).join('|');
    const TOOL_CALL_SPLIT_RE = new RegExp(
      `((?:\\[(?:工具调用|选择工具|tool_call|tool|action)\\]\\s*(?:${TOOL_ACTION_KEYS})\\s*(?:[^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6}|[^\\s[\\]，。、；：（）()]+)?)|(?:\\[(?:${TOOL_ACTION_KEYS})\\]\\s+(?:[^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6}|[^\\s[\\]，。、；：（）()]+)))`,
      'g',
    );
    const TOOL_ACTION_RE = new RegExp(
      `^(?:\\[(?:工具调用|选择工具|tool_call|tool|action)\\]\\s*)?\\[?(${TOOL_ACTION_KEYS})\\]?(?:\\s+(?:([^\\s[\\]，。、；：（）()]*?\\.[a-zA-Z0-9]{1,6})|([^\\s[\\]，。、；：（）()]+)))?$`,
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
            // split 结果奇数索引是工具捕获片段：只解析工具片段，避免普通词被误渲染成卡片
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
            const actionConfig = TOOL_ACTION_CONFIG[action] ?? { label: action, icon: ToolOutlined };
            const Icon = actionConfig.icon;
            const displayLabel = actionConfig.label;
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
                  {filePath ? `${displayLabel}:` : displayLabel}
                </span>
                {filePath && (
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.9em',
                      color: '#1e293b',
                      background: 'rgba(255,255,255,0.85)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(0,0,0,0.06)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {filePath}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      );
    }

    return { code: Code, p: ToolCallParagraph };
  }, [isStreaming]);

  // 流式内容直接渲染：useSSE 端已 200ms 防抖，无需再节流
  const renderedContent = useMemo(
    () => (isUser ? content : normalizeMarkdownForStreaming(content)),
    [content, isUser],
  );

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        gap: isUser ? 8 : 6,
        width: '100%',
        minWidth: 0,
        // 离开视口的历史消息不参与布局绘制；React 仍保留节点与滚动高度
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
          // 防止长代码行/URL 超出气泡宽度被裁剪
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</div>
        ) : content ? (
          <div className="markdown-body">
            <ReactMarkdown components={components}>{renderedContent}</ReactMarkdown>
          </div>
        ) : isStreaming ? (
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
  // 流结束或内容变化必须重渲染，否则 renderedContent 卡在流式中间态
  return (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming
  );
});

export default ChatMessage;
