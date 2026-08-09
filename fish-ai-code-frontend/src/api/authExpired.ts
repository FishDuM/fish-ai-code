/**
 * 统一认证失效处理：HTTP 401 或业务码 40100 都走同一流程——
 * 清理登录状态、保留当前地址、只触发一次跳转 /login?redirect=当前页。
 * Axios 拦截器、SSE 传输层、SSE 业务错误回调共用，避免各写一套。
 */

// 模块级标志位：一次会话里只跳一次 /login，避免以下问题：
//  - 多个并发 401 触发多次 location.href 写入，最后一次写入的 redirect 参数
//    会覆盖前面的，导航到错的页；
//  - 同步改 location 可能在异步 reject 链路里造成 setState-on-unmounted 副作用。
let redirecting = false;

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

/**
 * 触发一次 auth:logout + 延迟跳转到 /login。重复调用是 no-op。
 * 用 setTimeout(..., 0) 把跳转推到下一个宏任务，避免在异步 reject 回调里
 * 同步修改 location；首次 dispatch 仍同步发出，监听者能即时收到状态。
 */
export function handleAuthExpired(): void {
  if (redirecting) return;
  redirecting = true;
  window.dispatchEvent(new CustomEvent('auth:logout'));
  setTimeout(() => {
    window.location.href = buildLoginRedirectUrl();
    // 跳转完成后复位，避免本页面生命周期内后续 401（如跳转被浏览器延迟/拦截时）永久失效
    redirecting = false;
  }, 0);
}
