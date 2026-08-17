import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Button, App, Tabs, Spin, Modal, Input, Switch, Tooltip } from 'antd';
import {
  CodeOutlined,
  EyeOutlined,
  CloudUploadOutlined,
  EditOutlined,
  CopyOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import ChatHeader from '@/components/ChatHeader';
import ChatMessageList from '@/components/ChatMessageList';
import ChatInput from '@/components/ChatInput';
import CodePreview from '@/components/CodePreview';
import VueProjectViewer from '@/components/VueProjectViewer';
import EditPromptPopover from '@/components/EditPromptPopover';
import { useChatStream } from '@/hooks/useChatStream';
import { usePreviewSession } from '@/hooks/usePreviewSession';
import { useEditMode } from '@/hooks/useEditMode';
import { useTitle } from '@/hooks/useTitle';
import { useAuthStore } from '@/stores/useAuthStore';
import { applyEditModeToSrcDoc } from '@/utils/editModeInjector';
import { parseMultiFileCode, extractVueProjectFiles, type ParsedCode } from '@/utils/codeParser';
import { newMsgId } from '@/utils/msgId';
import { ERROR_CODES, CODE_GEN_TYPES } from '@/constants';
import { ApiError } from '@/api/error';
import {
  getAppVO,
  deleteMyApp,
  updateMyApp,
  deployApp,
  downloadAppCode,
  getGenerationStatus,
  getPreviewSource,
} from '@/api/app';
import { getLatestChatHistory, listChatHistoryBefore } from '@/api/chatHistory';
import type { ChatHistory } from '@/api/types';
import type { Message } from '@/types/chat';
import type { AppVO } from '@/api/types';

const PAGE_SIZE = 10;

function toMessage(h: Pick<ChatHistory, 'id' | 'messageType' | 'message' | 'createTime'>): Message {
  return {
    id: h.id,
    role: h.messageType === 'user' ? 'user' : 'ai',
    content: h.message,
    createTime: h.createTime,
  };
}

interface ChatLocationState {
  autoSendInit?: boolean;
  /** 进入聊天页的来源页面（首页 / 我的应用），返回按钮据此回跳 */
  from?: string;
}

// 跨 tab 协作：一个 tab 自动发送 initPrompt 时广播声明，其他 tab 跳过自己的自动发送
const autoSendChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fish-auto-send') : null;

export default function AppChat() {
  const { id: appId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { loginUser } = useAuthStore();
  const shouldAutoSendInit = (location.state as ChatLocationState | null)?.autoSendInit === true;
  // 返回按钮目标：显式来源优先；未记录来源时按登录状态回退（未登录回首页，登录回我的应用）
  const backTo = useMemo(() => {
    const from = (location.state as ChatLocationState | null)?.from;
    if (from === '/' || from === '/dashboard') return from;
    return loginUser ? '/dashboard' : '/';
  }, [location.state, loginUser]);

  // 应用 / 历史状态
  const [app, setApp] = useState<AppVO | null>(null);
  // 应用详情加载中：期间禁用依赖 app 的操作（重命名/删除/部署/下载），
  // 避免切换应用后仍操作上一个应用的 ID
  const [appLoading, setAppLoading] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  // 记录上一个 appId：切换应用时在渲染期重置纯 UI 状态，避免在 effect 里同步 setState
  const [prevAppId, setPrevAppId] = useState<string | undefined>(appId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewTab, setPreviewTab] = useState('preview');
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'preview'>('chat');
  const [deployUrl, setDeployUrl] = useState('');
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);

  const htmlPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const backgroundGenerationRef = useRef(false);
  const backgroundGenerationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backgroundGeneration, setBackgroundGeneration] = useState(false);
  const historyInitedRef = useRef(false);
  const autoSentRef = useRef(false);
  const historyLoadFailedRef = useRef(false);
  const oldestCreateTimeRef = useRef<string>('');
  const oldestChatHistoryIdRef = useRef<string>('');
  // 异步回调里判断响应是否已过期（用户已切换应用）
  const appIdRef = useRef<string>('');
  const codeGenTypeRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    codeGenTypeRef.current = app?.codeGenType;
  }, [app?.codeGenType]);

  const isOwner = loginUser != null && app != null && loginUser.id === app.userId;
  const isAdmin = loginUser?.userRole === 'admin';
  const canEdit = isOwner || isAdmin;

  // 预览会话 / 文件轮询（仅预览相关，不依赖编辑模式）
  const preview = usePreviewSession({
    appId,
    codeGenType: app?.codeGenType,
    canEdit,
    onProjectFilesLoadFailed: () => {
      message.warning('文件列表加载失败，请稍后重试');
    },
  });
  const {
    refreshHtmlPreview,
    setProjectFiles,
    markStreamStarted,
    markPreviewHandled,
    resetAll,
    stopAll,
    htmlPreviewUrl,
    setPreviewCode,
    setHtmlPreviewFrameLoading,
    previewCode,
    htmlPreviewFrameLoading,
    htmlPreviewLoading,
    projectFiles,
    savedMultiFileCode,
    sourceUnavailable,
    previewHandledRef,
    addProjectFile,
    fetchVueProjectFiles,
    handleStreamFinalized,
  } = preview;

  // 流式生成状态机
  const stream = useChatStream({
    appId,
    canEdit,
    backgroundGeneration,
    codeGenType: app?.codeGenType,
    onStreamStarted: markStreamStarted,
    onStreamFinalized: handleStreamFinalized,
    onToolFile: addProjectFile,
  });
  const {
    messages,
    setMessages,
    streamingMessage,
    isStreaming,
    isStreamingRef,
    preparing,
    currentCode,
    sseError,
    savingEdits,
    handleSend,
    beginStream,
    cancelStreaming,
    clearAll,
  } = stream;

  // 编辑模式（可视化点选）
  const edit = useEditMode({
    iframeRef: htmlPreviewIframeRef,
    canEdit,
    appId,
    backgroundGeneration,
    isStreamingRef,
    savingEdits,
    sendBatchEdits: stream.sendBatchEdits,
    setMessages,
    previewCode,
    htmlPreviewUrl,
  });
  const {
    editMode,
    selectedElement,
    popoverPosition,
    pendingEdits,
    handleEditModeChange,
    handleAddEdit,
    handleRemoveEdit,
    handleEditCancel,
    handleSendAllEdits,
  } = edit;

  useTitle(app?.appName || '对话');

  // 只读访问：精选应用公开可看，未登录/非主人非管理员隐藏编辑入口
  const isReadOnly = app != null && !canEdit;

  // 后台生成轮询：
  // 停止 SSE 后后端仍会跑完模型流，用应用级锁轮询等待结束，期间禁止再次生成/下载/部署
  const stopBackgroundGenerationCheck = useCallback(() => {
    if (backgroundGenerationTimerRef.current) {
      clearTimeout(backgroundGenerationTimerRef.current);
      backgroundGenerationTimerRef.current = null;
    }
  }, []);

  const waitForBackgroundGeneration = useCallback(
    (targetAppId: string) => {
      stopBackgroundGenerationCheck();
      const check = () => {
        getGenerationStatus(targetAppId)
          .then((busy) => {
            if (targetAppId !== appIdRef.current) return;
            backgroundGenerationRef.current = busy;
            setBackgroundGeneration(busy);
            if (!busy) {
              stopBackgroundGenerationCheck();
              const type = codeGenTypeRef.current;
              // 后台生成结束：刷新预览；Vue 项目顺带拉取最终文件树（覆盖停止/断线前的不完整列表）
              if (type) refreshHtmlPreview(targetAppId, type);
              if (type === CODE_GEN_TYPES.VUE_PROJECT) {
                fetchVueProjectFiles(targetAppId);
              }
              return;
            }
            backgroundGenerationTimerRef.current = window.setTimeout(check, 5000);
          })
          .catch(() => {
            if (targetAppId !== appIdRef.current) return;
            backgroundGenerationTimerRef.current = window.setTimeout(check, 10000);
          });
      };
      check();
    },
    [stopBackgroundGenerationCheck, refreshHtmlPreview, fetchVueProjectFiles],
  );

  // 进入页面时查询生成状态，繁忙则启动轮询
  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    getGenerationStatus(appId)
      .then((busy) => {
        if (cancelled) return;
        backgroundGenerationRef.current = busy;
        setBackgroundGeneration(busy);
        if (busy) waitForBackgroundGeneration(appId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stopBackgroundGenerationCheck();
    };
  }, [appId, stopBackgroundGenerationCheck, waitForBackgroundGeneration]);

  // 流式文本兜底：API 文件树尚未返回时先从 currentCode 提取 Vue 文件
  useEffect(() => {
    if (app?.codeGenType !== CODE_GEN_TYPES.VUE_PROJECT || !currentCode) return;
    if (projectFiles.length > 0) return;
    const files = extractVueProjectFiles(currentCode);
    if (files.length > 0) {
      setProjectFiles(files);
    }
  }, [app?.codeGenType, currentCode, projectFiles.length, setProjectFiles]);

  // 兜底：流结束后未走 handleStreamFinalized（异常路径）时，从历史消息刷新预览
  useEffect(() => {
    if (isStreaming) {
      markStreamStarted();
      return;
    }
    if (previewHandledRef.current) return;
    if (!appId || !app?.codeGenType) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'ai' && msg.content) {
        refreshHtmlPreview(appId, app.codeGenType);
        markPreviewHandled();
        return;
      }
    }
  }, [messages, appId, app?.codeGenType, refreshHtmlPreview, isStreaming, markStreamStarted, markPreviewHandled, previewHandledRef]);

  // 切换应用：在渲染期重置纯 UI 状态，避免在 effect 中同步 setState 引起级联渲染
  if (prevAppId !== appId) {
    setPrevAppId(appId);
    setApp(null);
    setAppLoading(true);
    setRenameOpen(false);
    setDeployModalOpen(false);
    setDeployUrl('');
    setHistoryLoading(true);
  }

  // 加载应用与历史
  useEffect(() => {
    if (!appId) return;
    // 切换应用：取消在途流与轮询（纯 UI 状态已由上方渲染期重置）
    clearAll();
    resetAll();
    stopBackgroundGenerationCheck();
    autoSentRef.current = false;
    historyLoadFailedRef.current = false;
    oldestCreateTimeRef.current = '';
    oldestChatHistoryIdRef.current = '';
    historyInitedRef.current = false;

    const myAppId = appId;
    appIdRef.current = appId;
    let appLoadFailed = false;

    getAppVO(myAppId)
      .then((appData) => {
        if (myAppId !== appIdRef.current) return;
        setApp(appData);
        setAppLoading(false);
        if (appData.codeGenType) {
          refreshHtmlPreview(myAppId, appData.codeGenType);
        }
      })
      .catch((err: unknown) => {
        if (myAppId !== appIdRef.current) return;
        appLoadFailed = true;
        setAppLoading(false);
        historyInitedRef.current = true;
        historyLoadFailedRef.current = true;
        setHistoryLoading(false);
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (err instanceof ApiError && err.code === ERROR_CODES.NO_AUTH_ERROR) {
          message.error('你没有权限访问这个应用');
          navigate('/dashboard');
          return;
        }
        if (status === 404) {
          message.error('应用不存在');
          navigate('/dashboard');
        } else {
          message.error('加载应用失败');
        }
      });

    getLatestChatHistory(myAppId, PAGE_SIZE)
      .then((history) => {
        if (myAppId !== appIdRef.current) return;
        if (appLoadFailed || !history) {
          setHistoryLoading(false);
          return;
        }
        historyInitedRef.current = true;
        const loaded = history.map(toMessage);
        // 合并而非覆盖：保留历史加载期间用户新发的本地消息（local_ 开头）
        setMessages((prev) => {
          const locals = prev.filter((m) => m.id.startsWith('local_'));
          return [...loaded, ...locals];
        });
        setHasMoreHistory(history.length >= PAGE_SIZE);
        if (history.length > 0) {
          oldestCreateTimeRef.current = history[0].createTime;
          oldestChatHistoryIdRef.current = history[0].id;
        }
        setHistoryLoading(false);
      })
      .catch((err: unknown) => {
        if (myAppId !== appIdRef.current) return;
        if (appLoadFailed) return;
        historyInitedRef.current = true;
        // 历史加载失败不等于历史为空：不能触发自动发送 initPrompt
        historyLoadFailedRef.current = true;
        setHistoryLoading(false);
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (err instanceof ApiError && err.code === ERROR_CODES.NO_AUTH_ERROR) {
          message.error('你没有权限访问这个应用');
          navigate('/dashboard');
          return;
        }
        if (status === 404) {
          message.error('应用不存在');
          navigate('/dashboard');
        } else {
          message.error('加载历史消息失败');
        }
      });
  }, [appId, navigate, message, stopBackgroundGenerationCheck, clearAll, setMessages, resetAll, refreshHtmlPreview]);

  // 自动发送 initPrompt：仅从创建页跳转过来且历史为空时触发，刷新/直接访问不触发
  const AUTO_SENT_KEY = 'fish-auto-sent-appids';
  const wasAutoSent = useCallback((id: string): boolean => {
    try {
      const raw = localStorage.getItem(AUTO_SENT_KEY);
      if (!raw) return false;
      const list = JSON.parse(raw) as string[];
      return Array.isArray(list) && list.includes(String(id));
    } catch {
      return false;
    }
  }, []);
  const markAutoSent = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem(AUTO_SENT_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(list)) return;
      const sid = String(id);
      if (!list.includes(sid)) {
        list.push(sid);
        // 只保留最近 50 个，避免无限增长
        localStorage.setItem(AUTO_SENT_KEY, JSON.stringify(list.slice(-50)));
      }
    } catch {
      // localStorage 不可用（隐私模式等）时静默跳过
    }
  }, []);

  useEffect(() => {
    if (
      !historyInitedRef.current ||
      historyLoadFailedRef.current ||
      autoSentRef.current ||
      backgroundGeneration ||
      !appId ||
      !app ||
      !shouldAutoSendInit ||
      !canEdit ||
      messages.length > 0 ||
      !app.initPrompt
    ) {
      return;
    }
    if (wasAutoSent(appId)) return;
    autoSentRef.current = true;
    markAutoSent(appId);
    navigate(location.pathname, { replace: true, state: null });
    autoSendChannel?.postMessage({ type: 'auto-sending', appId });
    setMessages([
      { id: newMsgId(), role: 'user', content: app.initPrompt, createTime: new Date().toISOString() },
    ]);
    beginStream(app.initPrompt);
  }, [
    messages.length,
    app,
    backgroundGeneration,
    canEdit,
    appId,
    beginStream,
    wasAutoSent,
    markAutoSent,
    shouldAutoSendInit,
    navigate,
    location.pathname,
    setMessages,
  ]);

  // 跨 tab 去重：其他 tab 广播自动发送时镜像 localStorage 标记
  useEffect(() => {
    if (!autoSendChannel || !appId) return;
    const handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; appId?: string } | undefined;
      if (data?.type === 'auto-sending' && data.appId === appId) {
        markAutoSent(appId);
      }
    };
    autoSendChannel.addEventListener('message', handler);
    return () => autoSendChannel.removeEventListener('message', handler);
  }, [appId, markAutoSent]);

  const showPreview = messages.length >= 2 || isStreaming;

  // 分页加载更早的历史
  const handleLoadMore = useCallback(async () => {
    if (!appId || loadingMore || !hasMoreHistory || !oldestCreateTimeRef.current || !oldestChatHistoryIdRef.current) return;
    setLoadingMore(true);
    try {
      const older = await listChatHistoryBefore(appId, oldestCreateTimeRef.current, oldestChatHistoryIdRef.current, PAGE_SIZE);
      if (older.length > 0) {
        const olderMessages = older.map(toMessage);
        setMessages((prev) => [...olderMessages, ...prev]);
        oldestCreateTimeRef.current = older[0].createTime;
        oldestChatHistoryIdRef.current = older[0].id;
      }
      setHasMoreHistory(older.length >= PAGE_SIZE);
    } catch {
      message.error('加载历史消息失败');
    } finally {
      setLoadingMore(false);
    }
  }, [appId, loadingMore, hasMoreHistory, message, setMessages]);

  // 预览 / 编辑模式桥接
  const handlePreviewFrameLoad = useCallback(() => {
    setHtmlPreviewFrameLoading(false);
  }, [setHtmlPreviewFrameLoading]);

  const addBaseHrefForSrcDoc = useCallback((html: string, baseUrl: string) => {
    if (!html || !baseUrl) return html;
    const escapedBase = baseUrl.replace(/"/g, '&quot;');
    const baseTag = `<base href="${escapedBase}">`;
    const withoutExistingBase = html.replace(/<base\b[^>]*>/i, '');
    if (/<head(\s[^>]*)?>/i.test(withoutExistingBase)) {
      return withoutExistingBase.replace(/<head(\s[^>]*)?>/i, `<head$1>\n${baseTag}`);
    }
    return `${baseTag}\n${withoutExistingBase}`;
  }, []);

  const isVuePreview = app?.codeGenType === CODE_GEN_TYPES.VUE_PROJECT;
  const isPreviewIsolated = htmlPreviewUrl
    ? new URL(htmlPreviewUrl, window.location.origin).origin !== window.location.origin
    : false;
  const previewBlockedByOrigin = Boolean(htmlPreviewUrl) && !isPreviewIsolated;
  const supportsEditMode = Boolean(app?.codeGenType) && canEdit && (!isVuePreview || isPreviewIsolated);
  const hasEditablePreview = Boolean(htmlPreviewUrl);
  // 有对话历史但无预览会话（未生成过代码/生成失败）时，占位文案提示"未生成"而非引导发消息
  const hasAiHistory = messages.some((m) => m.role === 'ai' && m.content);
  const showPreviewToolbar = (showPreview || Boolean(htmlPreviewUrl)) && hasEditablePreview;
  const editModeTooltip = isVuePreview && !isPreviewIsolated
    ? '请先配置独立预览域名'
    : supportsEditMode
      ? '开启后可点击预览页面中的任意元素进行修改'
      : '预览加载完成后可开启可视化编辑';

  // 编辑模式预览：Vue 走同源 URL + ?edit=1 注入；HTML/MULTI_FILE 走 srcDoc fetch 源码再注入
  useEffect(() => {
    if (isVuePreview) {
      setPreviewCode('');
      return;
    }
    if (!editMode || !supportsEditMode || !htmlPreviewUrl || !appId) {
      setPreviewCode('');
      return;
    }
    let cancelled = false;
    getPreviewSource(appId)
      .then((source) => {
        if (!cancelled) setPreviewCode(addBaseHrefForSrcDoc(source.html, htmlPreviewUrl));
      })
      .catch(() => {
        if (!cancelled) setPreviewCode('');
      });
    return () => {
      cancelled = true;
    };
  }, [addBaseHrefForSrcDoc, appId, editMode, htmlPreviewUrl, supportsEditMode, isVuePreview, setPreviewCode]);

  const htmlPreviewSrcDoc = useMemo(() => {
    if (!previewCode) return '';
    return applyEditModeToSrcDoc(previewCode, editMode && supportsEditMode);
  }, [previewCode, editMode, supportsEditMode]);

  // srcDoc 直接写属性，保证 iframe 每次都以新内容重新解析渲染
  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || !htmlPreviewSrcDoc) return;
    if (iframe.srcdoc !== htmlPreviewSrcDoc) {
      iframe.srcdoc = htmlPreviewSrcDoc;
    }
  }, [htmlPreviewSrcDoc]);

  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || editMode || !htmlPreviewUrl) return;
    if (iframe.getAttribute('srcdoc') != null) {
      iframe.removeAttribute('srcdoc');
    }
    if (iframe.getAttribute('src') !== htmlPreviewUrl) {
      iframe.setAttribute('src', htmlPreviewUrl);
    }
  }, [editMode, htmlPreviewUrl]);

  // 卸载清理
  useEffect(() => {
    return () => {
      stopAll();
      stopBackgroundGenerationCheck();
    };
  }, [stopAll, stopBackgroundGenerationCheck]);

  // 取消 / 停止
  const handleCancel = useCallback(() => {
    // 浏览器可立即停止接收 SSE，但后端无法安全取消模型/工具调用，轮询应用锁等待结束
    backgroundGenerationRef.current = true;
    setBackgroundGeneration(true);
    message.info('已停止接收输出，后台正在完成当前生成，请稍候');
    cancelStreaming();
    markStreamStarted();
    if (appId) waitForBackgroundGeneration(appId);
  }, [appId, message, cancelStreaming, waitForBackgroundGeneration, markStreamStarted]);

  const isGenerationBusy = isStreaming || backgroundGeneration;

  // 重命名 / 删除 / 下载 / 部署
  const handleDelete = () => {
    // 校验 app 属于当前路由（切换应用加载期间 app 为 null，直接拦截）
    if (!app || String(app.id) !== String(appId)) return;
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
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleRename = () => {
    if (!app || String(app.id) !== String(appId)) return;
    setRenameValue(app.appName || '');
    setRenameOpen(true);
  };

  const handleRenameOk = async () => {
    if (!app || String(app.id) !== String(appId) || !renameValue.trim()) return;
    setRenameLoading(true);
    try {
      await updateMyApp({ id: app.id, appName: renameValue.trim() });
      setApp({ ...app, appName: renameValue.trim() });
      message.success('重命名成功');
      setRenameOpen(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleCopyDeployUrl = useCallback(async () => {
    if (!deployUrl) return;
    try {
      await navigator.clipboard.writeText(deployUrl);
      message.success('部署地址已复制');
    } catch {
      message.error('复制失败');
    }
  }, [deployUrl, message]);

  const handleDownload = useCallback(async () => {
    if (!appId || appLoading) return;
    if (!isOwner) {
      message.warning('只有应用创建者可以下载代码');
      return;
    }
    if (isGenerationBusy) {
      message.info('正在生成代码，请完成后再下载');
      return;
    }
    try {
      await downloadAppCode(appId);
      message.success('正在下载代码');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '下载失败');
    }
  }, [appId, appLoading, isOwner, isGenerationBusy, message]);

  const handleDeploy = useCallback(async () => {
    if (!appId || appLoading) return;
    if (!isOwner) {
      message.warning('只有应用创建者可以部署这个应用');
      return;
    }
    if (isGenerationBusy) {
      message.info('正在生成代码，请完成后再部署');
      return;
    }
    setDeployError('');
    setDeploying(true);
    try {
      const url = await deployApp({ appId });
      setDeployUrl(url);
      setDeployModalOpen(true);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : '部署失败');
    } finally {
      setDeploying(false);
    }
  }, [appId, appLoading, isOwner, isGenerationBusy, message]);

  // 多文件代码解析：流式内容 > 历史记录 > 已落盘文件
  const parsedCode = useMemo(() => {
    if (app?.codeGenType !== 'multi_file') return null;

    const isParsedCode = (code: ParsedCode): boolean =>
      Boolean(code.htmlCode || code.cssCode || code.jsCode);
    if (currentCode) {
      const streamedCode = parseMultiFileCode(currentCode);
      // 流式中 html 先闭合、css/js 后到，只拿到 html 时继续往下兜底
      if (streamedCode.cssCode && streamedCode.jsCode && isParsedCode(streamedCode)) {
        return streamedCode;
      }
      if (streamedCode.htmlCode && (streamedCode.cssCode || streamedCode.jsCode)) {
        return streamedCode;
      }
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'ai') continue;
      const historyCode = parseMultiFileCode(messages[i].content);
      if (isParsedCode(historyCode)) return historyCode;
    }
    return savedMultiFileCode;
  }, [currentCode, messages, savedMultiFileCode, app?.codeGenType]);

  return (
    <div className="chat-workbench">
      <ChatHeader
        appName={app?.appName || '未命名应用'}
        isOwner={isOwner}
        showPreview={showPreview}
        isStreaming={isGenerationBusy}
        appLoading={appLoading}
        backTo={backTo}
        deploying={deploying}
        onDeploy={handleDeploy}
        onDownload={handleDownload}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      {/* 重命名弹窗 */}
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

      <Modal
        title="部署成功"
        open={deployModalOpen}
        onCancel={() => setDeployModalOpen(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyDeployUrl}>
            复制链接
          </Button>,
          <Button
            key="open"
            type="primary"
            icon={<ExportOutlined />}
            disabled={!deployUrl}
            onClick={() => window.open(deployUrl, '_blank', 'noopener,noreferrer')}
          >
            打开链接
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'rgba(17,25,37,0.65)' }}>部署地址</div>
          <Input value={deployUrl} readOnly onClick={(e) => e.currentTarget.select()} />
        </div>
      </Modal>

      {/* 主内容：左右分栏 */}
      <div className={`chat-main ${mobilePanel === 'preview' ? 'chat-main--mobile-preview' : ''}`}>
        <div className="chat-mobile-panel-switch" role="tablist" aria-label="移动端工作区">
          <Button
            type={mobilePanel === 'chat' ? 'primary' : 'text'}
            onClick={() => setMobilePanel('chat')}
            icon={<CodeOutlined />}
          >
            对话
          </Button>
          <Button
            type={mobilePanel === 'preview' ? 'primary' : 'text'}
            onClick={() => setMobilePanel('preview')}
            icon={<EyeOutlined />}
          >
            预览
          </Button>
        </div>
        {/* 左侧：对话面板 */}
        <div
          className="chat-left-panel"
          style={{
            width: '42%',
            minWidth: 430,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ChatMessageList
            messages={messages}
            streamingMessage={streamingMessage}
            hasMoreHistory={hasMoreHistory}
            initialLoading={historyLoading}
            loadingMore={loadingMore}
            sseError={sseError}
            onLoadMore={handleLoadMore}
          />

          <ChatInput
            isStreaming={isStreaming}
            isBackgroundGenerating={backgroundGeneration}
            preparing={preparing}
            disabled={isReadOnly}
            onSend={handleSend}
            onCancel={handleCancel}
            editMode={editMode}
            pendingEdits={pendingEdits}
            savingEdits={savingEdits}
            onRemoveEdit={handleRemoveEdit}
            onSaveEdits={handleSendAllEdits}
          />
        </div>

        {/* 右侧：预览面板 */}
        <div className="chat-preview-panel">
          <Tabs
            activeKey={previewTab}
            onChange={setPreviewTab}
            className="chat-preview-tabs"
            tabBarExtraContent={
              showPreviewToolbar && supportsEditMode ? (
                <div className="chat-edit-toolbar">
                  <EditOutlined className={editMode ? 'is-active' : undefined} />
                  <span>编辑模式</span>
                  <Tooltip title={editModeTooltip}>
                    <Switch
                      size="small"
                      checked={editMode}
                      onChange={handleEditModeChange}
                      disabled={isGenerationBusy}
                    />
                  </Tooltip>
                  <span className="chat-edit-hint">
                    {editMode ? '悬停高亮，点击元素即可选中' : '开启后点击预览元素即可选中并修改'}
                  </span>
                </div>
              ) : null
            }
            items={[
              {
                key: 'preview',
                label: (
                  <span>
                    <EyeOutlined /> 预览
                  </span>
                ),
                children: (
                  <div className="chat-tab-fill">
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                      {previewBlockedByOrigin ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 77, 79, 0.06)', borderRadius: 8, color: '#cf1322', padding: 24, textAlign: 'center' }}>
                          预览服务必须使用与主站不同的域名或端口，请检查 PREVIEW_ORIGIN 配置。
                        </div>
                      ) : htmlPreviewUrl ? (
                        <>
                          {editMode ? (
                            isVuePreview ? (
                              <iframe
                                ref={htmlPreviewIframeRef}
                                src={htmlPreviewUrl}
                                key={`vue-edit:${htmlPreviewUrl}`}
                                sandbox="allow-scripts allow-same-origin allow-forms"
                                onLoad={handlePreviewFrameLoad}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  borderRadius: 8,
                                  pointerEvents: 'auto',
                                }}
                                title="Vue 应用预览（编辑模式）"
                              />
                            ) : htmlPreviewSrcDoc ? (
                              <iframe
                                ref={htmlPreviewIframeRef}
                                srcDoc={htmlPreviewSrcDoc}
                                key={`srcdoc:${htmlPreviewSrcDoc}`}
                                sandbox="allow-scripts allow-forms"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  borderRadius: 8,
                                  pointerEvents: 'auto',
                                }}
                                title="应用预览"
                              />
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,25,37,0.02)', borderRadius: 8, color: 'rgba(17,25,37,0.45)' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <Spin size="large" style={{ marginBottom: 16 }} />
                                  <div>正在加载可编辑预览...</div>
                                </div>
                              </div>
                            )
                          ) : (
                            <>
                              <iframe
                                ref={htmlPreviewIframeRef}
                                src={htmlPreviewUrl}
                                key={`url:${htmlPreviewUrl}`}
                                // 独立预览域与主站隔离，可保留生成应用的本地存储
                                sandbox="allow-scripts allow-same-origin allow-forms"
                                onLoad={handlePreviewFrameLoad}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  borderRadius: 8,
                                  opacity: htmlPreviewFrameLoading ? 0 : 1,
                                  transition: 'opacity 120ms ease',
                                }}
                                title={app?.codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? 'Vue 应用预览' : '应用预览'}
                              />
                              {htmlPreviewFrameLoading && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(17,25,37,0.02)',
                                    borderRadius: 8,
                                    color: 'rgba(17,25,37,0.45)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <div style={{ textAlign: 'center' }}>
                                    <Spin size="large" style={{ marginBottom: 16 }} />
                                    <div>正在加载预览...</div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          {/* key 强制每次新选中重挂载：textarea 自动聚焦、草稿重置 */}
                          {editMode && selectedElement && popoverPosition && (
                            <EditPromptPopover
                              key={selectedElement.selector}
                              element={selectedElement}
                              position={popoverPosition}
                              sending={isGenerationBusy}
                              onSend={handleAddEdit}
                              onCancel={handleEditCancel}
                            />
                          )}
                        </>
                      ) : app?.codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? (
                        deploying ? (
                          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <Spin size="large" />
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#111925' }}>正在部署 Vue 项目...</div>
                          </div>
                        ) : deployError ? (
                          <>
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                              <div style={{ fontSize: 48 }}>❌</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#f5222d' }}>部署失败</div>
                              <div style={{ fontSize: 14, color: 'rgba(17,25,37,0.65)', textAlign: 'center', maxWidth: 360 }}>
                                {deployError}
                              </div>
                              <Button
                                className="btn-gradient"
                                icon={<CloudUploadOutlined />}
                                onClick={handleDeploy}
                                size="large"
                              >
                                重新部署
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,25,37,0.02)', borderRadius: 8, color: 'rgba(17,25,37,0.45)' }}>
                            <div style={{ textAlign: 'center' }}>
                              {isStreaming ? (
                                <>
                                  <CodeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                  <div>AI 正在生成 Vue 工程文件...</div>
                                </>
                              ) : htmlPreviewLoading ? (
                                <>
                                  <Spin size="large" style={{ marginBottom: 16 }} />
                                  <div>正在加载后端生成的预览文件...</div>
                                </>
                              ) : hasAiHistory ? (
                                <>
                                  <EyeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                  <div>尚未生成代码</div>
                                </>
                              ) : (
                                <>
                                  <EyeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                  <div>发送消息后，预览将在这里显示</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
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
                            {htmlPreviewLoading ? (
                              <>
                                <Spin size="large" style={{ marginBottom: 16 }} />
                                <div>正在加载后端生成的预览文件...</div>
                              </>
                            ) : hasAiHistory ? (
                              <>
                                <EyeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                <div>尚未生成代码</div>
                              </>
                            ) : (
                              <>
                                <EyeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                <div>发送消息后，预览将在这里显示</div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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
                  <div className="chat-tab-fill">
                    {app?.codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? (
                      <VueProjectViewer files={projectFiles} />
                    ) : app?.codeGenType === 'multi_file' ? (
                      sourceUnavailable ? (
                        <div
                          style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(17,25,37,0.45)',
                            fontSize: 13,
                          }}
                        >
                          源码仅对应用作者和管理员开放
                        </div>
                      ) : (
                        <Tabs
                          defaultActiveKey="html"
                          size="small"
                          className="multi-file-code-tabs"
                          items={[
                            {
                              key: 'html',
                              label: (
                                <span className="multi-file-code-tab-label">
                                  <span className="multi-file-code-tab-badge multi-file-code-tab-badge--html">&lt;/&gt;</span>
                                  <span>index.html</span>
                                </span>
                              ),
                              children: (
                                <div style={{ height: 'calc(100vh - 190px)' }}>
                                  <CodePreview
                                    code={parsedCode?.htmlCode || '// 等待 AI 生成...'}
                                    language="html"
                                    isStreaming={isStreaming}
                                  />
                                </div>
                              ),
                            },
                            {
                              key: 'css',
                              label: (
                                <span className="multi-file-code-tab-label">
                                  <span className="multi-file-code-tab-badge multi-file-code-tab-badge--css">#</span>
                                  <span>style.css</span>
                                </span>
                              ),
                              children: (
                                <div style={{ height: 'calc(100vh - 190px)' }}>
                                  <CodePreview
                                    code={parsedCode?.cssCode || '// 等待 AI 生成...'}
                                    language="css"
                                    isStreaming={isStreaming}
                                  />
                                </div>
                              ),
                            },
                            {
                              key: 'js',
                              label: (
                                <span className="multi-file-code-tab-label">
                                  <span className="multi-file-code-tab-badge multi-file-code-tab-badge--js">JS</span>
                                  <span>script.js</span>
                                </span>
                              ),
                              children: (
                                <div style={{ height: 'calc(100vh - 190px)' }}>
                                  <CodePreview
                                    code={parsedCode?.jsCode || '// 等待 AI 生成...'}
                                    language="javascript"
                                    isStreaming={isStreaming}
                                  />
                                </div>
                              ),
                            },
                          ]}
                        />
                      )
                    ) : (
                      <CodePreview
                        code={currentCode}
                        language="html"
                        isStreaming={isStreaming}
                      />
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
