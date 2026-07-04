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
