import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { CODE_GEN_TYPES } from '@/constants';
import { useSSE } from '@/hooks/useSSE';
import { cleanVueOutput } from '@/utils/codeParser';
import { newMsgId } from '@/utils/msgId';
import type { Message } from '@/types/chat';

interface UseChatStreamOptions {
  appId: string | undefined;
  canEdit: boolean;
  backgroundGeneration: boolean;
  codeGenType: string | null | undefined;
  /** 流开始时回调：清理上一轮的预览/文件状态 */
  onStreamStarted: () => void;
  /** 流正常完成时回调 */
  onStreamFinalized: (appId: string, codeGenType: string | null | undefined, hasContent: boolean) => void;
  /** 工具写文件事件（Vue 项目文件树） */
  onToolFile?: (filePath: string, content: string) => void;
}

/**
 * 流式生成状态机：包裹 useSSE，负责消息列表、流式气泡、发送/停止/批量编辑发送。
 */
export function useChatStream({
  appId,
  canEdit,
  backgroundGeneration,
  codeGenType,
  onStreamStarted,
  onStreamFinalized,
  onToolFile,
}: UseChatStreamOptions) {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  // 流式气泡独立于 messages：流期间不抖动机历史数组引用；流结束合并为一条普通消息
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const streamingMessageRef = useRef<Message | null>(null);
  // 新流首个 chunk 到达前的旧代码值：useSSE 不清 currentCode（防预览闪白），
  // 同步 effect 靠它区分"旧代码"与"新流内容"
  const streamStartCodeRef = useRef('');

  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);

  const handleStreamComplete = useCallback((finalCode: string) => {
    const cleaned = codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? cleanVueOutput(finalCode) : finalCode;
    if (!cleaned) {
      setStreamingMessage(null);
      if (appId) {
        onStreamFinalized(appId, codeGenType, false);
      }
      return;
    }
    const live = streamingMessageRef.current;
    if (live) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === live.id)) return prev;
        return [...prev, { ...live, content: cleaned, isStreaming: false }];
      });
      setStreamingMessage(null);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: 'ai', content: cleaned, createTime: new Date().toISOString() },
      ]);
    }
    if (appId) {
      onStreamFinalized(appId, codeGenType, true);
    }
  }, [codeGenType, appId, onStreamFinalized]);

  const handleToolExecuted = useCallback(
    (info: { toolName: string; filePath: string; content?: string }) => {
      if (!info.filePath || !info.content) return;
      onToolFile?.(info.filePath, info.content);
    },
    [onToolFile],
  );

  const handleBusinessError = useCallback(
    (code: number, errorMessage: string, finalAccumulated?: string) => {
      const isAuthExpired = code === 40100;
      const rawContent = finalAccumulated !== undefined ? finalAccumulated : '';
      const cleanedFinal = codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? cleanVueOutput(rawContent) : rawContent;

      setStreamingMessage((current) => {
        if (!current || !current.isStreaming) return current;
        setMessages((prev) => {
          if (prev.some((m) => m.id === current.id)) return prev;
          const effectiveContent = cleanedFinal || current.content || '';
          const hadContent = effectiveContent.trim().length > 0;
          const content = isAuthExpired
            ? effectiveContent
            : hadContent
              ? `${effectiveContent}\n\n> ⚠️ ${errorMessage}`
              : `❌ ${errorMessage}`;
          return [...prev, { ...current, content, isStreaming: false }];
        });
        return null;
      });
      if (!isAuthExpired) message.error(errorMessage);
    },
    [codeGenType, message],
  );

  const {
    isStreaming,
    isStreamingRef,
    preparing,
    currentCode,
    error: sseError,
    start,
    cancel,
    reset,
  } = useSSE(handleStreamComplete, handleToolExecuted, handleBusinessError);

  const cleanedCode = useMemo(
    () => (codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? cleanVueOutput(currentCode) : currentCode),
    [currentCode, codeGenType],
  );

  // 把流内容同步进流式气泡。新流首个 chunk 到达前（cleanedCode 仍是旧值）跳过，
  // 避免把上一轮的旧代码预填进新气泡
  useEffect(() => {
    if (!streamingMessage || !streamingMessage.isStreaming) return;
    setStreamingMessage((prev) => {
      if (!prev || cleanedCode === streamStartCodeRef.current) return prev;
      if (prev.content === cleanedCode) return prev;
      return { ...prev, content: cleanedCode };
    });
  }, [cleanedCode, streamingMessage]);

  /** 通用开始流程：记录旧代码、创建流式气泡、清上一轮标志、启动 SSE */
  const beginStream = useCallback(
    (text: string) => {
      if (!appId) return;
      streamStartCodeRef.current = cleanedCode;
      setStreamingMessage({
        id: newMsgId(),
        role: 'ai',
        content: '',
        createTime: new Date().toISOString(),
        isStreaming: true,
      });
      onStreamStarted();
      start(appId, text);
    },
    [appId, cleanedCode, start, onStreamStarted],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!text || isStreamingRef.current || backgroundGeneration || !appId) return;
      if (!canEdit) {
        message.warning('只有应用创建者或管理员可以继续编辑这个应用');
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: 'user', content: text, createTime: new Date().toISOString() },
      ]);
      beginStream(text);
    },
    [appId, backgroundGeneration, canEdit, message, beginStream, isStreamingRef],
  );

  /** 批量编辑发送的流式部分（气泡/标志/启动）；队列与校验在 useEditMode */
  const sendBatchEdits = useCallback(
    (composed: string) => {
      setSavingEdits(true);
      beginStream(composed);
    },
    [beginStream],
  );

  /** 停止：提交已产出内容后中断（后端仍会后台跑完，见 Chat.tsx 的轮询） */
  const cancelStreaming = useCallback(() => {
    setStreamingMessage((current) => {
      if (current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === current.id)) return prev;
          if (!current.content) return prev;
          return [...prev, { ...current, isStreaming: false }];
        });
      }
      return null;
    });
    cancel();
  }, [cancel]);

  const flushStreamingMessage = useCallback(() => {
    const live = streamingMessageRef.current;
    if (!live || !live.isStreaming) return;
    if (live.content) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === live.id)) return prev;
        return [...prev, { ...live, isStreaming: false }];
      });
    }
    setStreamingMessage(null);
  }, [setMessages]);

  // 兜底：流结束但未走 handleStreamComplete（传输异常）时提交残留气泡
  useEffect(() => {
    if (isStreaming) return;
    const timer = window.setTimeout(flushStreamingMessage, 0);
    return () => window.clearTimeout(timer);
  }, [isStreaming, flushStreamingMessage]);

  // 批量发送完成后解除 saving 状态
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const prev = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (prev && !isStreaming) {
      setSavingEdits(false);
    }
  }, [isStreaming]);

  /** 切换应用：中断流并清空所有消息状态 */
  const clearAll = useCallback(() => {
    reset();
    setMessages([]);
    setStreamingMessage(null);
  }, [reset]);

  return {
    messages,
    setMessages,
    streamingMessage,
    isStreaming,
    isStreamingRef,
    preparing,
    currentCode,
    cleanedCode,
    sseError,
    savingEdits,
    handleSend,
    beginStream,
    sendBatchEdits,
    cancelStreaming,
    clearAll,
  };
}
