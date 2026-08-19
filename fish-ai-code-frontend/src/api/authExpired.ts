/**
 * 认证失效统一处理
 */

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
 * 触发退出登录并跳转至登录页
 */
export function handleAuthExpired(): void {
  if (redirecting) return;
  redirecting = true;
  window.dispatchEvent(new CustomEvent('auth:logout'));
  setTimeout(() => {
    window.location.href = buildLoginRedirectUrl();
    redirecting = false;
  }, 0);
}
