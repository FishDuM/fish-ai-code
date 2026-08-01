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
import { useSSE } from '@/hooks/useSSE';
import { useTitle } from '@/hooks/useTitle';
import { useAuthStore } from '@/stores/useAuthStore';
import { applyEditModeToSrcDoc, buildEditModeScript } from '@/utils/editModeInjector';
import { buildBatchEditPrompt } from '@/utils/editPromptBuilder';
import { getVueFilesListUrl } from '@/utils/vueProjectUrls';
import {
  EDIT_MODE_SOURCE,
  type SelectedElement,
  type EditModeControlMessage,
} from '@/types/editMode';
import { API_BASE_URL, ERROR_CODES } from '@/constants';
import { ApiError } from '@/api/error';

import {
  getAppVO,
  deleteMyApp,
  updateMyApp,
  deployApp,
  downloadAppCode,
  getGenerationStatus,
} from '@/api/app';
import { getLatestChatHistory, listChatHistoryBefore } from '@/api/chatHistory';
import {
  parseMultiFileCode,
  extractVueProjectFiles,
  cleanVueOutput,
  type ParsedCode,
} from '@/utils/codeParser';
import type { AppVO } from '@/api/types';

const PAGE_SIZE = 10;

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createTime: string;
  /** Runtime-only flag. Only meaningful on the live streaming bubble;
   *  never set on history entries loaded from the backend. */
  isStreaming?: boolean;
}

interface ProjectFile {
  path: string;
  content: string;
}

function haveSameProjectFiles(current: ProjectFile[], next: ProjectFile[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((file, index) =>
    file.path === next[index]?.path && file.content === next[index]?.content,
  );
}

interface ChatLocationState {
  autoSendInit?: boolean;
}

let nextMsgId = 0;
function newMsgId(): string {
  return `local_${nextMsgId++}_${Date.now()}`;
}

function buildHtmlPreviewBaseUrl(
  targetAppId: string | undefined,
  codeGenType: string | null | undefined,
): string {
  if (!targetAppId || !codeGenType) return '';
  return `${API_BASE_URL}/static/${codeGenType}_${targetAppId}/`;
}

// Cross-tab coordination channel: when one tab auto-sends a fresh app's
// initPrompt, broadcast the claim so any other tab looking at the same
// appId can mark itself and skip its own auto-send (otherwise both tabs
// race and the backend gets two identical init messages + two SSE jobs).
// `BroadcastChannel` is supported in every browser this app targets; the
// optional-chained usage on the send side keeps the feature no-op if it
// ever runs in an environment without it (older Safari, JSDOM tests).
const autoSendChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fish-auto-send') : null;

export default function AppChat() {
  const { id: appId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { loginUser } = useAuthStore();
  const shouldAutoSendInit = (location.state as ChatLocationState | null)?.autoSendInit === true;

  // ── State ────────────────────────────────────────────────────────
  const [app, setApp] = useState<AppVO | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Live AI bubble that the SSE stream is currently writing into. We hold
  // this OUTSIDE `messages` so the committed history array's reference
  // stays stable across the ~5 writes/sec cadence of streaming — when the
  // stream finishes, this single message gets merged into `messages` and
  // cleared, with the React component instance preserved the whole time
  // (no unmount/remount, which was the source of the "markdown lost after
  // stream ends" bug).
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  // HTML used only for edit mode injection. Normal preview loads the
  // backend-saved index.html by URL so it matches the real generated files.
  const [previewCode, setPreviewCode] = useState('');
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState('');
  const [htmlPreviewCode, setHtmlPreviewCode] = useState('');
  // 历史会话不会重放 SSE，因此 currentCode 为空。多文件代码栏要直接读取
  // 后端已保存的 index.html / style.css / script.js，不能只依赖流式文本。
  const [savedMultiFileCode, setSavedMultiFileCode] = useState<ParsedCode | null>(null);
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false);
  const [htmlPreviewFrameLoading, setHtmlPreviewFrameLoading] = useState(false);
  const [previewTab, setPreviewTab] = useState('preview');
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'preview'>('chat');
  const [deployUrl, setDeployUrl] = useState('');
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [renameValue, setRenameValue] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // `停止` aborts only this browser's SSE connection. The backend deliberately
  // continues the model flow until it reaches a safe terminal point, so keep
  // the UI blocked while that application-level lock is still held.
  const [backgroundGeneration, setBackgroundGeneration] = useState(false);

  // ── Edit mode (visual element selector) ───────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  // 批量编辑队列：编辑模式下点元素→输入指令→加入队列（不立即发送），
  // 点"保存"后按顺序串行发送。上限 15 条。
  const [pendingEdits, setPendingEdits] = useState<Array<{
    id: string;
    element: SelectedElement;
    instruction: string;
  }>>([]);
  const pendingEditsRef = useRef(pendingEdits);
  useEffect(() => {
    pendingEditsRef.current = pendingEdits;
  }, [pendingEdits]);
  // 发送操作是否进行中（控制按钮 loading，一次发送耗时较长）
  const [savingEdits, setSavingEdits] = useState(false);
  // Last selector the user picked, so we can re-highlight it after the
  // AI finishes rewriting the page.
  const [pendingHighlightSelector, setPendingHighlightSelector] = useState<string | null>(null);
  // Position of the prompt popover in parent (page) coordinates.
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const htmlPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlPreviewPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlPreviewFetchAbortRef = useRef<AbortController | null>(null);
  const generationStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vueEditModeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editModeRef = useRef(editMode);
  const pendingHighlightSelectorRef = useRef<string | null>(pendingHighlightSelector);
  const streamingMessageRef = useRef(streamingMessage);
  const codeGenTypeRef = useRef(app?.codeGenType);
  // 记录"本次流开始时"的旧代码值：useSSE 故意不清 currentCode（防预览 iframe 闪白），
  // 新流首个 chunk 到达前 cleanedCode 仍是旧值，同步 effect 靠它区分"旧代码"与"新流内容"。
  const streamStartCodeRef = useRef('');
  // The callback is declared below because it depends on other hooks.  Keep a
  // stable no-op until the synchronising effect assigns the real callback.
  const refreshHtmlPreviewRef = useRef<(targetAppId?: string, codeGenType?: string | null) => void>(() => {});
  const historyInitedRef = useRef(false);
  const autoSentRef = useRef(false);

  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);
  useEffect(() => {
    codeGenTypeRef.current = app?.codeGenType;
  }, [app?.codeGenType]);
  // Set to true if the initial chat-history load FAILED (network error /
  // 5xx). Distinct from "history is empty" — a failed load must NOT
  // become a green light to auto-send the user's initPrompt, otherwise
  // a transient backend blip silently turns into a wasted AI generation
  // and a stray user message in the conversation.
  const historyLoadFailedRef = useRef(false);
  const oldestCreateTimeRef = useRef<string>('');
  const oldestChatHistoryIdRef = useRef<string>('');
  // Mirror of `appId` for async callbacks to detect stale responses after navigation.
  const appIdRef = useRef<string>('');

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    pendingHighlightSelectorRef.current = pendingHighlightSelector;
  }, [pendingHighlightSelector]);

  const postEditModeMessage = useCallback((msg: EditModeControlMessage) => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe) return;
    try {
      iframe.contentWindow?.postMessage(
        { source: EDIT_MODE_SOURCE, ...msg },
        '*',
      );
    } catch {
      // cross-origin or detached — ignore
    }
  }, []);

  // Vue 项目：iframe 加载同源 URL（经 Vite/nginx 代理，浏览器视角同源），
  // 在 onLoad 后把编辑脚本直接注入 iframe 文档（同源可访问 contentDocument）。
  // 不用 srcDoc 是因为 Vue Router（history 模式）依赖真实 URL，srcDoc 的
  // opaque origin 无法操作 history API，页面会抛 SecurityError 白屏。
  const injectEditScriptIntoVueFrame = useCallback((iframe: HTMLIFrameElement) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const s = doc.createElement('script');
      s.textContent = buildEditModeScript();
      (doc.body || doc.documentElement).appendChild(s);
    } catch {
      // cross-origin or detached — 编辑模式注入失败则保持普通预览
    }
  }, []);

  const getHtmlPreviewBaseUrl = useCallback((
    targetAppId: string | undefined = appId,
    codeGenType: string | null | undefined = app?.codeGenType,
  ) => {
    return buildHtmlPreviewBaseUrl(targetAppId, codeGenType);
  }, [app?.codeGenType, appId]);

  const stopHtmlPreviewPolling = useCallback(() => {
    if (htmlPreviewPollTimerRef.current) {
      clearTimeout(htmlPreviewPollTimerRef.current);
      htmlPreviewPollTimerRef.current = null;
    }
    htmlPreviewFetchAbortRef.current?.abort();
    htmlPreviewFetchAbortRef.current = null;
  }, []);

  const stopVueEditModeSync = useCallback(() => {
    if (vueEditModeSyncTimerRef.current) {
      clearTimeout(vueEditModeSyncTimerRef.current);
      vueEditModeSyncTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!appId) return;
    let disposed = false;

    const pollStatus = async () => {
      try {
        const busy = await getGenerationStatus(appId);
        if (disposed) return;
        setBackgroundGeneration(busy);
        if (busy) {
          generationStatusTimerRef.current = setTimeout(pollStatus, 1500);
        }
      } catch {
        // A status-check failure must not unlock the UI optimistically after
        // the user stopped SSE. Retry while we already know a task is active.
        if (!disposed && backgroundGeneration) {
          generationStatusTimerRef.current = setTimeout(pollStatus, 3000);
        }
      }
    };

    pollStatus();
    return () => {
      disposed = true;
      if (generationStatusTimerRef.current) {
        clearTimeout(generationStatusTimerRef.current);
        generationStatusTimerRef.current = null;
      }
    };
  }, [appId, backgroundGeneration]);

  const refreshHtmlPreviewFromFile = useCallback((
    targetAppId: string | undefined = appId,
    codeGenType: string | null | undefined = app?.codeGenType,
  ) => {
    const baseUrl = getHtmlPreviewBaseUrl(targetAppId, codeGenType);
    if (!baseUrl || !targetAppId) return;

    stopHtmlPreviewPolling();
    setHtmlPreviewLoading(true);
    setHtmlPreviewCode('');

    let retries = 0;
    const maxRetries = 60;
    const poll = () => {
      const controller = new AbortController();
      htmlPreviewFetchAbortRef.current = controller;
      const t = Date.now();
      fetch(`${baseUrl}?t=${t}`, {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (targetAppId !== appIdRef.current) return;
          if (!response.ok) throw new Error('preview file not ready');
          const text = await response.text();
          if (!text || text.length < 20) throw new Error('preview file empty');
          if (codeGenType === 'multi_file') {
            const readCodeFile = async (fileName: string): Promise<string> => {
              try {
                const fileResponse = await fetch(`${baseUrl}${fileName}?t=${t}`, {
                  cache: 'no-store',
                  credentials: 'include',
                  signal: controller.signal,
                });
                return fileResponse.ok ? fileResponse.text() : '';
              } catch {
                return '';
              }
            };
            const [cssCode, jsCode] = await Promise.all([
              readCodeFile('style.css'),
              readCodeFile('script.js'),
            ]);
            if (targetAppId !== appIdRef.current) return;
            setSavedMultiFileCode({ htmlCode: text, cssCode, jsCode });
          }
          setHtmlPreviewCode(text);
          setHtmlPreviewFrameLoading(true);
          setHtmlPreviewUrl(`${baseUrl}?t=${Date.now()}`);
          setHtmlPreviewLoading(false);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name === 'AbortError') return;
          if (targetAppId !== appIdRef.current) return;
          if (++retries < maxRetries) {
            htmlPreviewPollTimerRef.current = setTimeout(poll, 500);
            return;
          }
          setHtmlPreviewLoading(false);
        });
    };

    poll();
  }, [app?.codeGenType, appId, getHtmlPreviewBaseUrl, stopHtmlPreviewPolling]);

  useEffect(() => {
    refreshHtmlPreviewRef.current = refreshHtmlPreviewFromFile;
  }, [refreshHtmlPreviewFromFile]);

  // Translate an element's rect (in iframe viewport coords) to page coords,
  // placing the popover just below the element. If the element sits close
  // to the bottom of the viewport, flip the popover above it instead.
  const computePopoverPosition = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const iframeEl = htmlPreviewIframeRef.current;
      if (!iframeEl) return null;
      const iframeRect = iframeEl.getBoundingClientRect();
      const POPOVER_HEIGHT_ESTIMATE = 180;
      const GAP = 8;
      const absoluteTop = iframeRect.top + rect.y + rect.height + GAP;
      const wouldOverflow =
        absoluteTop + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - GAP;
      const top = wouldOverflow
        ? Math.max(GAP, iframeRect.top + rect.y - POPOVER_HEIGHT_ESTIMATE - GAP)
        : absoluteTop;
      return {
        left: iframeRect.left + rect.x,
        top,
      };
    },
    [],
  );

  // Listen for postMessage events from the preview iframe's edit-mode
  // injector. We keep this listener mounted regardless of editMode so
  // late-arriving `ready` / `select` events (sent right after the script
  // runs) don't get dropped.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // `srcDoc` iframes deliberately have an opaque origin, so origin is not
      // a usable discriminator here. The iframe window identity is.
      if (e.source !== htmlPreviewIframeRef.current?.contentWindow) return;
      const data = e.data as
        | { source?: string; type?: string; element?: SelectedElement | null }
        | undefined;
      if (!data || data.source !== EDIT_MODE_SOURCE) return;
      if (data.type === 'ready') {
        postEditModeMessage({ type: editModeRef.current ? 'enable' : 'disable' });
        if (editModeRef.current && pendingHighlightSelectorRef.current) {
          postEditModeMessage({
            type: 'highlight',
            selector: pendingHighlightSelectorRef.current,
          });
        }
      } else if (data.type === 'select') {
        if (!data.element) {
          setSelectedElement(null);
          setPopoverPosition(null);
          return;
        }
        setSelectedElement(data.element);
        const pos = computePopoverPosition(data.element.rect);
        if (pos) setPopoverPosition(pos);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [computePopoverPosition, postEditModeMessage]);

  // After the iframe has reloaded with fresh content (srcDoc changed),
  // ask the injector to re-paint the highlight on the previously selected
  // element. The injector script auto-runs on each iframe load, so we
  // just need to wait for `load` before posting the message.
  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || !pendingHighlightSelector || !editMode) return;
    const handler = () => {
      postEditModeMessage({
        type: 'highlight',
        selector: pendingHighlightSelector,
      });
    };
    iframe.addEventListener('load', handler);
    // If the iframe is already loaded (e.g. srcDoc didn't change), post
    // immediately on the next tick.
    const t = window.setTimeout(() => {
      postEditModeMessage({ type: 'highlight', selector: pendingHighlightSelector });
    }, 0);
    return () => {
      iframe.removeEventListener('load', handler);
      window.clearTimeout(t);
    };
  }, [previewCode, htmlPreviewUrl, editMode, pendingHighlightSelector, postEditModeMessage]);

  // Clear selection state when edit mode is turned off so the popover
  // doesn't linger after the user disables the feature. The popover is
  // already gated on `editMode && selectedElement && popoverPosition`
  // in JSX, so hiding it is enough for the user; we additionally drop
  // the state to keep the message-listener's next event clean.
  const handleEditModeChange = useCallback((checked: boolean) => {
    setEditMode(checked);
    if (!checked) {
      postEditModeMessage({ type: 'disable' });
      setSelectedElement(null);
      setPopoverPosition(null);
      setPendingHighlightSelector(null);
    } else {
      postEditModeMessage({ type: 'enable' });
    }
  }, [postEditModeMessage]);

  // 标记最近一次 SSE 流是否成功完成且有产出。仅在 handleStreamComplete 中
  // 满足条件时置 true；onError / 空内容 / 切到非 vue_project 都不会置 true。
  // Vue 文件轮询都靠它守卫，避免每次进入 vue 应用都打满 20s 轮询。
  const vueStreamSucceededRef = useRef(false);
  // handleStreamComplete 同步设过 previewCode 后置 true，让下面那个回填 effect
  // 跳过冗余解析。切流 / 切应用时重置。
  const previewHandledRef = useRef(false);

  // ── SSE (streaming) ──────────────────────────────────────────────
  const handleStreamComplete = useCallback((finalCode: string) => {
    const codeGenType = codeGenTypeRef.current;
    const refreshHtmlPreview = refreshHtmlPreviewRef.current;
    const myAppId = appIdRef.current;

    // Apply same cleaning as cleanedCode so stored message looks like the streaming display
    const cleaned = codeGenType === 'vue_project' ? cleanVueOutput(finalCode) : finalCode;

    if (!cleaned) {
      setStreamingMessage(null);
      previewHandledRef.current = true;
      return;
    }

    const live = streamingMessageRef.current;
    if (live) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === live.id)) return prev;
        return [
          ...prev,
          { ...live, content: cleaned, isStreaming: false },
        ];
      });
      setStreamingMessage(null);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: 'ai', content: cleaned, createTime: new Date().toISOString() },
      ]);
    }

    if (codeGenType && myAppId) {
      setPreviewCode('');
      refreshHtmlPreview(myAppId, codeGenType);
      previewHandledRef.current = true;
    }

    if (codeGenType === 'vue_project' && myAppId) {
      vueStreamSucceededRef.current = true;
    }
  }, []);

  const { isStreaming, isStreamingRef, preparing, currentCode, error: sseError, start, cancel, reset } = useSSE(
    handleStreamComplete,
    // Real-time file accumulator: each tool_executed SSE event adds/updates
    // a file in projectFiles so the code-tab file tree populates as the AI
    // writes files. Independent of the [工具调用] 写入文件 ... markdown
    // pattern in currentCode, so it works even if the AI emits files as
    // raw markdown code blocks instead of the structured markers.
    useCallback((info: { toolName: string; filePath: string; content?: string }) => {
      if (!info.filePath || !info.content) return;
      setProjectFiles((prev) => {
        const existing = prev.findIndex((f) => f.path === info.filePath);
        if (existing >= 0) {
          const next = prev.slice();
          next[existing] = { path: info.filePath, content: info.content! };
          return next;
        }
        return [...prev, { path: info.filePath, content: info.content! }];
      });
    }, []),
    // Handle business-error events from the backend (rate limiting, auth failures, etc.)
    // Commits the error as a non-streaming AI message before onDone clears the bubble.
    useCallback((code: number, errorMessage: string) => {
      setStreamingMessage((current) => {
        if (!current || !current.isStreaming) return current;
        setMessages((prev) => {
          if (prev.some((m) => m.id === current.id)) return prev;
          return [...prev, { ...current, content: `❌ ${errorMessage}`, isStreaming: false }];
        });
        return null;
      });
      message.error(errorMessage);
    }, [message]),
  );

  // Clean up Vue project AI output for display in chat panel
  // useMemo：cleanVueOutput 每次都做正则 + 字符串拼接，不 memo 会在每 tick 重跑；
  // currentCode 在流式期 5Hz 变化，没 memo 会让所有依赖 cleanedCode 的 memo 都失效。
  const cleanedCode = useMemo(
    () => (app?.codeGenType === 'vue_project' ? cleanVueOutput(currentCode) : currentCode),
    [currentCode, app?.codeGenType],
  );

  // Sync the SSE stream's accumulating text into the live streaming bubble.
  // Done in an effect (rather than at every render) so React only re-renders
  // the streaming ChatMessage — the rest of `messages` doesn't churn.
  // Functional setState short-circuits when content is unchanged so an
  // identical tick (rare, but possible if useSSE debounces to the same
  // accumulated value) doesn't trigger an extra render.
  useEffect(() => {
    if (!streamingMessage || !streamingMessage.isStreaming) return;
    setStreamingMessage((prev) => {
      // 新流首个 chunk 尚未到达（cleanedCode 仍是流开始时的旧代码值）时跳过，
      // 避免把上一轮的 currentCode（旧代码预览）预填进新气泡；chunk 一旦到达，
      // currentCode 从空开始累积为新内容，cleanedCode 不再等于旧值，才同步进气泡。
      if (!prev || cleanedCode === streamStartCodeRef.current) return prev;
      if (prev.content === cleanedCode) return prev;
      return { ...prev, content: cleanedCode };
    });
  }, [cleanedCode, streamingMessage]);

  // Safety net: if the stream ends (isStreaming → false) but neither
  // handleStreamComplete nor handleCancel committed the live bubble — e.g.
  // the SSE closed unexpectedly and useSSE hit its onError branch instead
  // of onDone — drop the bubble by committing whatever content we have.
  // Without this, a transport error would leave the user staring at a
  // typing-dots bubble forever.
  useEffect(() => {
    if (isStreaming) return;
    setStreamingMessage((current) => {
      if (!current || !current.isStreaming) return current;
      if (current.content) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === current.id)) return prev;
          return [
            ...prev,
            { ...current, isStreaming: false },
          ];
        });
      }
      return null;
    });
  }, [isStreaming]);

  useTitle(app?.appName || '对话');

  const isOwner = loginUser != null && app != null && loginUser.id === app.userId;
  const isAdmin = loginUser?.userRole === 'admin';
  // 可编辑：应用主人或管理员（对话 / 编辑 / 自动发送初始化）
  const canEdit = isOwner || isAdmin;

  // Source of truth for Vue project files: read straight from disk via the
  // dev-only Vite plugin (`/__dev__/vue-files/{appId}/list`). The backend
  // already wrote the full project tree to tmp/code_output/vue_project_xxx/
  // — this gives us reliable file paths + contents regardless of how the
  // AI formatted its markdown. The SSE-stream-text fallback below is kept
  // for the brief window before the first API response lands.
  const vueFilesAbortRef = useRef<AbortController | null>(null);
  const fetchVueProjectFiles = useCallback(async () => {
    if (!appId) return;
    const url = getVueFilesListUrl(appId);
    if (!url) return;
    vueFilesAbortRef.current?.abort();
    const controller = new AbortController();
    vueFilesAbortRef.current = controller;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const files: ProjectFile[] = await res.json();
      if (files.length > 0) {
        // 轮询接口会返回完整项目内容。文件没有变化时保留原数组引用，让
        // VueProjectViewer 的树、排序和代码高亮都能跳过一次重渲。
        setProjectFiles((current) =>
          haveSameProjectFiles(current, files) ? current : files,
        );
      }
    } catch {
      // AbortError or network error — silently skip; will retry next tick
    }
  }, [appId]);

  // Polled on stream complete + on mount + when appId changes. We DON'T
  // poll during streaming because the backend keeps writing files as tools
  // execute, and the disk snapshot is only "complete" once the SSE finishes
  // (when VueProjectBuilder.buildProjectAsync is triggered). After it ends,
  // we poll every 1.5s for up to 20s to catch the final flush.
  const vueFilesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vueFilesPollTriesRef = useRef(0);
  const startVueFilesPolling = useCallback(() => {
    if (vueFilesPollRef.current) return;
    vueFilesPollTriesRef.current = 0;
    const tick = () => {
      fetchVueProjectFiles();
      if (++vueFilesPollTriesRef.current >= 13) {
        // ~20s total, then give up
        if (vueFilesPollRef.current) {
          clearInterval(vueFilesPollRef.current);
          vueFilesPollRef.current = null;
        }
      }
    };
    tick(); // immediate first call
    vueFilesPollRef.current = setInterval(tick, 1500);
  }, [fetchVueProjectFiles]);

  const stopVueFilesPolling = useCallback(() => {
    if (vueFilesPollRef.current) {
      clearInterval(vueFilesPollRef.current);
      vueFilesPollRef.current = null;
    }
    vueFilesAbortRef.current?.abort();
  }, []);

  // Fetch once on app load + whenever we leave a streaming window
  useEffect(() => {
    if (app?.codeGenType !== 'vue_project' || !appId) return;
    fetchVueProjectFiles();
  }, [app?.codeGenType, appId, fetchVueProjectFiles]);

  // When the stream finishes, the backend's async builder kicks in and
  // may add a few more files. Run a longer-lived poll to catch them.
  //
  // 三道守卫，避免"进入 vue 应用就无条件跑满 20s 404 轮询"：
  // 1) 必须是 vue_project（切到 multi_file / html 时立即停 + 早返回）
  // 2) 必须刚结束一次成功的流（vueStreamSucceededRef 在 handleStreamComplete
  //    满足 cleaned 非空时才置 true，onError 路径不会触发）
  // 3) 不能在流式中（流式期间只 stop，不 start —— 否则会和流式期 1.5s 轮询重叠）
  useEffect(() => {
    if (app?.codeGenType !== 'vue_project') {
      stopVueFilesPolling();
      return;
    }
    if (isStreaming) {
      stopVueFilesPolling();
      return;
    }
    if (vueStreamSucceededRef.current) {
      vueStreamSucceededRef.current = false;
      startVueFilesPolling();
    }
  }, [isStreaming, app?.codeGenType, startVueFilesPolling, stopVueFilesPolling]);

  // Stream-text fallback: while we wait for the first API response, try
  // to scrape files out of currentCode. Harmless if it returns nothing.
  useEffect(() => {
    if (app?.codeGenType !== 'vue_project' || !currentCode) return;
    if (projectFiles.length > 0) return; // API already populated — don't churn
    const files = extractVueProjectFiles(currentCode);
    if (files.length > 0) {
      setProjectFiles(files);
    }
  }, [app?.codeGenType, currentCode, projectFiles.length]);

  // Memoize parsed multi-file code
  const parsedCode = useMemo(() => {
    if (app?.codeGenType !== 'multi_file') return null;

    const isParsedCode = (code: ParsedCode): boolean =>
      Boolean(code.htmlCode || code.cssCode || code.jsCode);
    if (currentCode) {
      const streamedCode = parseMultiFileCode(currentCode);
      if (isParsedCode(streamedCode)) return streamedCode;
    }
    // 已完成会话中的 currentCode 为空时，优先从聊天记录恢复；若历史只保存了
    // 说明文字，则使用刚才从已落盘文件读取的完整三文件内容。
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'ai') continue;
      const historyCode = parseMultiFileCode(messages[i].content);
      if (isParsedCode(historyCode)) return historyCode;
    }
    return savedMultiFileCode;
  }, [currentCode, messages, savedMultiFileCode, app?.codeGenType]);

  const htmlCodeForCodeTab = useMemo(() => {
    if (app?.codeGenType === 'vue_project') return '';
    return !isStreaming && htmlPreviewCode ? htmlPreviewCode : currentCode;
  }, [app?.codeGenType, currentCode, htmlPreviewCode, isStreaming]);

  // ── Load app & history ───────────────────────────────────────────
  useEffect(() => {
    if (!appId) return;
    // Switching apps: cancel any in-flight stream + poll, and clear stale
    // state so the fallback "build preview from history" effect (line ~270)
    // can re-derive previewCode for the new app.
    reset();
    stopVueFilesPolling();
    stopHtmlPreviewPolling();
    stopVueEditModeSync();
    setPreviewCode('');
    setHtmlPreviewUrl('');
    setHtmlPreviewCode('');
    setSavedMultiFileCode(null);
    setHtmlPreviewLoading(false);
    setHtmlPreviewFrameLoading(false);
    setDeployUrl('');
    setProjectFiles([]);
    autoSentRef.current = false;
    historyLoadFailedRef.current = false;
    oldestCreateTimeRef.current = '';
    oldestChatHistoryIdRef.current = '';
    historyInitedRef.current = false;
    setHistoryLoading(true);
    // 切换应用时清掉"流成功 + 预览已设"的 ref，让新应用能从头判定
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setMessages([]);
    setStreamingMessage(null);

    const myAppId = appId;
    appIdRef.current = appId;
    let appLoadFailed = false;

    getAppVO(myAppId)
      .then((appData) => {
        if (myAppId !== appIdRef.current) return; // user navigated away
        setApp(appData);

        // Existing apps already have a saved index.html once generated.
        // Point the iframe at it as soon as we know the app type; the chat
        // history request can finish independently, so the preview does not
        // need to wait behind it.
        if (appData.codeGenType) {
          const baseUrl = buildHtmlPreviewBaseUrl(myAppId, appData.codeGenType);
          if (baseUrl) {
            setHtmlPreviewFrameLoading(true);
            setHtmlPreviewUrl(`${baseUrl}?t=${Date.now()}`);
            setHtmlPreviewLoading(false);
            // 预览已由应用详情加载：标记已处理，避免对话记录加载完成后
            // 的 effect（依赖 messages）再次刷新预览，导致 iframe key 变化、页面闪一下。
            previewHandledRef.current = true;
          }
        }
      })
      .catch((err: unknown) => {
        if (myAppId !== appIdRef.current) return; // stale response after navigation
        appLoadFailed = true;
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
        if (myAppId !== appIdRef.current) return; // user navigated away
        if (appLoadFailed || !history) {
          setHistoryLoading(false);
          return;
        }
        historyInitedRef.current = true;
        const loaded: Message[] = history.map((h) => ({
          id: h.id,
          role: h.messageType === 'user' ? 'user' : 'ai',
          content: h.message,
          createTime: h.createTime,
        }));
        // 合并而非覆盖：用户在历史加载期间可能已经发送了新消息（id 以 local_
        // 开头，是当前会话内分配的本地 id，不在服务端历史里）。直接 setMessages(loaded)
        // 会把那些本地消息擦掉 —— 表现为"我明明发了消息，怎么没了"。
        //
        // 策略：保留所有现有 id 不是纯数字字符串（也就是 local_xxx 形态）的本地消息。
        // 顺手也清掉本地残留的流式气泡，因为历史已经回来了，下一次流开始时
        // handleSend 会重新分配。
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
        if (myAppId !== appIdRef.current) return; // stale response after navigation
        if (appLoadFailed) return;
        historyInitedRef.current = true;
        // Flag a history-load failure so the auto-send effect below doesn't
        // mistake "history unavailable" for "history empty" and start
        // streaming the user's initPrompt without their consent.
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
  }, [appId, navigate, reset, stopVueFilesPolling, stopHtmlPreviewPolling, stopVueEditModeSync, message]);

  // Auto-send initPrompt only for the one navigation that comes directly
  // from the create page. A normal refresh/direct link should never start
  // an AI generation just because history happens to be empty.
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
        // Cap the list so it doesn't grow unbounded over the user's
        // lifetime — only the most recent 50 appIds are remembered.
        const trimmed = list.slice(-50);
        localStorage.setItem(AUTO_SENT_KEY, JSON.stringify(trimmed));
      }
    } catch {
      // localStorage may be unavailable (private mode, etc.) — silently
      // skip; worst case the user gets an extra initPrompt on refresh.
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
	    ) return;
	    if (wasAutoSent(appId)) return;
	    autoSentRef.current = true;
	    markAutoSent(appId);
	    navigate(location.pathname, { replace: true, state: null });
	    // Best-effort cross-tab coordination: tell any other tab looking at
    // the same appId that we've claimed the auto-send. Their listener (see
    // effect below) writes the same localStorage mark, so even if both
    // tabs reach this point near-simultaneously the second one will skip
    // its own auto-send the next time the effect re-evaluates. Note:
    // BroadcastChannel delivery is fast but not synchronous, so there's
    // still a narrow race if both tabs commit their post() in the same
    // event loop tick — acceptable trade-off for not blocking init.
    autoSendChannel?.postMessage({ type: 'auto-sending', appId });
    setMessages([{ id: newMsgId(), role: 'user', content: app.initPrompt, createTime: new Date().toISOString() }]);
    // Same as handleSend: allocate the live streaming bubble up front so the
    // chat panel shows the typing bubble from the very first frame of the
    // auto-sent stream.
    // 记录旧代码值：新流首个 chunk 到达前，用它跳过"旧代码预填进新气泡"。
    streamStartCodeRef.current = cleanedCode;
    setStreamingMessage({
      id: newMsgId(),
      role: 'ai',
      content: '',
      createTime: new Date().toISOString(),
      isStreaming: true,
    });
    // 同 handleSend：新流开始，重置 Vue 成功 / 预览已设 ref。
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setHtmlPreviewCode('');
    start(appId, app.initPrompt);
	  }, [
	    messages,
	    app,
	    backgroundGeneration,
	    canEdit,
	    appId,
	    start,
	    wasAutoSent,
	    markAutoSent,
	    shouldAutoSendInit,
	    navigate,
	    location.pathname,
	    cleanedCode,
	  ]);

  // Cross-tab dedup: when another tab broadcasts that it's auto-sending
  // for the current appId, mirror the localStorage mark so this tab's
  // auto-send effect will bail on its next pass.
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

  // Show generated-result UI when: >= 2 completed messages, or currently streaming.
  const showPreview = messages.length >= 2 || isStreaming;

  // Load more history (cursor pagination)
  const handleLoadMore = useCallback(async () => {
    if (!appId || loadingMore || !hasMoreHistory || !oldestCreateTimeRef.current || !oldestChatHistoryIdRef.current) return;
    setLoadingMore(true);
    try {
      const older = await listChatHistoryBefore(appId, oldestCreateTimeRef.current, oldestChatHistoryIdRef.current, PAGE_SIZE);
      if (older.length > 0) {
        const olderMessages: Message[] = older.map((h) => ({
          id: h.id,
          role: h.messageType === 'user' ? 'user' : 'ai',
          content: h.message,
          createTime: h.createTime,
        }));
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
  }, [appId, loadingMore, hasMoreHistory, message]);

  // Update preview from the backend-saved files. This
  // handles history reload and is also a safety net if the SSE completion
  // callback missed its chance to refresh the file URL.
  useEffect(() => {
    if (isStreaming) {
      // 新一轮流开始：清除 ref，让流结束后的回填能正常工作。
      previewHandledRef.current = false;
      return;
    }
    if (previewHandledRef.current) return;
    if (!appId || !app?.codeGenType) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'ai' && msg.content) {
        const baseUrl = getHtmlPreviewBaseUrl(appId, app.codeGenType);
        if (baseUrl && !htmlPreviewUrl) {
          setHtmlPreviewFrameLoading(true);
          setHtmlPreviewUrl(`${baseUrl}?t=${Date.now()}`);
          return;
        }
        refreshHtmlPreviewFromFile(appId, app.codeGenType);
        previewHandledRef.current = true;
        return;
      }
    }
  }, [messages, appId, app?.codeGenType, getHtmlPreviewBaseUrl, htmlPreviewUrl, refreshHtmlPreviewFromFile, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
      stopVueFilesPolling();
      stopHtmlPreviewPolling();
      stopVueEditModeSync();
    };
  }, [cancel, stopVueFilesPolling, stopHtmlPreviewPolling, stopVueEditModeSync]);

  // Wrap cancel so it also commits whatever the AI had written so far as
  // a non-streaming message (otherwise clicking 停止 mid-stream would orphan
  // the bubble and leave the user staring at a typing-dots AI forever).
  const handleCancel = useCallback(() => {
    // The browser can stop receiving SSE immediately, but the backend cannot
    // safely cancel the in-flight model/tool calls. Poll its app lock before
    // allowing another write or a read of the project directory.
    setBackgroundGeneration(true);
    message.info('已停止接收输出，后台正在完成当前生成，请稍候');
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setStreamingMessage((current) => {
      if (current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === current.id)) return prev;
          // Empty content usually means cancel fired before any chunk
          // arrived — drop the bubble entirely in that case to avoid a
          // hanging empty AI message in the chat.
          if (!current.content) return prev;
          return [
            ...prev,
            { ...current, content: current.content, isStreaming: false },
          ];
        });
      }
      return null;
    });
    cancel();
  }, [cancel, message]);

  const isGenerationBusy = isStreaming || backgroundGeneration;

  // ── Send ─────────────────────────────────────────────────────────
  const handleSend = useCallback((text: string) => {
    if (!text || isStreamingRef.current || backgroundGeneration || !appId) return;
    if (!canEdit) {
      message.warning('只有应用创建者或管理员可以继续编辑这个应用');
      return;
    }
    setMessages((prev) => [...prev, { id: newMsgId(), role: 'user', content: text, createTime: new Date().toISOString() }]);
    // Allocate the live streaming bubble up front, with the same id the
    // final commit in handleStreamComplete will use. React keeps the
    // instance alive for the entire stream → commit lifecycle.
    // 记录旧代码值：新流首个 chunk 到达前，用它跳过"旧代码预填进新气泡"。
    streamStartCodeRef.current = cleanedCode;
    setStreamingMessage({
      id: newMsgId(),
      role: 'ai',
      content: '',
      createTime: new Date().toISOString(),
      isStreaming: true,
    });
    // 新一轮流开始：清掉 ref，等 handleStreamComplete 重新置。
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setHtmlPreviewCode('');
    start(appId, text);
  }, [appId, backgroundGeneration, canEdit, message, start, isStreamingRef, cleanedCode]);

  // 批量编辑：把一条编辑加入待保存队列（不立即发送），上限 15 条。
  const handleAddEdit = useCallback(
    (instruction: string) => {
      if (!instruction || !selectedElement) return;
      setPendingEdits((prev) => {
        if (prev.length >= 15) {
          message.warning('最多只能添加 15 条编辑，请先保存');
          return prev;
        }
        return [...prev, { id: newMsgId(), element: selectedElement, instruction: instruction.trim() }];
      });
      // 加入队列后清除选中与弹窗，方便继续点下一个元素
      postEditModeMessage({ type: 'unselect' });
      setSelectedElement(null);
      setPopoverPosition(null);
    },
    [selectedElement, postEditModeMessage, message],
  );

  // 删除队列中的某条编辑
  const handleRemoveEdit = useCallback((id: string) => {
    setPendingEdits((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // 批量发送：把队列中所有编辑合并为一个 prompt，一次性发给 AI 全部修改。
  const handleSendAllEdits = useCallback(() => {
    const queue = pendingEditsRef.current;
    if (!queue.length || savingEdits) return;
    if (!appId) return;
    if (isStreamingRef.current || backgroundGeneration) {
      message.warning('当前有生成任务进行中，请稍后发送');
      return;
    }
    if (!canEdit) {
      message.warning('只有应用创建者或管理员可以使用编辑模式');
      return;
    }
    const composed = buildBatchEditPrompt(queue.map((e) => ({ element: e.element, instruction: e.instruction })));
    if (!composed) return;

    setSavingEdits(true);
    setPendingEdits([]);
    setPendingHighlightSelector(queue[queue.length - 1].element.selector);
    setMessages((prev) => [
      ...prev,
      { id: newMsgId(), role: 'user', content: composed, createTime: new Date().toISOString() },
    ]);
    streamStartCodeRef.current = cleanedCode;
    setStreamingMessage({
      id: newMsgId(),
      role: 'ai',
      content: '',
      createTime: new Date().toISOString(),
      isStreaming: true,
    });
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setHtmlPreviewCode('');
    postEditModeMessage({ type: 'unselect' });
    start(appId, composed);
  }, [appId, canEdit, message, cleanedCode, start, postEditModeMessage, savingEdits, backgroundGeneration]);

  // 批量发送完成（流结束）后解除 saving 状态
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const prev = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (prev && !isStreaming) {
      setSavingEdits(false);
    }
  }, [isStreaming]);

  const handleEditCancel = useCallback(() => {
    postEditModeMessage({ type: 'unselect' });
    setSelectedElement(null);
    setPopoverPosition(null);
  }, [postEditModeMessage]);

  // Recompute the popover position on viewport resize so the card stays
  // anchored to the (now-shifted) selected element.
  useEffect(() => {
    if (!selectedElement) return;
    const handler = () => {
      const pos = computePopoverPosition(selectedElement.rect);
      if (pos) setPopoverPosition(pos);
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [selectedElement, computePopoverPosition]);

  const htmlPreviewSrcUrl = htmlPreviewUrl;
  // Vue 项目：编辑模式无法用 srcDoc（module script 在 opaque origin 被 CORS 拦），
  // 改用同源 URL 加载 + 后端 ?edit=1 注入编辑脚本；HTML/MULTI_FILE 仍走 srcDoc 注入。
  const isVuePreview = app?.codeGenType === 'vue_project';
  // 编辑模式仅主人/管理员可用：只读访客不显示编辑工具栏
  const supportsEditMode = Boolean(app?.codeGenType) && canEdit;
  const hasEditablePreview = Boolean(htmlPreviewSrcUrl);
  const showPreviewToolbar = (showPreview || Boolean(htmlPreviewSrcUrl)) && hasEditablePreview;
  const editModeTooltip = supportsEditMode
    ? '开启后可点击预览页面中的任意元素进行修改'
    : '预览加载完成后可开启可视化编辑';

  const htmlPreviewBaseUrl = useMemo(
    () => getHtmlPreviewBaseUrl(appId, app?.codeGenType),
    [appId, app?.codeGenType, getHtmlPreviewBaseUrl],
  );
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

  useEffect(() => {
    // Vue 编辑模式走同源 URL 加载 + onLoad 注入脚本，不走 srcDoc fetch 链路。
    if (isVuePreview) {
      setPreviewCode('');
      return;
    }
    if (!editMode || !supportsEditMode || !htmlPreviewSrcUrl || !htmlPreviewBaseUrl) {
      setPreviewCode('');
      return;
    }

    const controller = new AbortController();
    fetch(htmlPreviewSrcUrl, {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('preview file not available');
        const html = await response.text();
        setPreviewCode(addBaseHrefForSrcDoc(html, htmlPreviewBaseUrl));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'AbortError') {
          setPreviewCode('');
        }
      });

    return () => controller.abort();
  }, [addBaseHrefForSrcDoc, editMode, htmlPreviewBaseUrl, htmlPreviewSrcUrl, supportsEditMode, isVuePreview]);

  // The actual srcDoc passed to the iframe — base preview + edit-mode
  // script injection when applicable.
  const htmlPreviewSrcDoc = useMemo(() => {
    if (!previewCode) return '';
    return applyEditModeToSrcDoc(previewCode, editMode && supportsEditMode);
  }, [previewCode, editMode, supportsEditMode]);

  // Hard reload the iframe whenever the preview content changes. Relying
  // solely on React's `key` prop remounts the iframe element, but on some
  // browsers the new srcDoc document can still end up partially styled
  // (cached layout, deferred style application, etc.). Setting `srcdoc`
  // imperatively after the iframe is in the DOM guarantees the document
  // is parsed and rendered fresh — same effect as the user pressing F5
  // just for the iframe.
  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || !htmlPreviewSrcDoc) return;
    if (iframe.srcdoc !== htmlPreviewSrcDoc) {
      iframe.srcdoc = htmlPreviewSrcDoc;
    }
  }, [htmlPreviewSrcDoc]);

  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || editMode || !htmlPreviewSrcUrl) return;
    if (iframe.getAttribute('srcdoc') != null) {
      iframe.removeAttribute('srcdoc');
    }
    if (iframe.getAttribute('src') !== htmlPreviewSrcUrl) {
      iframe.setAttribute('src', htmlPreviewSrcUrl);
    }
  }, [editMode, htmlPreviewSrcUrl]);

  // ── Delete / Rename ──────────────────────────────────────────────
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
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
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

  // ── Download code ─────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!appId) return;
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
  }, [appId, isOwner, isGenerationBusy, message]);

  // ── Deploy (production deployment, explicit user action) ──────────
  const handleDeploy = useCallback(async () => {
    if (!appId) return;
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
  }, [appId, isOwner, isGenerationBusy, message]);

  // ── Render ───────────────────────────────────────────────────────
  // No skeleton / spinner for the initial load — it flashes and looks
  // worse than just letting the layout settle. The page below renders
  // its own affordances once the app data is in.

  // 只读访问：精选应用对所有人公开可看（含未登录）。未登录或非主人非管理员时
  // 隐藏编辑入口，保留预览与聊天记录；登录后才可编辑（主人或管理员）。
  const isReadOnly = app != null && !canEdit;

  return (
    <div className="chat-workbench">
      <ChatHeader
        appName={app?.appName || '未命名应用'}
        isOwner={canEdit}
        showPreview={showPreview}
        isStreaming={isGenerationBusy}
        deploying={deploying}
        onDeploy={handleDeploy}
        onDownload={handleDownload}
        onRename={handleRename}
        onDelete={handleDelete}
      />

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

      {/* Main content: split pane */}
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
        {/* Left: Chat panel */}
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

        {/* Right: Preview panel */}
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
                  <div
                    className="chat-tab-fill"
                  >
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                      {htmlPreviewSrcUrl ? (
                        <>
                          {editMode ? (
                            isVuePreview ? (
                              <iframe
                                ref={htmlPreviewIframeRef}
                                src={htmlPreviewSrcUrl}
                                key={`vue-edit:${htmlPreviewSrcUrl}`}
                                // allow-same-origin 必须加：Vue Router 需要真实 origin 操作 history，
                                // 且父页面需同源注入编辑脚本。
                                sandbox="allow-scripts allow-same-origin"
                                onLoad={(e) => {
                                  setHtmlPreviewFrameLoading(false);
                                  injectEditScriptIntoVueFrame(e.currentTarget);
                                }}
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
                                sandbox="allow-scripts"
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
                                src={htmlPreviewSrcUrl}
                                key={`url:${htmlPreviewSrcUrl}`}
                                sandbox="allow-scripts"
                                onLoad={() => setHtmlPreviewFrameLoading(false)}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  borderRadius: 8,
                                  opacity: htmlPreviewFrameLoading ? 0 : 1,
                                  transition: 'opacity 120ms ease',
                                }}
                                title={app?.codeGenType === 'vue_project' ? 'Vue 应用预览' : '应用预览'}
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
                          {/* Edit-mode prompt popover, anchored in page coords
                              to the element the user just selected. The `key`
                              forces a remount on every new selection so the
                              textarea auto-focuses and draft state resets. */}
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
                      ) : app?.codeGenType === 'vue_project' ? (
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
                    {app?.codeGenType === 'vue_project' ? (
                      <VueProjectViewer files={projectFiles} deploying={deploying} isStreaming={isGenerationBusy} onDeploy={handleDeploy} />
                    ) : app?.codeGenType === 'multi_file' ? (
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
                    ) : (
                      <CodePreview
                        code={htmlCodeForCodeTab}
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
