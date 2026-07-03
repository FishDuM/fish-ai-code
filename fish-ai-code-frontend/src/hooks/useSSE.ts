import { useState, useCallback, useRef, useEffect } from 'react';
import { startCodeGenSSE } from '@/api/sse';

export function useSSE(onComplete?: (finalCode: string) => void) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback((appId: string, message: string) => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    isStreamingRef.current = true;
    setIsStreaming(true);
    setCurrentCode('');
    setError(null);

    let accumulated = '';
    timerRef.current = null;

    const scheduleFlush = () => {
      if (timerRef.current) return;
      // Throttle to ~5fps (200ms) — more than enough for AI code output display
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCurrentCode(accumulated);
      }, 200);
    };

    abortRef.current = startCodeGenSSE(appId, message, {
      onChunk: (chunk) => {
        accumulated += chunk;
        scheduleFlush();
      },
      onDone: () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        onComplete?.(accumulated);
      },
      onError: (err) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setError(err);
      },
    });
  }, [onComplete]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
    setCurrentCode('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isStreaming, isStreamingRef, currentCode, error, start, cancel, reset };
}
