import { useState, useCallback, useRef, useEffect } from 'react';
import { startCodeGenSSE } from '@/api/sse';

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((appId: string, message: string) => {
    abortRef.current?.abort();
    setIsStreaming(true);
    setCurrentCode('');
    setError(null);

    let accumulated = '';

    abortRef.current = startCodeGenSSE(appId, message, {
      onChunk: (chunk) => {
        accumulated += chunk;
        setCurrentCode(accumulated);
      },
      onDone: () => {
        setIsStreaming(false);
      },
      onError: (err) => {
        setIsStreaming(false);
        setError(err);
      },
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCurrentCode('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { isStreaming, currentCode, error, start, cancel, reset };
}
