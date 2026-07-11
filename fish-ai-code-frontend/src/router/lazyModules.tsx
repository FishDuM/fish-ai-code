import { lazy } from 'react';

// Centralised lazy page imports. Keeping these in their own file means
// `routes.tsx` is a pure config module (only exports `routes`), so React
// Fast Refresh doesn't complain about non-component exports.
export const Home = lazy(() => import('@/pages/home'));
export const Login = lazy(() => import('@/pages/auth/Login'));
export const Register = lazy(() => import('@/pages/auth/Register'));
export const Dashboard = lazy(() => import('@/pages/dashboard'));
export const AppChat = lazy(() => import('@/pages/app/Chat'));
export const Profile = lazy(() => import('@/pages/user/Profile'));
export const UserManage = lazy(() => import('@/pages/admin/UserManage'));
export const AppManage = lazy(() => import('@/pages/admin/AppManage'));
export const ChatManage = lazy(() => import('@/pages/admin/ChatManage'));
