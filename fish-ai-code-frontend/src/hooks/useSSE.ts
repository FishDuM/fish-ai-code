import { useState, useCallback, useRef, useEffect } from 'react';
import { startCodeGenSSE } from '@/api/sse';

export function useSSE(onComplete?: (finalCode: string) => void) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const rafRef = useRef<number>(0);

  const start = useCallback((appId: string, message: string) => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    isStreamingRef.current = true;
    setIsStreaming(true);
    setCurrentCode('');
    setError(null);

    let accumulated = '';
    let dirty = false;

    const flush = () => {
      if (dirty) {
        setCurrentCode(accumulated);
        dirty = false;
      }
      rafRef.current = requestAnimationFrame(flush);
    };
    rafRef.current = requestAnimationFrame(flush);

    abortRef.current = startCodeGenSSE(appId, message, {
      onChunk: (chunk) => {
        accumulated += chunk;
        dirty = true;
      },
      onDone: () => {
        cancelAnimationFrame(rafRef.current);
        setCurrentCode(accumulated);
        isStreamingRef.current = false;
        setIsStreaming(false);
        onComplete?.(accumulated);
      },
      onError: (err) => {
        cancelAnimationFrame(rafRef.current);
        isStreamingRef.current = false;
        setIsStreaming(false);
        setError(err);
      },
    });
  }, [onComplete]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    isStreamingRef.current = false;
    setIsStreaming(false);
    setCurrentCode('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isStreaming, isStreamingRef, currentCode, error, start, cancel, reset };
}
