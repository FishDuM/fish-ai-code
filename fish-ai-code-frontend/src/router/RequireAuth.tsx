import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spin } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loginUser, isFetched, fetchLoginUser } = useAuthStore();
  const location = useLocation();

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

  return <>{children}</>;
}
