import { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Layout, Menu, Button, Avatar, Space, Dropdown, App } from 'antd';
import {
  UserOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { APP_NAME } from '@/constants';
import logoUrl from '@/assets/logo.png';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, logout } = useAuthStore();
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      message.error('退出登录失败');
    } finally {
      navigate('/login');
    }
  }, [logout, message, navigate]);

  // 这些菜单项完全不依赖 props，empty deps 即可稳定引用
  const siderItems = useMemo(
    () => [
      { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
      { key: '/admin/apps', icon: <AppstoreOutlined />, label: '应用管理' },
      { key: '/admin/chatHistory', icon: <MessageOutlined />, label: '对话管理' },
    ],
    []
  );

  const userMenuItems = useMemo(
    () => [
      { key: 'home', label: '返回前台', icon: <HomeOutlined /> },
      { type: 'divider' as const },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
    ],
    []
  );

  const handleUserMenuClick = useCallback(
    ({ key }: { key: string }) => {
      if (key === 'home') navigate('/');
      else if (key === 'logout') handleLogout();
    },
    [navigate, handleLogout]
  );

  return (
    <Layout className="admin-shell">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="light"
        className="admin-sider"
      >
        <div
          // 样式依赖 collapsed（响应式字号），保留 inline
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#111925',
            fontWeight: 700,
            fontSize: collapsed ? 16 : 18,
            cursor: 'pointer',
          }}
          onClick={() => navigate('/')}
        >
          {collapsed ? (
            <img src={logoUrl} alt={APP_NAME} className="admin-logo-image" />
          ) : (
            <span className="admin-logo-expanded">
              <img src={logoUrl} alt={APP_NAME} className="admin-logo-image" />
              <span>{APP_NAME}</span>
            </span>
          )}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={siderItems}
          onClick={({ key }) => navigate(key)}
          className="admin-menu"
        />
      </Sider>

      <Layout>
        <Header className="admin-header">
          <Space className="admin-header-actions">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? '展开菜单' : '收起菜单'}
            />
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              style={{ color: 'rgba(17,25,37,0.65)' }}
            >
              返回前台
            </Button>
          </Space>

          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
            <Space className="admin-header-user" style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{loginUser?.userName || loginUser?.userAccount}</span>
            </Space>
          </Dropdown>
        </Header>

        <Content className="admin-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
