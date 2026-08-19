import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [preparing, setPreparing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparingRef = useRef(false);
  const epochRef = useRef(0);

  const start = useCallback((appId: string, message: string) => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    isStreamingRef.current = true;
    setIsStreaming(true);
    preparingRef.current = true;
    setPreparing(true);
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
        onComplete?.(accumulated);
      },
      onError: (err) => {
        if (epochRef.current !== myEpoch) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        if (accumulated) setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPreparing(false);
        setError(err);
      },
      onToolExecuted: (toolName, filePath, content) => {
        if (epochRef.current !== myEpoch) return;
        onToolExecuted?.({ toolName, filePath, content });
      },
      onBusinessError: (code, message) => {
        if (epochRef.current !== myEpoch) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPreparing(false);
        onBusinessError?.(code, message, accumulated);
      },
    });
  }, [onComplete, onToolExecuted, onBusinessError]);

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
