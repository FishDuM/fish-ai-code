import { useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { Layout, Menu, Dropdown, Avatar, Space, Button } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { APP_NAME, USER_ROLES } from '@/constants';
import logoUrl from '@/assets/logo.png';

const { Header, Content, Footer } = Layout;

// 当前年份提到模块级常量，避免每次 render 重新计算并产生新的 string
const CURRENT_YEAR = new Date().getFullYear();

export default function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, logout } = useAuthStore();
  const isHomePage = location.pathname === '/';

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
      { key: '/', label: '首页' },
      ...(loginUser
        ? [
            { key: '/dashboard', label: '我的应用' },
            { key: '/app/create', label: '创建应用' },
          ]
        : []),
      ...(loginUser?.userRole === USER_ROLES.ADMIN
        ? [{ key: '/admin/users', label: '管理后台' }]
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
    <Layout className="app-shell">
      <Header
        className="app-header"
      >
        <div className="app-header-main">
          <div
            className="brand-logo"
            onClick={() => navigate('/')}
          >
            <img src={logoUrl} alt={APP_NAME} className="brand-logo-image" />
            <span className="brand-logo-text">{APP_NAME}</span>
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={navItems}
            onClick={({ key }) => navigate(key)}
            className="app-nav-menu"
          />
        </div>

        <div className="app-header-user">
          {loginUser ? (
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
              <Space className="user-pill">
                <Avatar
                  size="small"
                  src={loginUser.userAvatar}
                  icon={!loginUser.userAvatar ? <UserOutlined /> : undefined}
                  className="user-pill-avatar"
                />
                <span className="user-pill-name">{loginUser.userName || loginUser.userAccount}</span>
              </Space>
            </Dropdown>
          ) : (
            <Space size={10}>
              <Button type="text" className="header-auth-button" onClick={() => navigate('/login')}>
                登录
              </Button>
              <Button
                type="text"
                className="header-auth-button"
                onClick={() => navigate('/register')}
              >
                注册
              </Button>
            </Space>
          )}
        </div>
      </Header>

      <Content
        className={isHomePage ? 'app-content app-content-home' : 'app-content'}
        style={{
          padding: isHomePage ? 0 : '24px',
          maxWidth: isHomePage ? 'none' : 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Outlet />
      </Content>

      <Footer className="app-footer">
        {APP_NAME} ©{CURRENT_YEAR} — AI 驱动的网站生成平台
      </Footer>
    </Layout>
  );
}
