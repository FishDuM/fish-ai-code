import api from './index';
import type { BaseResponse, ChatHistory, PageResult, AdminChatHistoryQueryRequest } from './types';

export async function getLatestChatHistory(appId: string, limit: number = 10): Promise<ChatHistory[]> {
  const res = await api.get<BaseResponse<ChatHistory[]>>('/chatHistory/latest', {
    params: { appId, limit },
  });
  return res.data.data;
}

export async function listChatHistoryBefore(
  appId: string,
  before: string,
  limit: number = 10,
): Promise<ChatHistory[]> {
  const res = await api.get<BaseResponse<ChatHistory[]>>('/chatHistory/list/before', {
    params: { appId, before, limit },
  });
  return res.data.data;
}

export async function adminListChatHistory(
  params: AdminChatHistoryQueryRequest,
): Promise<PageResult<ChatHistory>> {
  const res = await api.post<BaseResponse<PageResult<ChatHistory>>>(
    '/chatHistory/admin/list/page',
    params,
  );
  return res.data.data;
}
