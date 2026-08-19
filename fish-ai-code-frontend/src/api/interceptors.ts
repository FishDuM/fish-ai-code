import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { ERROR_CODES } from '@/constants';
import { ApiError } from './error';
import { handleAuthExpired } from './authExpired';

interface ApiEnvelope {
  code?: number;
  message?: string;
}

/**
 * 注册全局 Axios 响应拦截器
 * 统一处理业务状态码（code === 0 为成功）、登录过期（40100/401）及网络异常提示。
 */
export function attachResponseInterceptors(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => {
      const data = response.data as ApiEnvelope | undefined;
      if (data?.code !== undefined && data.code !== ERROR_CODES.SUCCESS) {
        if (data.code === ERROR_CODES.NOT_LOGIN_ERROR) {
          handleAuthExpired();
        }
        return Promise.reject(new ApiError(data.code, data.message || '请求失败'));
      }
      return response;
    },
    (error: AxiosError) => {
      if (axios.isCancel(error) || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return Promise.reject(error);
      }
      if (error.response) {
        if (error.response.status === 401) {
          handleAuthExpired();
        } else {
          const data = error.response.data as ApiEnvelope | undefined;
          if (data && typeof data.message === 'string' && data.message) {
            return Promise.reject(
              new ApiError(data.code ?? error.response.status, data.message),
            );
          }
        }
      } else if (error.code === 'ECONNABORTED') {
        const wrapped = new Error('请求超时');
        (wrapped as Error & { cause?: unknown }).cause = error;
        return Promise.reject(wrapped);
      } else {
        const wrapped = new Error('网络异常');
        (wrapped as Error & { cause?: unknown }).cause = error;
        return Promise.reject(wrapped);
      }
      return Promise.reject(error);
    }
  );
}
