import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, Typography, App, Tabs, Spin, Modal, Input } from 'antd';
import {
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import ChatHeader from '@/components/ChatHeader';
import ChatMessageList from '@/components/ChatMessageList';
import ChatInput from '@/components/ChatInput';
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
    autoSentRef.current = false;
    historyInitedRef.current = false;
    setMessages([]);
    setLoading(true);
    getAppVO(appId)
      .then((appData) => {
        setApp(appData);
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
        if (history.length > 0) {
          oldestCreateTimeRef.current = history[0].createTime;
        }
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

  // Update preview: skip during streaming to avoid iframe rebuild on every chunk.
  // currentCode is in deps so that when streaming ends with final code,
  // the effect runs with the latest currentCode value.
  useEffect(() => {
    if (isStreaming) return;
    const code = currentCode || (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'ai') return messages[i].content;
      }
      return '';
    })();
    if (code) {
      setPreviewCode(buildPreviewHtml(code, app?.codeGenType ?? null));
    }
  }, [isStreaming, currentCode, messages, app?.codeGenType, buildPreviewHtml]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  const handleSend = useCallback((text: string) => {
    if (!text || isStreamingRef.current || justFinishedStreamingRef.current || !appId) return;
    setMessages((prev) => [...prev, { id: newMsgId(), role: 'user', content: text, createTime: new Date().toISOString() }]);
    start(appId, text);
  }, [appId, start, isStreamingRef]);

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
      <ChatHeader
        appName={app?.appName || '未命名应用'}
        showPreview={showPreview}
        deploying={deploying}
        onDeploy={handleDeploy}
        onRename={handleRename}
        onDelete={handleDelete}
      />

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
            borderRight: '1px solid rgba(17,25,37,0.1)',
          }}
        >
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            currentCode={currentCode}
            hasMoreHistory={hasMoreHistory}
            loadingMore={loadingMore}
            sseError={sseError}
            onLoadMore={handleLoadMore}
          />

          <ChatInput
            isStreaming={isStreaming}
            onSend={handleSend}
            onCancel={cancel}
          />
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
                          background: 'rgba(17,25,37,0.02)',
                          borderRadius: 8,
                          color: 'rgba(17,25,37,0.45)',
                        }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <EyeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
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
