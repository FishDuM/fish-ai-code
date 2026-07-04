import { useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Layout, Menu, Dropdown, Avatar, Space, Button } from 'antd';
import {
  HomeOutlined,
  AppstoreOutlined,
  PlusCircleOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { APP_NAME, USER_ROLES } from '@/constants';

const { Header, Content, Footer } = Layout;

// 当前年份提到模块级常量，避免每次 render 重新计算并产生新的 string
const CURRENT_YEAR = new Date().getFullYear();

export default function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, logout } = useAuthStore();

  // 用 useCallback 稳定回调引用，避免 antd Menu/Dropdown 的内部 memo 失效
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // 后端登出失败也强制跳登录页（本地状态已被 store 清空）
    }
    navigate('/login');
  }, [logout, navigate]);

  // 依赖只放真正用到的字段：loginUser 用于存在性判断，role 用于 admin 入口显隐
  const navItems = useMemo(
    () => [
      { key: '/', label: '首页', icon: <HomeOutlined /> },
      ...(loginUser
        ? [
            { key: '/dashboard', label: '我的应用', icon: <AppstoreOutlined /> },
            { key: '/app/create', label: '创建应用', icon: <PlusCircleOutlined /> },
          ]
        : []),
      ...(loginUser?.userRole === USER_ROLES.ADMIN
        ? [{ key: '/admin/users', label: '管理后台', icon: <SettingOutlined /> }]
        : []),
    ],
    [loginUser, loginUser?.userRole]
  );

  // 这个菜单只读 userRole 决定是否显示 admin 入口，deps 只放 role 即可更精准
  const userMenuItems = useMemo(
    () => [
      { key: 'profile', label: '个人资料', icon: <UserOutlined /> },
      ...(loginUser?.userRole === USER_ROLES.ADMIN
        ? [{ key: 'admin', label: '管理后台', icon: <SettingOutlined /> }]
        : []),
      { type: 'divider' as const },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
    ],
    [loginUser?.userRole]
  );

  const handleUserMenuClick = useCallback(
    ({ key }: { key: string }) => {
      if (key === 'profile') navigate('/user/profile');
      else if (key === 'admin') navigate('/admin/users');
      else if (key === 'logout') handleLogout();
    },
    [navigate, handleLogout]
  );

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: '#fff',
          borderBottom: '1px solid rgba(17,25,37,0.1)',
          height: 56,
          lineHeight: '56px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{ fontSize: 18, fontWeight: 700, color: '#111925', cursor: 'pointer', marginRight: 32, display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => navigate('/')}
          >
            <span style={{ color: '#36D2BE', fontSize: 22 }}>🐟</span>
            <span>{APP_NAME}</span>
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={navItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 0, background: 'transparent', borderBottom: 'none' }}
          />
        </div>

        <div>
          {loginUser ? (
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <Space style={{ cursor: 'pointer', color: '#111925' }}>
                <Avatar
                  size="small"
                  src={loginUser.userAvatar}
                  icon={!loginUser.userAvatar ? <UserOutlined /> : undefined}
                  style={{ backgroundColor: 'rgba(17,25,37,0.15)' }}
                />
                <span style={{ fontSize: 14 }}>{loginUser.userName || loginUser.userAccount}</span>
              </Space>
            </Dropdown>
          ) : (
            <Space>
              <Button type="text" style={{ color: 'rgba(17,25,37,0.65)' }} onClick={() => navigate('/login')}>
                登录
              </Button>
              <Button
                className="btn-gradient"
                onClick={() => navigate('/register')}
              >
                注册
              </Button>
            </Space>
          )}
        </div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', color: 'rgba(17,25,37,0.45)', borderTop: '1px solid rgba(17,25,37,0.1)' }}>
        {APP_NAME} ©{CURRENT_YEAR} — AI 驱动的网站生成平台
      </Footer>
    </Layout>
  );
}
