import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import BasicLayout from '@/layouts/BasicLayout';
import AdminLayout from '@/layouts/AdminLayout';
import BlankLayout from '@/layouts/BlankLayout';
import { RequireAuth } from './RequireAuth';
import { RequireAdmin } from './RequireAdmin';

const Home = lazy(() => import('@/pages/home'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const Dashboard = lazy(() => import('@/pages/dashboard'));
const AppCreate = lazy(() => import('@/pages/app/Create'));
const AppChat = lazy(() => import('@/pages/app/Chat'));
const Profile = lazy(() => import('@/pages/user/Profile'));
const UserManage = lazy(() => import('@/pages/admin/UserManage'));
const AppManage = lazy(() => import('@/pages/admin/AppManage'));

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Spin size="large" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const routes = [
  {
    element: <BasicLayout />,
    children: [
      {
        path: '/',
        element: (
          <SuspenseWrap>
            <Home />
          </SuspenseWrap>
        ),
      },
      {
        path: '/dashboard',
        element: (
          <RequireAuth>
            <SuspenseWrap>
              <Dashboard />
            </SuspenseWrap>
          </RequireAuth>
        ),
      },
      {
        path: '/app/create',
        element: (
          <RequireAuth>
            <SuspenseWrap>
              <AppCreate />
            </SuspenseWrap>
          </RequireAuth>
        ),
      },
      {
        path: '/user/profile',
        element: (
          <RequireAuth>
            <SuspenseWrap>
              <Profile />
            </SuspenseWrap>
          </RequireAuth>
        ),
      },
    ],
  },
  {
    element: <BlankLayout />,
    children: [
      {
        path: '/login',
        element: (
          <SuspenseWrap>
            <Login />
          </SuspenseWrap>
        ),
      },
      {
        path: '/register',
        element: (
          <SuspenseWrap>
            <Register />
          </SuspenseWrap>
        ),
      },
      {
        path: '/app/:id/chat',
        element: (
          <RequireAuth>
            <SuspenseWrap>
              <AppChat />
            </SuspenseWrap>
          </RequireAuth>
        ),
      },
    ],
  },
  {
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      {
        path: '/admin/users',
        element: (
          <SuspenseWrap>
            <UserManage />
          </SuspenseWrap>
        ),
      },
      {
        path: '/admin/apps',
        element: (
          <SuspenseWrap>
            <AppManage />
          </SuspenseWrap>
        ),
      },
    ],
  },
];
