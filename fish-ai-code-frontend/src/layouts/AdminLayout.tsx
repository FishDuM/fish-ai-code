import { useState } from 'react';
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

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, logout } = useAuthStore();
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      message.error('退出登录失败');
    } finally {
      navigate('/login');
    }
  };

  const siderItems = [
    { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
    { key: '/admin/apps', icon: <AppstoreOutlined />, label: '应用管理' },
    { key: '/admin/chatHistory', icon: <MessageOutlined />, label: '对话管理' },
  ];

  const userMenuItems = [
    { key: 'home', label: '返回前台', icon: <HomeOutlined /> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
  ];

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'home') navigate('/');
    else if (key === 'logout') handleLogout();
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="dark"
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: collapsed ? 16 : 18,
            cursor: 'pointer',
          }}
          onClick={() => navigate('/')}
        >
          {collapsed ? '🐟' : <><span style={{ color: '#36D2BE' }}>🐟</span> {APP_NAME}</>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={siderItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(17,25,37,0.1)',
            height: 56,
            lineHeight: '56px',
          }}
        >
          <Space>
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
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{loginUser?.userName || loginUser?.userAccount}</span>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, border: '1px solid rgba(17,25,37,0.1)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
