import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loginUser, isFetched, fetchLoginUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!isFetched) {
      fetchLoginUser();
    }
  }, [isFetched, fetchLoginUser]);

  // 鉴权 fetch 完成前先渲染 null，避免未登录用户先看到受保护页一帧再被重定向
  if (!isFetched) {
    return null;
  }

  // 鉴权完成后再判定：未登录去登录页，否则直接渲染 children
  if (!loginUser) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // 没有 spinner —— cookie-backed session 在几毫秒内就解析完，闪一下反而像 bug
  return <>{children}</>;
}
