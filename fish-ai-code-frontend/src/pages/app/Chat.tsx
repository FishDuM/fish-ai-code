import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, Input, Typography, Space, message, Tabs, Spin, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  DeleteOutlined,
  EditOutlined,
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import ChatMessage from '@/components/ChatMessage';
import CodePreview from '@/components/CodePreview';
import { useSSE } from '@/hooks/useSSE';
import { useTitle } from '@/hooks/useTitle';
import { getAppVO, deleteMyApp, updateMyApp } from '@/api/app';
import type { AppVO } from '@/api/types';

const { Text } = Typography;

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export default function AppChat() {
  const { id: appId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isStreaming, currentCode, start, cancel, reset } = useSSE();

  const [app, setApp] = useState<AppVO | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [previewTab, setPreviewTab] = useState('preview');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<ReturnType<typeof start> | null>(null);
  const accumulatedRef = useRef('');

  useTitle(app?.appName || '对话');

  // Load app info
  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    getAppVO(appId)
      .then(setApp)
      .catch(() => {
        message.error('应用不存在');
        navigate('/dashboard');
      })
      .finally(() => setLoading(false));
  }, [appId, navigate]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentCode]);

  // Debounced preview update during streaming
  useEffect(() => {
    if (!isStreaming) {
      if (currentCode) setPreviewCode(currentCode);
      return;
    }
    const timer = setTimeout(() => setPreviewCode(currentCode), 500);
    return () => clearTimeout(timer);
  }, [currentCode, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming || !appId) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    accumulatedRef.current = '';

    start(appId, text);
  }, [input, isStreaming, appId, start]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
    Modal.confirm({
      title: '重命名应用',
      content: (
        <Input
          defaultValue={app.appName || ''}
          id="rename-input"
          placeholder="应用名称"
          maxLength={50}
        />
      ),
      onOk: async () => {
        const input = document.getElementById('rename-input') as HTMLInputElement;
        const newName = input?.value?.trim();
        if (!newName) return;
        try {
          await updateMyApp({ id: app.id, appName: newName });
          setApp({ ...app, appName: newName });
          message.success('重命名成功');
        } catch (err: any) {
          message.error(err.message || '操作失败');
        }
      },
    });
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
          <Button type="text" icon={<EditOutlined />} onClick={handleRename}>
            重命名
          </Button>
          <Button type="text" danger icon={<DeleteOutlined />} onClick={handleDelete}>
            删除
          </Button>
        </Space>
      </div>

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
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 80 }}>
                <CodeOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>输入描述，AI 将为你生成网站代码</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} />
            ))}
            {isStreaming && (
              <ChatMessage role="ai" content={currentCode} isStreaming />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', background: '#fff' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
                    {previewCode ? (
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
                    <CodePreview code={previewCode} />
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
