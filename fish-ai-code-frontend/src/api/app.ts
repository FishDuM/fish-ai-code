import axios from 'axios';
import { API_BASE_URL } from '@/constants';
import { attachResponseInterceptors } from './interceptors';
import api from './index';
import type {
  BaseResponse,
  AppVO,
  PublicAppVO,
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

/** Whether this app still has a background generation/deployment task holding its project lock. */
export async function getGenerationStatus(appId: string): Promise<boolean> {
  const res = await api.get<BaseResponse<boolean>>('/app/generation/status', { params: { appId } });
  return res.data.data;
}

export async function listMyApps(
  params: AppQueryRequest,
  signal?: AbortSignal,
): Promise<PageResult<AppVO>> {
  const res = await api.post<BaseResponse<PageResult<AppVO>>>('/app/list/page/vo', params, { signal });
  return res.data.data;
}

export async function listFeaturedApps(
  params: AppQueryRequest,
  signal?: AbortSignal,
): Promise<PageResult<PublicAppVO>> {
  const res = await api.post<BaseResponse<PageResult<PublicAppVO>>>('/app/list/featured/vo', params, { signal });
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
  // 延时释放：立即 revoke 在部分浏览器（Safari/旧 Firefox）会取消尚未开始的下载
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

/**
 * 签发预览访问 token：预览 iframe（sandbox 无 allow-same-origin）无法带 cookie，
 * 静态资源改用 URL 携带的短时签名 token 鉴权。
 * @param previewKey 如 html_441056231631798272
 */
export async function getPreviewToken(previewKey: string): Promise<{ token: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/static/preview-token/${previewKey}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('获取预览权限失败');
  }
  const data = await response.json();
  return data?.data ?? data;
}
