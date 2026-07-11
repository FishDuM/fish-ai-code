import axios from 'axios';
import { API_BASE_URL } from '@/constants';
import { attachResponseInterceptors } from './interceptors';
import api from './index';
import type {
  BaseResponse,
  AppVO,
  App,
  AppAddRequest,
  AppUpdateRequest,
  AppDeployRequest,
  AppQueryRequest,
  PageResult,
  AdminAppUpdateRequest,
  AdminAppQueryRequest,
} from './types';

/**
 * Axios instance with extended timeout for deploy operations.
 * Vue project npm install + build can take 2-5 minutes.
 */
const apiLongTimeout = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 600000, // 10 minutes
  headers: { 'Content-Type': 'application/json' },
});
attachResponseInterceptors(apiLongTimeout);

export async function createApp(data: AppAddRequest): Promise<string> {
  const res = await api.post<BaseResponse<string>>('/app/add', data);
  return res.data.data;
}

export async function updateMyApp(data: AppUpdateRequest): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/app/update', data);
  return res.data.data;
}

export async function deleteMyApp(id: string): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/app/delete', { id });
  return res.data.data;
}

export async function deployApp(data: AppDeployRequest): Promise<string> {
  const res = await apiLongTimeout.post<BaseResponse<string>>('/app/deploy', data);
  return res.data.data;
}

export async function getAppVO(id: string): Promise<AppVO> {
  const res = await api.get<BaseResponse<AppVO>>('/app/get/vo', { params: { id } });
  return res.data.data;
}

export async function listMyApps(params: AppQueryRequest): Promise<PageResult<AppVO>> {
  const res = await api.post<BaseResponse<PageResult<AppVO>>>('/app/list/page/vo', params);
  return res.data.data;
}

export async function listFeaturedApps(params: AppQueryRequest): Promise<PageResult<AppVO>> {
  const res = await api.post<BaseResponse<PageResult<AppVO>>>('/app/list/featured/vo', params);
  return res.data.data;
}

// Admin APIs
export async function adminListApps(params: AdminAppQueryRequest): Promise<PageResult<App>> {
  const res = await api.post<BaseResponse<PageResult<App>>>('/app/admin/list/page', params);
  return res.data.data;
}

export async function adminUpdateApp(data: AdminAppUpdateRequest): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/app/admin/update', data);
  return res.data.data;
}

export async function adminDeleteApp(id: string): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/app/admin/delete', { id });
  return res.data.data;
}

export async function adminGetApp(id: string): Promise<App> {
  const res = await api.get<BaseResponse<App>>('/app/admin/get', { params: { id } });
  return res.data.data;
}

/**
 * 下载应用代码 ZIP 包
 * 使用 fetch 而非 axios 以避免 responseType: 'blob' 与 JSON 拦截器的冲突，
 * 且能通过 Content-Type 区分成功响应（application/zip）和错误响应（application/json）。
 * @param appId 应用 ID
 */
export async function downloadAppCode(appId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/app/download/${appId}`, {
    credentials: 'include',
  });
  const contentType = response.headers.get('content-type') || '';
  // 后端错误处理返回的是 JSON（BaseResponse），而非 ZIP
  if (!contentType.includes('application/zip')) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || '下载失败');
  }
  // 从 Content-Disposition 中提取文件名
  const disposition = response.headers.get('content-disposition');
  let filename = `${appId}.zip`;
  if (disposition) {
    const match = disposition.match(/filename="?(.+?)"?$/);
    if (match) {
      filename = match[1];
    }
  }
  // 创建临时下载链接并触发下载
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
