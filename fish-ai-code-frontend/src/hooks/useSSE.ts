import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { startCodeGenSSE } from '@/api/sse';

interface ToolExecutedInfo {
  toolName: string;
  filePath: string;
  content?: string;
}

export function useSSE(
  onComplete?: (finalCode: string) => void,
  onToolExecuted?: (info: ToolExecutedInfo) => void,
  onBusinessError?: (code: number, message: string, finalAccumulated?: string) => void
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [error, setError] = useState<Error | null>(null);
  // 准备中：请求已发出（后端在做敏感审查/图片收集/提示词增强），
  // 但首个内容 chunk 尚未到达。首 chunk 到达后切 false，用于显示"正在校验并准备素材..."。
  const [preparing, setPreparing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // preparing 的 ref 镜像：onChunk 回调里同步读写，避免依赖 state 闭包
  const preparingRef = useRef(false);
  // Epoch counter: each start() bumps it. Any pending timer/callback checks
  // the current epoch and bails out if it no longer matches — prevents stale
  // closures from old streams overwriting new state.
  const epochRef = useRef(0);
  // Use refs to avoid stale closure issues — always call the LATEST callback.
  const onCompleteRef = useRef(onComplete);
  const onToolExecutedRef = useRef(onToolExecuted);
  const onBusinessErrorRef = useRef(onBusinessError);
  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
    onToolExecutedRef.current = onToolExecuted;
    onBusinessErrorRef.current = onBusinessError;
  }, [onComplete, onToolExecuted, onBusinessError]);

  const start = useCallback((appId: string, message: string) => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    isStreamingRef.current = true;
    setIsStreaming(true);
    preparingRef.current = true;
    setPreparing(true);
    // 注意：不要在这里 `setCurrentCode('')`！那会让 iframe 立刻闪一下空白，
    // 等第一帧 chunk 到再覆盖。下方 onDone 之前，`currentCode` 保留为上一次
    // 流式结束时的值（或初始 ''），iframe 继续显示上一次预览，避免闪烁。
    setError(null);

    let accumulated = '';
    timerRef.current = null;

    const scheduleFlush = () => {
      if (epochRef.current !== myEpoch) return;
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (epochRef.current !== myEpoch) return;
        setCurrentCode(accumulated);
      }, 200);
    };

    abortRef.current = startCodeGenSSE(appId, message, {
      onChunk: (chunk) => {
        if (epochRef.current !== myEpoch) return;
        if (preparingRef.current) {
          preparingRef.current = false;
          setPreparing(false);
        }
        accumulated += chunk;
        scheduleFlush();
      },
      onDone: () => {
        if (epochRef.current !== myEpoch) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPreparing(false);
        onCompleteRef.current?.(accumulated);
      },
      onError: (err) => {
        if (epochRef.current !== myEpoch) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        // 传输中断：flush 已累积内容避免尾部丢失；空内容（连接即失败）
        // 不清空 currentCode，避免预览 iframe 闪白。
        if (accumulated) setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPreparing(false);
        setError(err);
      },
      onToolExecuted: (toolName, filePath, content) => {
        if (epochRef.current !== myEpoch) return;
        onToolExecutedRef.current?.({ toolName, filePath, content });
      },
      onBusinessError: (code, message) => {
        if (epochRef.current !== myEpoch) return;
        // 先把已累积内容 flush 到 currentCode，再回调业务错误处理——
        // 否则 streamingMessage.content 停在最后一次 200ms 防抖的值，尾部内容丢失。
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPreparing(false);
        onBusinessErrorRef.current?.(code, message, accumulated);
      },
    });
  }, []); // No external deps — refs stay current

  const cancel = useCallback(() => {
    epochRef.current += 1;
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
    preparingRef.current = false;
    setPreparing(false);
  }, []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
    preparingRef.current = false;
    setPreparing(false);
    setCurrentCode('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isStreaming, isStreamingRef, preparing, currentCode, error, start, cancel, reset };
}
