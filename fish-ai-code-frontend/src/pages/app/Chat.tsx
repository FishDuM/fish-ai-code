import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, App, Tabs, Spin, Modal, Input, Switch, Tooltip } from 'antd';
import {
  CodeOutlined,
  EyeOutlined,
  CloudUploadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import ChatHeader from '@/components/ChatHeader';
import ChatMessageList from '@/components/ChatMessageList';
import ChatInput from '@/components/ChatInput';
import CodePreview from '@/components/CodePreview';
import VueProjectViewer from '@/components/VueProjectViewer';
import EditPromptPopover from '@/components/EditPromptPopover';
import { useSSE } from '@/hooks/useSSE';
import { useTitle } from '@/hooks/useTitle';
import { preloadHighlighter } from '@/hooks/useHighlighter';
import { useAuthStore } from '@/stores/useAuthStore';
import { applyEditModeToSrcDoc } from '@/utils/editModeInjector';
import { buildEditPrompt } from '@/utils/editPromptBuilder';
import {
  EDIT_MODE_SOURCE,
  type SelectedElement,
  type EditModeControlMessage,
} from '@/types/editMode';

// Warm the highlighter as soon as this module is parsed. The first
// historical AI message that mounts doesn't have to flash through the
// plain `<pre>` fallback while waiting for the dynamic import to
// resolve — the fetch has already started by then.
preloadHighlighter();
import { getAppVO, deleteMyApp, updateMyApp, deployApp } from '@/api/app';
import { getLatestChatHistory, listChatHistoryBefore } from '@/api/chatHistory';
import { parseHtmlCode, parseMultiFileCode, mergeToHtmlDoc, extractVueProjectFiles, cleanVueOutput } from '@/utils/codeParser';
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

let nextMsgId = 0;
function newMsgId(): string {
  return `local_${nextMsgId++}_${Date.now()}`;
}

export default function AppChat() {
  const { id: appId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { loginUser } = useAuthStore();

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
  const [previewCode, setPreviewCode] = useState('');
  const [previewTab, setPreviewTab] = useState('preview');
  const [deployUrl, setDeployUrl] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [renameValue, setRenameValue] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Edit mode (visual element selector) ───────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  // Last selector the user picked, so we can re-highlight it after the
  // AI finishes rewriting the page.
  const [pendingHighlightSelector, setPendingHighlightSelector] = useState<string | null>(null);
  // Position of the prompt popover in parent (page) coordinates.
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const htmlPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const historyInitedRef = useRef(false);
  const autoSentRef = useRef(false);
  const oldestCreateTimeRef = useRef<string>('');
  // Mirror of `appId` for async callbacks to detect stale responses after navigation.
  const appIdRef = useRef<string>('');

  // Build preview HTML from raw AI code
  //
  // 返回 '' 时调用方应保留旧 previewCode：发生在"AI 增量编辑只补 ```css / ```js
  // 补丁、没重发 ```html"场景 —— parseMultiFileCode 此时返回 htmlCode=''，
  // 如果我们仍调 mergeToHtmlDoc 会得到 `<body></body>` 把 iframe 清空。
  // 让上游明确跳过 setPreviewCode 比把空 body 灌进去友好。
  const buildPreviewHtml = useCallback((rawCode: string, codeGenType: string | null) => {
    if (!rawCode) return '';
    if (codeGenType === 'vue_project') {
      return '';
    }
    if (codeGenType === 'multi_file') {
      const parsed = parseMultiFileCode(rawCode);
      if (!parsed.htmlCode) return '';
      return mergeToHtmlDoc(parsed);
    }
    return parseHtmlCode(rawCode);
  }, []);

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
      const data = e.data as
        | { source?: string; type?: string; element?: SelectedElement | null }
        | undefined;
      if (!data || data.source !== EDIT_MODE_SOURCE) return;
      if (data.type === 'select') {
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
  }, [computePopoverPosition]);

  // After the iframe has reloaded with fresh content (srcDoc changed),
  // ask the injector to re-paint the highlight on the previously selected
  // element. The injector script auto-runs on each iframe load, so we
  // just need to wait for `load` before posting the message.
  useEffect(() => {
    const iframe = htmlPreviewIframeRef.current;
    if (!iframe || !pendingHighlightSelector || !editMode) return;
    const handler = () => {
      const msg: EditModeControlMessage = {
        type: 'highlight',
        selector: pendingHighlightSelector,
      };
      try {
        iframe.contentWindow?.postMessage(
          { source: EDIT_MODE_SOURCE, ...msg },
          '*',
        );
      } catch {
        // cross-origin or detached — ignore
      }
    };
    iframe.addEventListener('load', handler);
    // If the iframe is already loaded (e.g. srcDoc didn't change), post
    // immediately on the next tick.
    const t = window.setTimeout(() => {
      try {
        iframe.contentWindow?.postMessage(
          { source: EDIT_MODE_SOURCE, type: 'highlight', selector: pendingHighlightSelector },
          '*',
        );
      } catch {
        /* ignore */
      }
    }, 0);
    return () => {
      iframe.removeEventListener('load', handler);
      window.clearTimeout(t);
    };
  }, [previewCode, editMode, pendingHighlightSelector]);

  // Clear selection state when edit mode is turned off so the popover
  // doesn't linger after the user disables the feature. The popover is
  // already gated on `editMode && selectedElement && popoverPosition`
  // in JSX, so hiding it is enough for the user; we additionally drop
  // the state to keep the message-listener's next event clean.
  const handleEditModeChange = useCallback((checked: boolean) => {
    setEditMode(checked);
    if (!checked) {
      setSelectedElement(null);
      setPopoverPosition(null);
      setPendingHighlightSelector(null);
    }
  }, []);

  // Vue deploy poll handle — used to cancel any in-flight poll when we start
  // a new stream, switch apps, or unmount. Prevents the old poll from
  // setting deployUrl AFTER the new stream has cleared it (causes flicker).
  const vuePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vuePollCancelledRef = useRef(false);
  // 标记最近一次 SSE 流是否成功完成且有产出。仅在 handleStreamComplete 中
  // 满足条件时置 true；onError / 空内容 / 切到非 vue_project 都不会置 true。
  // Vue 文件轮询 / 部署轮询都靠它守卫，避免每次进入 vue 应用都打满 20s 404 轮询。
  const vueStreamSucceededRef = useRef(false);
  // handleStreamComplete 同步设过 previewCode 后置 true，让下面那个回填 effect
  // 跳过冗余解析。切流 / 切应用时重置。
  const previewHandledRef = useRef(false);

  const stopVuePolling = useCallback(() => {
    vuePollCancelledRef.current = true;
    if (vuePollTimerRef.current) {
      clearTimeout(vuePollTimerRef.current);
      vuePollTimerRef.current = null;
    }
  }, []);

  // ── SSE (streaming) ──────────────────────────────────────────────
  const handleStreamComplete = useCallback((finalCode: string) => {
    // Apply same cleaning as cleanedCode so stored message looks like the streaming display
    const cleaned = app?.codeGenType === 'vue_project' ? cleanVueOutput(finalCode) : finalCode;

    // 流式期空内容（取消 / SSE 一上来就 done）时不要 append 空气泡 —— 和
    // handleCancel 那边的 empty-skip 保持一致。仍然要清掉 streamingMessage，
    // 否则 typing-dots 会永远留在聊天窗里。
    if (!cleaned) {
      setStreamingMessage(null);
      previewHandledRef.current = true; // 防止下方回填 effect 误把聊天内容当预览
      return;
    }

    // Merge the streaming bubble into the committed history. The bubble
    // keeps the SAME `id` it was created with, so React reconciles the
    // existing ChatMessage instance — no remount, no markdown swap, no
    // flicker. This is the path that was breaking before.
    //
    // We snapshot the live bubble before resetting state so we don't have
    // to nest setMessages inside a setStreamingMessage functional updater
    // (cleaner batching, easier to debug, and avoids React's "Cannot update
    // a component while rendering a different component" trap).
    const live = streamingMessage;
    if (live) {
      setMessages((prev) => {
        // Avoid double-appending if the merge already happened (race
        // between handleStreamComplete firing twice or re-mount).
        if (prev.some((m) => m.id === live.id)) return prev;
        return [
          ...prev,
          { ...live, content: cleaned, isStreaming: false },
        ];
      });
      setStreamingMessage(null);
    } else {
      // No live streaming bubble (extremely rare — SSE onDone fired with
      // no bubble, e.g. after a navigation). Append a fresh entry.
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: 'ai', content: cleaned, createTime: new Date().toISOString() },
      ]);
    }

    // Immediately compute and set preview HTML (no deferred useEffect).
    // Triggered synchronously from the SSE onDone, BEFORE the React commit
    // that flips isStreaming=false — that's what the user was missing
    // when the iframe only updated after a manual reload.
    //
    // 同时把 previewHandledRef 置 true，下方合并后的"历史回填 effect"会跳过
    // —— 避免流结束后又一次正则解析同一段内容。
    if (app?.codeGenType !== 'vue_project') {
      const html = buildPreviewHtml(cleaned, app?.codeGenType ?? null);
      if (html) {
        setPreviewCode(html);
        previewHandledRef.current = true;
      } else {
        // buildPreviewHtml 返回空（增量编辑只补 CSS/JS、没重发 html 块）：
        // 保留旧 previewCode，不把聊天窗的 markdown 灌进 iframe。
        previewHandledRef.current = true;
      }
    }

    // Vue project: start polling for build completion immediately after SSE ends.
    // 守卫：必须 vue_project + 真的有产出（cleaned 非空）+ 流正常完成。
    // 没产出 / onError 路径不会到这里（useSSE 在 onError 不调 onComplete）。
    if (app?.codeGenType === 'vue_project' && appId) {
      vueStreamSucceededRef.current = true;
      const previewUrl = `/vue-preview/${appId}/`;
      let retries = 0;
      const maxRetries = 90;
      vuePollCancelledRef.current = false;
      const poll = () => {
        if (vuePollCancelledRef.current) return;
        const t = Date.now();
        fetch(`${previewUrl}?poll=${t}`, { cache: 'no-store' })
          .then(async (r) => {
            if (vuePollCancelledRef.current) return;
            if (!r.ok) throw new Error();
            const text = await r.text();
            if (!text || text.includes('Building...') || text.length < 50) throw new Error();
            setDeployUrl(`${previewUrl}?t=${t}`);
          })
          .catch(() => {
            if (vuePollCancelledRef.current) return;
            if (++retries < maxRetries) {
              vuePollTimerRef.current = setTimeout(poll, 3000);
            }
          });
      };
      vuePollTimerRef.current = setTimeout(poll, 2000);
    }
  }, [app?.codeGenType, appId, buildPreviewHtml, streamingMessage]);

  const { isStreaming, isStreamingRef, currentCode, error: sseError, start, cancel, reset } = useSSE(
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
      if (!prev || prev.content === cleanedCode) return prev;
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

  // Vue iframe fallback: if it loaded "Building..." text, re-check the build
  const vueIframeRef = useRef<HTMLIFrameElement>(null);
  const vuePreviewRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVuePreviewLoad = useCallback(() => {
    try {
      const doc = vueIframeRef.current?.contentDocument;
      if (doc && doc.body && doc.body.textContent?.includes('Building...')) {
        // Build not ready yet, re-check with a short delay
        const appIdLocal = appId;
        if (appIdLocal) {
          if (vuePreviewRetryRef.current) clearTimeout(vuePreviewRetryRef.current);
          vuePreviewRetryRef.current = setTimeout(() => {
            vuePreviewRetryRef.current = null;
            // Bail if the user has navigated to a different app meanwhile.
            if (appIdLocal !== appIdRef.current) return;
            const t = Date.now();
            fetch(`/vue-preview/${appIdLocal}/?retry=${t}`, { cache: 'no-store' })
              .then((r) => r.text())
              .then((text) => {
                if (appIdLocal !== appIdRef.current) return;
                if (text && !text.includes('Building...') && text.length > 50) {
                  setDeployUrl(`/vue-preview/${appIdLocal}/?t=${t}`);
                }
              })
              .catch(() => {});
          }, 3000);
        }
      }
    } catch {
      // CORS or cross-origin — ignore
    }
  }, [appId]);

  // Source of truth for Vue project files: read straight from disk via the
  // dev-only Vite plugin (`/__dev__/vue-files/{appId}/list`). The backend
  // already wrote the full project tree to tmp/code_output/vue_project_xxx/
  // — this gives us reliable file paths + contents regardless of how the
  // AI formatted its markdown. The SSE-stream-text fallback below is kept
  // for the brief window before the first API response lands.
  const vueFilesAbortRef = useRef<AbortController | null>(null);
  const fetchVueProjectFiles = useCallback(async () => {
    if (!appId) return;
    vueFilesAbortRef.current?.abort();
    const controller = new AbortController();
    vueFilesAbortRef.current = controller;
    try {
      const res = await fetch(`/__dev__/vue-files/${appId}/list`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const files: ProjectFile[] = await res.json();
      if (files.length > 0) {
        setProjectFiles(files);
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

  // Keep the file tree fresh while streaming (the AI is writing files in
  // real time via tool calls, and each write hits the disk immediately).
  useEffect(() => {
    if (isStreaming && app?.codeGenType === 'vue_project') {
      const id = setInterval(fetchVueProjectFiles, 1500);
      return () => clearInterval(id);
    }
  }, [isStreaming, app?.codeGenType, fetchVueProjectFiles]);

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

  // Vue project: check if build exists, then serve via Vite middleware
  useEffect(() => {
    if (app?.codeGenType !== 'vue_project' || !appId) return;
    const controller = new AbortController();
    const myAppId = appId;
    const t = Date.now();
    fetch(`/vue-preview/${myAppId}/?check=${t}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((r) => r.text())
      .then((text) => {
        // Bail if the user has navigated to a different app meanwhile.
        if (myAppId !== appIdRef.current) return;
        if (text && !text.includes('Building...') && text.length > 50) {
          setDeployUrl(`/vue-preview/${myAppId}/?t=${t}`);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [app?.codeGenType, appId]);

  // Memoize parsed multi-file code
  const parsedCode = useMemo(() => {
    if (!currentCode || app?.codeGenType !== 'multi_file') return null;
    return parseMultiFileCode(currentCode);
  }, [currentCode, app?.codeGenType]);

  // ── Load app & history ───────────────────────────────────────────
  useEffect(() => {
    if (!appId) return;
    // Switching apps: cancel any in-flight stream + poll, and clear stale
    // state so the fallback "build preview from history" effect (line ~270)
    // can re-derive previewCode for the new app.
    reset();
    stopVuePolling();
    stopVueFilesPolling();
    setPreviewCode('');
    setDeployUrl('');
    setProjectFiles([]);
    autoSentRef.current = false;
    historyInitedRef.current = false;
    // 切换应用时清掉"流成功 + 预览已设"的 ref，让新应用能从头判定
    vueStreamSucceededRef.current = false;
    previewHandledRef.current = false;
    setMessages([]);
    setStreamingMessage(null);

    const myAppId = appId;
    appIdRef.current = appId;
    getAppVO(myAppId)
      .then((appData) => {
        if (myAppId !== appIdRef.current) return; // user navigated away
        setApp(appData);
        return getLatestChatHistory(myAppId, PAGE_SIZE);
      })
      .then((history) => {
        if (myAppId !== appIdRef.current) return; // user navigated away
        if (!history) return;
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
        }
      })
      .catch((err: unknown) => {
        // The getAppVO call is the first .then — if it throws, we get here
        // with no app context, so we should report "应用不存在" and bail.
        // If only getLatestChatHistory fails, we keep the app loaded and
        // just show a toast.
        if (myAppId !== appIdRef.current) return; // stale response after navigation
        historyInitedRef.current = true;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          message.error('应用不存在');
          navigate('/dashboard');
        } else {
          message.error('加载历史消息失败');
        }
      });
  }, [appId, navigate, reset, stopVuePolling, stopVueFilesPolling, message]);

  // Auto-send initPrompt: own app AND no chat history.
  //
  // We track which appIds have already been auto-sent via localStorage so
  // that a hard refresh of the page (which resets `autoSentRef.current`
  // and re-runs this effect with `messages.length === 0` because the
  // backend history hasn't loaded yet) doesn't fire the initPrompt twice.
  // The flag is per-appId so the user can still legitimately get the
  // prompt fired for *new* apps they create.
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
      autoSentRef.current ||
      !appId ||
      !app ||
      !isOwner ||
      messages.length > 0 ||
      !app.initPrompt
    ) return;
    if (wasAutoSent(appId)) return;
    autoSentRef.current = true;
    markAutoSent(appId);
    setMessages([{ id: newMsgId(), role: 'user', content: app.initPrompt, createTime: new Date().toISOString() }]);
    // Same as handleSend: allocate the live streaming bubble up front so the
    // chat panel shows the typing bubble from the very first frame of the
    // auto-sent stream.
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
    start(appId, app.initPrompt);
  }, [messages, app, isOwner, appId, start, wasAutoSent, markAutoSent]);

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
  }, [appId, loadingMore, hasMoreHistory, message]);

  // Update preview for non-Vue projects — fallback for history reload AND
  // safety net when handleStreamComplete skipped its setPreviewCode (e.g.
  // stale `app` closure, codeGenType mismatch, buildPreviewHtml returned '').
  // 合并旧版两个重叠 effect：handleStreamComplete 同步设过 previewCode 时置
  // previewHandledRef.current = true，这里跳过冗余的"再解析最后一条 AI 消息"。
  //
  // 注意：buildPreviewHtml 可能在"增量编辑只补 CSS/JS、没重发 html"时返回 ''，
  // 此时不 setPreviewCode —— 保留旧预览，比把聊天窗 markdown 灌进 iframe 好。
  useEffect(() => {
    if (isStreaming) {
      // 新一轮流开始：清除 ref，让流结束后的回填能正常工作。
      previewHandledRef.current = false;
      return;
    }
    if (previewHandledRef.current) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'ai' && msg.content) {
        const html = buildPreviewHtml(msg.content, app?.codeGenType ?? null);
        if (html) setPreviewCode(html);
        return;
      }
    }
  }, [messages, app?.codeGenType, buildPreviewHtml, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
      stopVuePolling();
      stopVueFilesPolling();
      if (vuePreviewRetryRef.current) {
        clearTimeout(vuePreviewRetryRef.current);
        vuePreviewRetryRef.current = null;
      }
    };
  }, [cancel, stopVuePolling, stopVueFilesPolling]);

  // Wrap cancel so it also commits whatever the AI had written so far as
  // a non-streaming message (otherwise clicking 停止 mid-stream would orphan
  // the bubble and leave the user staring at a typing-dots AI forever).
  const handleCancel = useCallback(() => {
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
  }, [cancel]);

  // Vue project: clear deployUrl + stop any in-flight build-poll when a new
  // stream starts. Without this, a poll from the previous round can set
  // deployUrl AFTER we cleared it, causing the iframe to flicker.
  useEffect(() => {
    if (isStreaming && app?.codeGenType === 'vue_project') {
      stopVuePolling();
      setDeployUrl('');
    }
  }, [isStreaming, app?.codeGenType, stopVuePolling]);

  // ── Send ─────────────────────────────────────────────────────────
  const handleSend = useCallback((text: string) => {
    if (!text || isStreamingRef.current || !appId) return;
    setMessages((prev) => [...prev, { id: newMsgId(), role: 'user', content: text, createTime: new Date().toISOString() }]);
    // Allocate the live streaming bubble up front, with the same id the
    // final commit in handleStreamComplete will use. React keeps the
    // instance alive for the entire stream → commit lifecycle.
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
    start(appId, text);
  }, [appId, start, isStreamingRef]);

  // ── Edit-mode send (element + prompt) ─────────────────────────────
  const handleEditSend = useCallback(
    (instruction: string) => {
      if (!instruction || isStreamingRef.current || !appId || !selectedElement) return;
      const composed = buildEditPrompt(instruction, selectedElement);
      // Remember the selector so we can re-highlight the same element
      // once the AI finishes rewriting the page.
      setPendingHighlightSelector(selectedElement.selector);
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: 'user', content: composed, createTime: new Date().toISOString() },
      ]);
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
      setSelectedElement(null);
      setPopoverPosition(null);
      start(appId, composed);
    },
    [appId, selectedElement, start, isStreamingRef],
  );

  const handleEditCancel = useCallback(() => {
    setSelectedElement(null);
    setPopoverPosition(null);
  }, []);

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

  const supportsEditMode = app?.codeGenType !== 'vue_project';
  const editModeTooltip = supportsEditMode
    ? '开启后可点击预览页面中的任意元素进行修改'
    : 'Vue 项目暂不支持可视化编辑（后续版本）';

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

  // ── Deploy (production deployment, explicit user action) ──────────
  const handleDeploy = useCallback(async () => {
    if (!appId) return;
    setDeployError('');
    setDeploying(true);
    try {
      const url = await deployApp({ appId });
      // Backend returns "http://localhost/{deployKey}" without port/path.
      const deployKey = url.split('/').pop() || '';
      const proxiedUrl = `/api/static/${deployKey}/`;
      setDeployUrl(proxiedUrl);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : '部署失败');
    } finally {
      setDeploying(false);
    }
  }, [appId]);

  // ── Render ───────────────────────────────────────────────────────
  // No skeleton / spinner for the initial load — it flashes and looks
  // worse than just letting the layout settle. The page below renders
  // its own affordances once the app data is in.

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
            streamingMessage={streamingMessage}
            currentCode={cleanedCode}
            hasMoreHistory={hasMoreHistory}
            loadingMore={loadingMore}
            sseError={sseError}
            onLoadMore={handleLoadMore}
          />

          <ChatInput
            isStreaming={isStreaming}
            onSend={handleSend}
            onCancel={handleCancel}
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
                  <div
                    style={{ flex: 1, height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}
                  >
                    {/* Edit mode toolbar */}
                    {showPreview && previewCode && supportsEditMode && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          marginBottom: 8,
                          background: editMode ? 'rgba(54, 210, 190, 0.08)' : 'rgba(17,25,37,0.02)',
                          border: editMode ? '1px solid rgba(54, 210, 190, 0.35)' : '1px solid rgba(17,25,37,0.06)',
                          borderRadius: 8,
                          flexShrink: 0,
                        }}
                      >
                        <EditOutlined style={{ color: editMode ? '#36D2BE' : 'rgba(17,25,37,0.45)' }} />
                        <span style={{ fontSize: 13, color: editMode ? '#111925' : 'rgba(17,25,37,0.65)' }}>
                          编辑模式
                        </span>
                        <Tooltip title={editModeTooltip}>
                          <Switch
                            size="small"
                            checked={editMode}
                            onChange={handleEditModeChange}
                            disabled={isStreaming}
                          />
                        </Tooltip>
                        <span style={{ fontSize: 12, color: 'rgba(17,25,37,0.45)', marginLeft: 'auto' }}>
                          {editMode ? '悬停高亮，点击元素即可选中' : '开启后点击预览元素即可选中并修改'}
                        </span>
                      </div>
                    )}

                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                      {app?.codeGenType === 'vue_project' ? (
                        deployUrl ? (
                          <iframe
                            ref={vueIframeRef}
                            src={deployUrl}
                            onLoad={handleVuePreviewLoad}
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              borderRadius: 8,
                            }}
                            title="Vue 应用预览"
                          />
                        ) : deploying ? (
                          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <Spin size="large" />
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#111925' }}>正在构建 Vue 项目...</div>
                          </div>
                        ) : deployError ? (
                          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <div style={{ fontSize: 48 }}>❌</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#f5222d' }}>构建失败</div>
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
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,25,37,0.02)', borderRadius: 8, color: 'rgba(17,25,37,0.45)' }}>
                            <div style={{ textAlign: 'center' }}>
                              {isStreaming ? (
                                <>
                                  <CodeOutlined style={{ fontSize: 48, marginBottom: 16, color: 'rgba(17,25,37,0.15)' }} />
                                  <div>AI 正在生成 Vue 工程文件...</div>
                                </>
                              ) : (
                                <>
                                  <Spin size="large" style={{ marginBottom: 16 }} />
                                  <div>正在构建并部署 Vue 项目，请稍候...</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      ) : showPreview && htmlPreviewSrcDoc ? (
                        <>
                          <iframe
                            ref={htmlPreviewIframeRef}
                            srcDoc={htmlPreviewSrcDoc}
                            // Force a fresh iframe whenever the preview content
                            // (or the edit-mode script injection) changes.
                            // Without this, some browsers keep the previous
                            // document when only the `srcDoc` attribute is
                            // updated — the freshly generated page then renders
                            // without its CSS, or scripts never run, until a
                            // hard reload. Tying the key to the full srcDoc
                            // string guarantees React tears down and re-creates
                            // the iframe, which always loads the new document.
                            key={htmlPreviewSrcDoc}
                            sandbox="allow-scripts"
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              borderRadius: 8,
                              // Block direct interaction when edit mode is on so
                              // the user can't accidentally click links / drag
                              // scroll while picking elements. The iframe's own
                              // click handler is the only one that should fire.
                              pointerEvents: editMode ? 'auto' : 'auto',
                            }}
                            title="应用预览"
                          />
                          {/* Edit-mode prompt popover, anchored in page coords
                              to the element the user just selected. The `key`
                              forces a remount on every new selection so the
                              textarea auto-focuses and draft state resets. */}
                          {editMode && selectedElement && popoverPosition && (
                            <EditPromptPopover
                              key={selectedElement.selector}
                              element={selectedElement}
                              position={popoverPosition}
                              sending={isStreaming}
                              onSend={handleEditSend}
                              onCancel={handleEditCancel}
                            />
                          )}
                        </>
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
                    {app?.codeGenType === 'vue_project' ? (
                      <VueProjectViewer files={projectFiles} deploying={deploying} onDeploy={handleDeploy} />
                    ) : currentCode && app?.codeGenType === 'multi_file' ? (
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
                            label: 'CSS',
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
                            label: 'JS',
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
                        code={currentCode || '// 等待 AI 生成代码...'}
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
