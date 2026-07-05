import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Result, Button } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';
import { USER_ROLES } from '@/constants';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loginUser, isFetched, fetchLoginUser } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isFetched) {
      fetchLoginUser();
    }
  }, [isFetched, fetchLoginUser]);

  // 鉴权 fetch 完成前先渲染 null，避免非 admin 先看到 AdminLayout 一帧再被换为 403
  if (!isFetched) {
    return null;
  }

  if (!loginUser) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (loginUser.userRole !== USER_ROLES.ADMIN) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="抱歉，你没有权限访问此页面"
        extra={<Button type="primary" onClick={() => navigate('/')}>返回首页</Button>}
      />
    );
  }

  return <>{children}</>;
}
