import { useState } from 'react';
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

export default function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, logout } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const navItems = [
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
  ];

  const userMenuItems = [
    { key: 'profile', label: '个人资料', icon: <UserOutlined /> },
    ...(loginUser?.userRole === USER_ROLES.ADMIN
      ? [{ key: 'admin', label: '管理后台', icon: <SettingOutlined /> }]
      : []),
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
  ];

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'profile') navigate('/user/profile');
    else if (key === 'admin') navigate('/admin/users');
    else if (key === 'logout') handleLogout();
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{ fontSize: 18, fontWeight: 700, color: '#fff', cursor: 'pointer', marginRight: 32 }}
            onClick={() => navigate('/')}
          >
            🐟 {APP_NAME}
          </div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={navItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 0, background: 'transparent' }}
          />
        </div>

        <div>
          {loginUser ? (
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <Space style={{ cursor: 'pointer', color: '#fff' }}>
                <Avatar
                  size="small"
                  src={loginUser.userAvatar}
                  icon={!loginUser.userAvatar ? <UserOutlined /> : undefined}
                />
                <span>{loginUser.userName || loginUser.userAccount}</span>
              </Space>
            </Dropdown>
          ) : (
            <Space>
              <Button type="text" style={{ color: '#fff' }} onClick={() => navigate('/login')}>
                登录
              </Button>
              <Button type="primary" onClick={() => navigate('/register')}>
                注册
              </Button>
            </Space>
          )}
        </div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', color: '#999' }}>
        {APP_NAME} ©{new Date().getFullYear()} - AI 驱动的网站生成平台
      </Footer>
    </Layout>
  );
}
