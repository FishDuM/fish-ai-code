import api from './index';
import { API_BASE_URL } from '@/constants';
import type {
  BaseResponse,
  LoginUserVO,
  UserRegisterRequest,
  UserLoginRequest,
  PageResult,
  UserVO,
  UserQueryRequest,
  UserUpdateRequest,
  UserAddRequest,
} from './types';

export async function login(data: UserLoginRequest): Promise<LoginUserVO> {
  const res = await api.post<BaseResponse<LoginUserVO>>('/user/login', data);
  return res.data.data;
}

export async function register(data: UserRegisterRequest): Promise<string> {
  const res = await api.post<BaseResponse<string>>('/user/register', data);
  return res.data.data;
}

/**
 * Probe the current session. Uses raw fetch to avoid the axios interceptor
 * treating a normal "not logged in" (40100) as a session-expired redirect.
 * Returns null when the user is not logged in or the request fails/times out.
 */
export async function getLoginUser(): Promise<LoginUserVO | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_BASE_URL}/user/get/login`, {
      credentials: 'include',
      signal: controller.signal,
    });
    const json: BaseResponse<LoginUserVO> = await res.json();
    if (json.code === 0) return json.data;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function logout(): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/user/logout');
  return res.data.data;
}

// Admin APIs
export async function listUsers(params: UserQueryRequest): Promise<PageResult<UserVO>> {
  const res = await api.post<BaseResponse<PageResult<UserVO>>>('/user/list/page/vo', params);
  return res.data.data;
}

export async function updateUser(data: UserUpdateRequest): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/user/update', data);
  return res.data.data;
}

export async function deleteUser(id: string): Promise<boolean> {
  const res = await api.post<BaseResponse<boolean>>('/user/delete', { id });
  return res.data.data;
}

export async function addUser(data: UserAddRequest): Promise<string> {
  const res = await api.post<BaseResponse<string>>('/user/add', data);
  return res.data.data;
}
