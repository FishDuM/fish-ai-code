import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { MAX_EDITS } from '@/components/ChatInput';
import { buildBatchEditPrompt } from '@/utils/editPromptBuilder';
import { EDIT_MODE_SOURCE, type SelectedElement, type EditModeControlMessage } from '@/types/editMode';
import { newMsgId } from '@/utils/msgId';
import type { Message } from '@/types/chat';

interface PendingEditItem {
  id: string;
  element: SelectedElement;
  instruction: string;
}

interface UseEditModeOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  canEdit: boolean;
  appId: string | undefined;
  backgroundGeneration: boolean;
  isStreamingRef: React.RefObject<boolean>;
  savingEdits: boolean;
  /** 触发流式部分：设置 savingEdits + 创建气泡 + 启动 SSE（队列校验在发送前完成） */
  sendBatchEdits: (composed: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** 仅作为"重新高亮选中元素"effect 的依赖 */
  previewCode: string;
  htmlPreviewUrl: string;
}

/**
 * 可视化编辑模式：iframe 内点选元素 → 批量编辑队列 → 一次性发送。
 */
export function useEditMode({
  iframeRef,
  canEdit,
  appId,
  backgroundGeneration,
  isStreamingRef,
  savingEdits,
  sendBatchEdits,
  setMessages,
  previewCode,
  htmlPreviewUrl,
}: UseEditModeOptions) {
  const { message } = App.useApp();
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEditItem[]>([]);
  // 队列所属应用 ID
  const [pendingEditsOwnerAppId, setPendingEditsOwnerAppId] = useState<string | null>(null);
  // 上次选中的 selector：AI 重写页面后重新高亮
  const [pendingHighlightSelector, setPendingHighlightSelector] = useState<string | null>(null);

  const postEditModeMessage = useCallback(
    (msg: EditModeControlMessage) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        iframe.contentWindow?.postMessage({ source: EDIT_MODE_SOURCE, ...msg }, '*');
      } catch {
        // 跨域或已分离，忽略
      }
    },
    [iframeRef],
  );

  /** 将 iframe 内元素矩形换算为页面坐标，贴近视口底部时翻转到上方 */
  const computePopoverPosition = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const iframeEl = iframeRef.current;
      if (!iframeEl) return null;
      const iframeRect = iframeEl.getBoundingClientRect();
      const POPOVER_HEIGHT_ESTIMATE = 180;
      const GAP = 8;
      const absoluteTop = iframeRect.top + rect.y + rect.height + GAP;
      const wouldOverflow = absoluteTop + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - GAP;
      const top = wouldOverflow
        ? Math.max(GAP, iframeRect.top + rect.y - POPOVER_HEIGHT_ESTIMATE - GAP)
        : absoluteTop;
      return { left: iframeRect.left + rect.x, top };
    },
    [iframeRef],
  );

  // 接收 iframe 注入脚本的 postMessage（ready / select）
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as
        | { source?: string; type?: string; element?: SelectedElement | null }
        | undefined;
      if (!data || data.source !== EDIT_MODE_SOURCE) return;
      if (data.type === 'ready') {
        postEditModeMessage({ type: editMode ? 'enable' : 'disable' });
        if (editMode && pendingHighlightSelector) {
          postEditModeMessage({ type: 'highlight', selector: pendingHighlightSelector });
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
  }, [iframeRef, computePopoverPosition, postEditModeMessage, editMode, pendingHighlightSelector]);

  // iframe 加载新内容后重新绘制高亮（注入脚本每次加载自动运行，只需等 load）
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !pendingHighlightSelector || !editMode) return;
    const handler = () => {
      postEditModeMessage({ type: 'highlight', selector: pendingHighlightSelector });
    };
    iframe.addEventListener('load', handler);
    const t = window.setTimeout(() => {
      postEditModeMessage({ type: 'highlight', selector: pendingHighlightSelector });
    }, 0);
    return () => {
      iframe.removeEventListener('load', handler);
      window.clearTimeout(t);
    };
  }, [previewCode, htmlPreviewUrl, editMode, pendingHighlightSelector, postEditModeMessage, iframeRef]);

  // 视口变化时保持弹层锚定在选中元素上
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

  const handleEditModeChange = useCallback(
    (checked: boolean) => {
      setEditMode(checked);
      if (!checked) {
        postEditModeMessage({ type: 'disable' });
        setSelectedElement(null);
        setPopoverPosition(null);
        setPendingHighlightSelector(null);
      } else {
        postEditModeMessage({ type: 'enable' });
      }
    },
    [postEditModeMessage],
  );

  /** 重置全部编辑状态 */
  const resetEditState = useCallback(() => {
    postEditModeMessage({ type: 'unselect' });
    postEditModeMessage({ type: 'disable' });
    setEditMode(false);
    setSelectedElement(null);
    setPopoverPosition(null);
    setPendingEdits([]);
    setPendingEditsOwnerAppId(null);
    setPendingHighlightSelector(null);
  }, [postEditModeMessage]);

  // 切换应用时清理编辑状态
  const prevAppIdRef = useRef(appId);
  useEffect(() => {
    if (prevAppIdRef.current !== appId) {
      prevAppIdRef.current = appId;
      resetEditState();
    }
  }, [appId, resetEditState]);

  // 只读切换时清理
  const prevCanEditRef = useRef(canEdit);
  useEffect(() => {
    if (prevCanEditRef.current !== canEdit) {
      prevCanEditRef.current = canEdit;
      resetEditState();
    }
  }, [canEdit, resetEditState]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      resetEditState();
    };
  }, [resetEditState]);

  /** 加入待保存队列（不立即发送），上限 15 条 */
  const handleAddEdit = useCallback(
    (instruction: string) => {
      if (!instruction || !selectedElement || !appId) return;
      if (pendingEdits.length >= MAX_EDITS) {
        message.warning('最多只能添加 15 条编辑，请先保存');
        return;
      }
      setPendingEdits((prev) => [
        ...prev,
        { id: newMsgId(), element: selectedElement, instruction: instruction.trim() },
      ]);
      setPendingEditsOwnerAppId(appId);
      postEditModeMessage({ type: 'unselect' });
      setSelectedElement(null);
      setPopoverPosition(null);
    },
    [selectedElement, appId, postEditModeMessage, message, pendingEdits.length],
  );

  const handleRemoveEdit = useCallback((id: string) => {
    setPendingEdits((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleEditCancel = useCallback(() => {
    postEditModeMessage({ type: 'unselect' });
    setSelectedElement(null);
    setPopoverPosition(null);
  }, [postEditModeMessage]);

  /** 批量发送：合并队列为一条 prompt 交给流式链路 */
  const handleSendAllEdits = useCallback(() => {
    const queue = pendingEdits;
    if (!queue.length || savingEdits) return;
    if (!appId) return;
    // 队列不属于当前应用时拒绝发送
    if (pendingEditsOwnerAppId !== appId) {
      message.warning('当前编辑内容已失效，请重新添加');
      setPendingEdits([]);
      setPendingEditsOwnerAppId(null);
      setPendingHighlightSelector(null);
      return;
    }
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

    setPendingEdits([]);
    setPendingEditsOwnerAppId(null);
    setPendingHighlightSelector(queue[queue.length - 1].element.selector);
    setMessages((prev) => [
      ...prev,
      { id: newMsgId(), role: 'user', content: composed, createTime: new Date().toISOString() },
    ]);
    postEditModeMessage({ type: 'unselect' });
    sendBatchEdits(composed);
  }, [
    pendingEdits,
    pendingEditsOwnerAppId,
    appId,
    canEdit,
    message,
    savingEdits,
    sendBatchEdits,
    isStreamingRef,
    backgroundGeneration,
    setMessages,
    postEditModeMessage,
  ]);

  return {
    editMode,
    selectedElement,
    popoverPosition,
    pendingEdits,
    pendingHighlightSelector,
    postEditModeMessage,
    computePopoverPosition,
    handleEditModeChange,
    handleAddEdit,
    handleRemoveEdit,
    handleEditCancel,
    handleSendAllEdits,
    resetEditState,
  };
}
