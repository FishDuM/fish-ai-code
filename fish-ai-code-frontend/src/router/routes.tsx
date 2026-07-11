import BasicLayout from '@/layouts/BasicLayout';
import AdminLayout from '@/layouts/AdminLayout';
import BlankLayout from '@/layouts/BlankLayout';
import { RequireAuth } from './RequireAuth';
import { RequireAdmin } from './RequireAdmin';
import { SuspenseWrap } from './SuspenseWrap';
import {
  Home,
  Login,
  Register,
  Dashboard,
  AppChat,
  Profile,
  UserManage,
  AppManage,
  ChatManage,
} from './lazyModules';

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
      {
        path: '/admin/chatHistory',
        element: (
          <SuspenseWrap>
            <ChatManage />
          </SuspenseWrap>
        ),
      },
    ],
  },
];
