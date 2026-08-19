import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CODE_GEN_TYPES } from '@/constants';
import { getPreviewSession, getPreviewSource } from '@/api/app';
import { getVueFilesListUrl } from '@/utils/vueProjectUrls';
import type { ParsedCode } from '@/utils/codeParser';
interface ProjectFile {
  path: string;
  content: string;
}

interface UsePreviewSessionOptions {
  appId: string | undefined;
  codeGenType: string | null | undefined;
  canEdit: boolean;
  /** 文件列表重试全部失败后的回调 */
  onProjectFilesLoadFailed?: () => void;
}

function haveSameProjectFiles(current: ProjectFile[], next: ProjectFile[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((file, index) => file.path === next[index]?.path && file.content === next[index]?.content);
}

const RETRYABLE_HTTP_STATUS = [408, 429, 500, 502, 503, 504];
const RETRY_DELAYS = [1000, 3000, 5000];

/**
 * 预览会话与 Vue 项目文件：预览 URL/源码、会话续期、文件树轮询。
 * 后台生成轮询（isBusy）由调用方实现，本 hook 只提供刷新能力。
 */
export function usePreviewSession({ appId, codeGenType, canEdit, onProjectFilesLoadFailed }: UsePreviewSessionOptions) {
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [savedMultiFileCode, setSavedMultiFileCode] = useState<ParsedCode | null>(null);
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false);
  const [htmlPreviewFrameLoading, setHtmlPreviewFrameLoading] = useState(false);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  // 多文件源码加载状态：访客（无权限）源码不可用，但预览不受影响
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);

  const previewSessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vueFilesAbortRef = useRef<AbortController | null>(null);
  const vueFilesRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appIdRef = useRef(appId);
  const isMountedRef = useRef(true);
  // 流结束后是否已由 handleStreamFinalized 刷新过预览（避免历史兜底重复刷新）
  const previewHandledRef = useRef(false);

  useEffect(() => {
    appIdRef.current = appId;
  }, [appId]);

  const stopPreviewSessionRefresh = useCallback(() => {
    if (previewSessionRefreshTimerRef.current) {
      clearTimeout(previewSessionRefreshTimerRef.current);
      previewSessionRefreshTimerRef.current = null;
    }
  }, []);

  const stopVueFilesPolling = useCallback(() => {
    vueFilesAbortRef.current?.abort();
    if (vueFilesRetryTimerRef.current) {
      clearTimeout(vueFilesRetryTimerRef.current);
      vueFilesRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopVueFilesPolling();
      stopPreviewSessionRefresh();
    };
  }, [stopVueFilesPolling, stopPreviewSessionRefresh]);

  /** 加载多文件源码（仅作者/管理员可访问；访客失败时保留预览、标记源码不可用） */
  const loadSourceCode = useCallback((targetAppId: string) => {
    setSourceLoading(true);
    getPreviewSource(targetAppId)
      .then((source) => {
        if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
        setSavedMultiFileCode({ htmlCode: source.html, cssCode: source.css, jsCode: source.javascript });
        setSourceUnavailable(false);
      })
      .catch(() => {
        if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
        setSourceUnavailable(true);
        setSavedMultiFileCode(null);
      })
      .finally(() => {
        if (isMountedRef.current && targetAppId === appIdRef.current) setSourceLoading(false);
      });
  }, []);

  const refreshHtmlPreview = useCallback(
    (targetAppId: string, genType: string | null | undefined) => {
      if (!targetAppId || !genType) return;
      if (targetAppId === appIdRef.current) stopPreviewSessionRefresh();
      setHtmlPreviewLoading(true);
      getPreviewSession(targetAppId)
        .then(({ previewUrl, expiresIn }) => {
          if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
          setHtmlPreviewUrl(genType === CODE_GEN_TYPES.VUE_PROJECT ? `${previewUrl}?edit=1` : previewUrl);
          setHtmlPreviewFrameLoading(true);
          // 会话到期前按比例提前续期（定时器回调取最新刷新函数）
          stopPreviewSessionRefresh();
          previewSessionRefreshTimerRef.current = window.setTimeout(() => {
            if (isMountedRef.current && targetAppId === appIdRef.current && genType) {
              refreshHtmlPreviewRef.current(targetAppId, genType);
            }
          }, Math.max(60_000, expiresIn * 800));
        })
        .catch(() => {
          // 预览会话获取失败才清空预览 URL（源码加载失败不影响预览，见 loadSourceCode）
          if (isMountedRef.current && targetAppId === appIdRef.current) setHtmlPreviewUrl('');
        })
        .finally(() => {
          if (isMountedRef.current && targetAppId === appIdRef.current) setHtmlPreviewLoading(false);
        });
      // 多文件源码加载独立于预览：失败只标记不可用，不牵连预览 URL
      if (genType === CODE_GEN_TYPES.MULTI_FILE) {
        loadSourceCode(targetAppId);
      }
    },
    [stopPreviewSessionRefresh, loadSourceCode],
  );

  // 定时器回调引用最新的 refreshHtmlPreview（latest-ref 模式，同 useSSE.ts）
  const refreshHtmlPreviewRef = useRef(refreshHtmlPreview);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- latest-ref 模式；useSSE.ts 同款写法
    refreshHtmlPreviewRef.current = refreshHtmlPreview;
  }, [refreshHtmlPreview]);

  // 回调经 ref 中转，避免调用方内联回调导致 fetchVueProjectFiles 每次渲染重建、effect 重复触发
  const onProjectFilesLoadFailedRef = useRef(onProjectFilesLoadFailed);
  useLayoutEffect(() => {
    onProjectFilesLoadFailedRef.current = onProjectFilesLoadFailed;
  }, [onProjectFilesLoadFailed]);

  const fetchVueProjectFiles = useCallback(
    async (targetAppId: string) => {
      if (!targetAppId || !canEdit) return;
      const url = getVueFilesListUrl(targetAppId);
      if (!url) return;

      // 重试：先等待（1s/3s/5s）再递归，应用切换后中止
      const loadProjectFiles = async (retryIndex: number): Promise<void> => {
        vueFilesAbortRef.current?.abort();
        const controller = new AbortController();
        vueFilesAbortRef.current = controller;
        try {
          const res = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            credentials: 'include',
          });
          if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
          if (!res.ok) {
            if (res.status === 404) {
              setProjectFiles([]);
              return;
            }
            if (!RETRYABLE_HTTP_STATUS.includes(res.status)) return;
            throw new Error(`HTTP ${res.status}`);
          }
          const files: ProjectFile[] = await res.json();
          if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
          setProjectFiles((current) => (haveSameProjectFiles(current, files) ? current : files));
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!isMountedRef.current || targetAppId !== appIdRef.current) return;
          if (error instanceof SyntaxError) return;
          const delay = RETRY_DELAYS[retryIndex];
          if (delay == null) {
            onProjectFilesLoadFailedRef.current?.();
            return;
          }
          if (vueFilesRetryTimerRef.current) clearTimeout(vueFilesRetryTimerRef.current);
          vueFilesRetryTimerRef.current = setTimeout(async () => {
            vueFilesRetryTimerRef.current = null;
            if (isMountedRef.current && targetAppId === appIdRef.current) {
              await loadProjectFiles(retryIndex + 1);
            }
          }, delay);
        }
      };

      await loadProjectFiles(0);
    },
    [canEdit],
  );

  // 进入 Vue 应用时拉取一次文件树
  useEffect(() => {
    if (codeGenType !== CODE_GEN_TYPES.VUE_PROJECT || !appId || !canEdit) return;
    fetchVueProjectFiles(appId);
  }, [codeGenType, appId, canEdit, fetchVueProjectFiles]);

  /** 工具写文件事件：实时更新文件树（独立于 markdown 文本提取） */
  const addProjectFile = useCallback((filePath: string, content: string) => {
    setProjectFiles((prev) => {
      const existing = prev.findIndex((f) => f.path === filePath);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = { path: filePath, content };
        return next;
      }
      return [...prev, { path: filePath, content }];
    });
  }, []);

  /** 流开始时调用：清掉上一轮的"预览已处理"标记 */
  const markStreamStarted = useCallback(() => {
    previewHandledRef.current = false;
  }, []);

  /** 标记预览已处理（供调用方在流未正常结束时手动标记，避免历史兜底重复刷新） */
  const markPreviewHandled = useCallback(() => {
    previewHandledRef.current = true;
  }, []);

  /** 流正常结束时调用：刷新预览；Vue 模式顺带拉取最新文件树 */
  const handleStreamFinalized = useCallback(
    (targetAppId: string, genType: string | null | undefined, hasContent: boolean) => {
      previewHandledRef.current = true;
      if (!targetAppId || !genType || !hasContent) return;
      setPreviewCode('');
      refreshHtmlPreview(targetAppId, genType);
      if (genType === CODE_GEN_TYPES.VUE_PROJECT) {
        fetchVueProjectFiles(targetAppId);
      }
    },
    [refreshHtmlPreview, fetchVueProjectFiles],
  );

  /** 切换应用/卸载时清理 */
  const stopAll = useCallback(() => {
    stopVueFilesPolling();
    stopPreviewSessionRefresh();
  }, [stopVueFilesPolling, stopPreviewSessionRefresh]);

  /** 切换应用：清空全部预览状态（流开始前的"旧代码"标记由 markStreamStarted 处理） */
  const resetAll = useCallback(() => {
    stopVueFilesPolling();
    stopPreviewSessionRefresh();
    setPreviewCode('');
    setHtmlPreviewUrl('');
    setSavedMultiFileCode(null);
    setHtmlPreviewLoading(false);
    setHtmlPreviewFrameLoading(false);
    setProjectFiles([]);
    setSourceLoading(false);
    setSourceUnavailable(false);
    previewHandledRef.current = false;
  }, [stopVueFilesPolling, stopPreviewSessionRefresh]);

  return {
    htmlPreviewUrl,
    setHtmlPreviewUrl,
    previewCode,
    setPreviewCode,
    savedMultiFileCode,
    setSavedMultiFileCode,
    htmlPreviewLoading,
    setHtmlPreviewLoading,
    htmlPreviewFrameLoading,
    setHtmlPreviewFrameLoading,
    sourceLoading,
    sourceUnavailable,
    projectFiles,
    setProjectFiles,
    previewHandledRef,
    refreshHtmlPreview,
    fetchVueProjectFiles,
    addProjectFile,
    markStreamStarted,
    markPreviewHandled,
    handleStreamFinalized,
    stopAll,
    resetAll,
  };
}
