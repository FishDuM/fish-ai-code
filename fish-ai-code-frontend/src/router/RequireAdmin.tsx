import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spin, Result, Button } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';
import { USER_ROLES } from '@/constants';
import { useNavigate } from 'react-router';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loginUser, isFetched, fetchLoginUser } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isFetched) {
      fetchLoginUser();
    }
  }, [isFetched, fetchLoginUser]);

  if (!isFetched) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!loginUser) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
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
