import type { AxiosError, AxiosInstance } from 'axios';
import { ERROR_CODES } from '@/constants';
import { ApiError } from './error';

/**
 * Build a /login URL that preserves the current page so users return here
 * after re-authenticating. Skip if we're already on the auth pages.
 */
export function buildLoginRedirectUrl(): string {
  const path = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;
  if (path === '/login' || path === '/register') {
    return '/login';
  }
  const current = path + search + hash;
  return `/login?redirect=${encodeURIComponent(current)}`;
}

interface ApiEnvelope {
  code?: number;
  message?: string;
}

// 模块级标志位：一次会话里只跳一次 /login，避免以下问题：
//  - 多个并发 401 触发多次 location.href 写入，最后一次写入的 redirect 参数
//    会覆盖前面的，导航到错的页；
//  - 同步改 location 可能在 axios reject 链路里造成 setState-on-unmounted
//    之类的副作用（被 React 18+ 静默忽略也会带来性能浪费）。
let redirecting = false;

/**
 * 触发一次 auth:logout + 延迟跳转到 /login。重复调用是 no-op。
 * 用 setTimeout(..., 0) 把跳转推到下一个宏任务，避免在 axios reject 回调里
 * 同步修改 location；首次 dispatch 仍同步发出，监听者能即时收到状态。
 */
function scheduleAuthRedirect(): void {
  if (redirecting) return;
  redirecting = true;
  window.dispatchEvent(new CustomEvent('auth:logout'));
  setTimeout(() => {
    window.location.href = buildLoginRedirectUrl();
  }, 0);
}

/**
 * Attach the project's standard response interceptor to an axios instance.
 *
 * - 200 OK with `code === 0` → resolve normally
 * - 200 OK with a non-zero business code → reject with `ApiError` carrying
 *   the code; if the code is NOT_LOGIN_ERROR (40100) we also dispatch the
 *   `auth:logout` window event and schedule a single redirect to /login
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
          scheduleAuthRedirect();
        }
        return Promise.reject(new ApiError(data.code, data.message || '请求失败'));
      }
      return response;
    },
    (error: AxiosError) => {
      if (error.response) {
        if (error.response.status === 401) {
          // HTTP 401 也走统一的去重重定向，避免和业务码 40100 的跳转互相覆盖。
          scheduleAuthRedirect();
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
