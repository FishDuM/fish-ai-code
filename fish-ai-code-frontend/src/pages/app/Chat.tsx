import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, Input, Typography, Space, App, Tabs, Spin, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  DeleteOutlined,
  EditOutlined,
  CodeOutlined,
  EyeOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import ChatMessage from '@/components/ChatMessage';
import CodePreview from '@/components/CodePreview';
import { useSSE } from '@/hooks/useSSE';
import { useTitle } from '@/hooks/useTitle';
import { useAuthStore } from '@/stores/useAuthStore';
import { getAppVO, deleteMyApp, updateMyApp, deployApp } from '@/api/app';
import { getLatestChatHistory, listChatHistoryBefore } from '@/api/chatHistory';
import { parseHtmlCode, parseMultiFileCode, mergeToHtmlDoc } from '@/utils/codeParser';
import type { AppVO } from '@/api/types';

const { Text } = Typography;

const PAGE_SIZE = 10;

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createTime: string;
}

let nextMsgId = 0;
function newMsgId(): string {
  return `local_${nextMsgId++}_${Date.now()}`;
}

export default function AppChat() {
  const { id: appId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { loginUser } = useAuthStore();

  const justFinishedStreamingRef = useRef(false);

  const handleStreamComplete = useCallback((finalCode: string) => {
    setMessages((prev) => [...prev, { id: newMsgId(), role: 'ai', content: finalCode, createTime: new Date().toISOString() }]);
    justFinishedStreamingRef.current = true;
    setTimeout(() => { justFinishedStreamingRef.current = false; }, 200);
  }, []);

  const { isStreaming, isStreamingRef, currentCode, error: sseError, start, cancel } = useSSE(handleStreamComplete);

  const [app, setApp] = useState<AppVO | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [previewTab, setPreviewTab] = useState('preview');
  const [deployUrl, setDeployUrl] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);

  // Chat history states
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const historyInitedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const inputRef = useRef('');
  const autoSentRef = useRef(false);
  const oldestCreateTimeRef = useRef<string>('');

  useTitle(app?.appName || '对话');

  const isOwner = loginUser != null && app != null && loginUser.id === app.userId;

  // Build preview HTML from raw AI code
  const buildPreviewHtml = useCallback((rawCode: string, codeGenType: string | null) => {
    if (!rawCode) return '';
    if (codeGenType === 'multi_file') {
      const parsed = parseMultiFileCode(rawCode);
      return mergeToHtmlDoc(parsed);
    }
    return parseHtmlCode(rawCode);
  }, []);

  // Memoize parsed multi-file code
  const parsedCode = useMemo(() => {
    if (!currentCode || app?.codeGenType !== 'multi_file') return null;
    return parseMultiFileCode(currentCode);
  }, [currentCode, app?.codeGenType]);

  // Load app info, then load chat history
  useEffect(() => {
    if (!appId) return;
    // Reset states for new app
    autoSentRef.current = false;
    historyInitedRef.current = false;
    setMessages([]);
    setLoading(true);
    getAppVO(appId)
      .then((appData) => {
        setApp(appData);
        // After app loads, fetch latest chat history
        return getLatestChatHistory(appId, PAGE_SIZE);
      })
      .then((history) => {
        historyInitedRef.current = true;
        const loaded: Message[] = history.map((h) => ({
          id: h.id,
          role: h.messageType === 'user' ? 'user' : 'ai',
          content: h.message,
          createTime: h.createTime,
        }));
        setMessages(loaded);
        setHasMoreHistory(history.length >= PAGE_SIZE);
        // Store oldest createTime for cursor
        if (history.length > 0) {
          oldestCreateTimeRef.current = history[0].createTime;
        }
        // Auto-scroll to bottom after loading history
        shouldAutoScrollRef.current = true;
      })
      .catch(() => {
        historyInitedRef.current = true;
        message.error('应用不存在');
        navigate('/dashboard');
      })
      .finally(() => setLoading(false));
  }, [appId, navigate]);

  // Auto-send initPrompt: own app AND no chat history
  useEffect(() => {
    if (
      !historyInitedRef.current ||
      autoSentRef.current ||
      !appId ||
      !app ||
      !isOwner ||
      messages.length > 0 ||
      !app.initPrompt
    ) return;
    autoSentRef.current = true;
    setMessages([{ id: newMsgId(), role: 'user', content: app.initPrompt, createTime: new Date().toISOString() }]);
    shouldAutoScrollRef.current = true;
    start(appId, app.initPrompt);
  }, [messages, app, isOwner, appId, start]);

  // Show preview when: >= 2 completed messages, or currently streaming
  const showPreview = messages.length >= 2 || isStreaming;

  // Load more history (cursor pagination)
  const handleLoadMore = useCallback(async () => {
    if (!appId || loadingMore || !hasMoreHistory || !oldestCreateTimeRef.current) return;
    setLoadingMore(true);
    try {
      const older = await listChatHistoryBefore(appId, oldestCreateTimeRef.current, PAGE_SIZE);
      if (older.length > 0) {
        const olderMessages: Message[] = older.map((h) => ({
          id: h.id,
          role: h.messageType === 'user' ? 'user' : 'ai',
          content: h.message,
          createTime: h.createTime,
        }));
        setMessages((prev) => [...olderMessages, ...prev]);
        oldestCreateTimeRef.current = older[0].createTime;
      }
      setHasMoreHistory(older.length >= PAGE_SIZE);
    } catch {
      message.error('加载历史消息失败');
    } finally {
      setLoadingMore(false);
    }
  }, [appId, loadingMore, hasMoreHistory]);

  // Debounced preview update during streaming
  useEffect(() => {
    if (!isStreaming) {
      if (currentCode) setPreviewCode(buildPreviewHtml(currentCode, app?.codeGenType ?? null));
      return;
    }
    const timer = setTimeout(
      () => setPreviewCode(buildPreviewHtml(currentCode, app?.codeGenType ?? null)),
      500
    );
    return () => clearTimeout(timer);
  }, [currentCode, isStreaming, app?.codeGenType, buildPreviewHtml]);

  // Update preview from completed AI messages when not streaming
  useEffect(() => {
    if (isStreaming) return;
    // Find the latest AI message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai') {
        setPreviewCode(buildPreviewHtml(messages[i].content, app?.codeGenType ?? null));
        return;
      }
    }
    setPreviewCode('');
  }, [messages, isStreaming, app?.codeGenType, buildPreviewHtml]);

  // Auto-scroll: only when user is at the bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentCode]);

  // Track if user is near the bottom (within 100px)
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 100;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  const handleSend = useCallback(() => {
    const text = inputRef.current.trim();
    if (!text || isStreamingRef.current || justFinishedStreamingRef.current || !appId) return;

    setInput('');
    inputRef.current = '';
    setMessages((prev) => [...prev, { id: newMsgId(), role: 'user', content: text, createTime: new Date().toISOString() }]);
    shouldAutoScrollRef.current = true;

    start(appId, text);
  }, [appId, start, isStreamingRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleDelete = () => {
    if (!app) return;
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除应用「${app.appName || '未命名'}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteMyApp(app.id);
          message.success('已删除');
          navigate('/dashboard');
        } catch (err: any) {
          message.error(err.message || '删除失败');
        }
      },
    });
  };

  const handleRename = () => {
    if (!app) return;
    setRenameValue(app.appName || '');
    setRenameOpen(true);
  };

  const handleRenameOk = async () => {
    if (!app || !renameValue.trim()) return;
    setRenameLoading(true);
    try {
      await updateMyApp({ id: app.id, appName: renameValue.trim() });
      setApp({ ...app, appName: renameValue.trim() });
      message.success('重命名成功');
      setRenameOpen(false);
    } catch (err: any) {
      message.error(err.message || '操作失败');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!appId) return;
    setDeploying(true);
    try {
      const url = await deployApp({ appId });
      setDeployUrl(url);
    } catch (err: any) {
      message.error(err.message || '部署失败');
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
            返回
          </Button>
          <Text strong>{app?.appName || '未命名应用'}</Text>
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handleDeploy}
            loading={deploying}
            disabled={!showPreview}
          >
            部署
          </Button>
          <Button type="text" icon={<EditOutlined />} onClick={handleRename}>
            重命名
          </Button>
          <Button type="text" danger icon={<DeleteOutlined />} onClick={handleDelete}>
            删除
          </Button>
        </Space>
      </div>

      {/* Deploy success Modal */}
      <Modal
        title="部署成功"
        open={!!deployUrl}
        onCancel={() => setDeployUrl('')}
        footer={[
          <Button key="close" onClick={() => setDeployUrl('')}>
            关闭
          </Button>,
          <Button
            key="open"
            type="primary"
            onClick={() => window.open(deployUrl, '_blank')}
          >
            访问应用
          </Button>,
        ]}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <Text>应用已部署成功，访问地址：</Text>
          <div style={{ marginTop: 12 }}>
            <a href={deployUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 16 }}>
              {deployUrl}
            </a>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        title="重命名应用"
        open={renameOpen}
        onOk={handleRenameOk}
        onCancel={() => setRenameOpen(false)}
        confirmLoading={renameLoading}
        okText="保存"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="应用名称"
          maxLength={50}
          onPressEnter={handleRenameOk}
        />
      </Modal>

      {/* Main content: split pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Chat panel */}
        <div
          style={{
            width: '40%',
            minWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #f0f0f0',
          }}
        >
          {/* Messages */}
          <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: 16 }} onScroll={handleScroll}>
            {/* Load more button */}
            {hasMoreHistory && messages.length > 0 && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Button
                  type="link"
                  icon={loadingMore ? <LoadingOutlined /> : <HistoryOutlined />}
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  size="small"
                >
                  {loadingMore ? '加载中...' : '加载更多历史消息'}
                </Button>
              </div>
            )}
            {messages.length === 0 && !isStreaming && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 80 }}>
                <CodeOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>输入描述，AI 将为你生成网站代码</div>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
            ))}
            {isStreaming && (
              <ChatMessage role="ai" content={currentCode} isStreaming />
            )}
            {sseError && (
              <div style={{ textAlign: 'center', color: '#ff4d4f', padding: '8px 0', fontSize: 13 }}>
                生成失败：{sseError.message || '未知错误'}，请重试
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', background: '#fff' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.TextArea
                value={input}
                onChange={(e) => { setInput(e.target.value); inputRef.current = e.target.value; }}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? 'AI 正在生成中...' : '描述你想要的网站... (Enter 发送, Shift+Enter 换行)'}
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={isStreaming}
              />
              {isStreaming ? (
                <Button danger onClick={cancel}>
                  停止
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  发送
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs
            activeKey={previewTab}
            onChange={setPreviewTab}
            style={{ padding: '0 16px' }}
            items={[
              {
                key: 'preview',
                label: (
                  <span>
                    <EyeOutlined /> 预览
                  </span>
                ),
                children: (
                  <div style={{ flex: 1, height: 'calc(100vh - 140px)' }}>
                    {showPreview && previewCode ? (
                      <iframe
                        srcDoc={previewCode}
                        sandbox="allow-scripts"
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          borderRadius: 8,
                        }}
                        title="应用预览"
                      />
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#fafafa',
                          borderRadius: 8,
                          color: '#999',
                        }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <EyeOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                          <div>发送消息后，预览将在这里显示</div>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'code',
                label: (
                  <span>
                    <CodeOutlined /> 代码
                  </span>
                ),
                children: (
                  <div style={{ height: 'calc(100vh - 140px)' }}>
                    {currentCode && app?.codeGenType === 'multi_file' ? (
                      <Tabs
                        defaultActiveKey="html"
                        size="small"
                        style={{ height: '100%' }}
                        items={[
                          {
                            key: 'html',
                            label: 'HTML',
                            children: (
                              <div style={{ height: 'calc(100vh - 190px)' }}>
                                <CodePreview code={parsedCode?.htmlCode || '// 等待 AI 生成...'} />
                              </div>
                            ),
                          },
                          {
                            key: 'css',
                            label: 'CSS',
                            children: (
                              <div style={{ height: 'calc(100vh - 190px)' }}>
                                <CodePreview code={parsedCode?.cssCode || '// 等待 AI 生成...'} />
                              </div>
                            ),
                          },
                          {
                            key: 'js',
                            label: 'JS',
                            children: (
                              <div style={{ height: 'calc(100vh - 190px)' }}>
                                <CodePreview code={parsedCode?.jsCode || '// 等待 AI 生成...'} />
                              </div>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <CodePreview code={currentCode || '// 等待 AI 生成代码...'} />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
