import type { AxiosError, AxiosInstance } from 'axios';
import { ERROR_CODES } from '@/constants';
import { ApiError } from './error';
import { handleAuthExpired } from './authExpired';

interface ApiEnvelope {
  code?: number;
  message?: string;
}

/**
 * Attach the project's standard response interceptor to an axios instance.
 *
 * - 200 OK with `code === 0` → resolve normally
 * - 200 OK with a non-zero business code → reject with `ApiError` carrying
 *   the code; if the code is NOT_LOGIN_ERROR (40100) we also trigger the
 *   unified auth-expired flow (auth:logout event + single redirect to /login)
 * - Network/HTTP error → if 401 do the same redirect; otherwise wrap the
 *   error in a new Error with a user-friendly Chinese message so we don't
 *   mutate the axios-provided error object (callers may keep a reference).
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
      if (error.response) {
        if (error.response.status === 401) {
          // HTTP 401 也走统一的去重重定向，避免和业务码 40100 的跳转互相覆盖。
          handleAuthExpired();
        } else {
          // Backend's GlobalExceptionHandler wraps HTTP errors in the same
          // BaseResponse envelope as business errors ({code, message, data}).
          // Surface that message via ApiError so callers like Login show
          // "用户不存在" instead of axios's English default of
          // "Request failed with status code 401".
          const data = error.response.data as ApiEnvelope | undefined;
          if (data && typeof data.message === 'string' && data.message) {
            return Promise.reject(
              new ApiError(data.code ?? error.response.status, data.message),
            );
          }
        }
      } else if (error.code === 'ECONNABORTED') {
        // 不直接改 axios 原始 error.message（外部可能保留了引用），改用包一层
        // 的方式产出友好提示；通过 cause 保留对原 error 的引用便于排查。
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
