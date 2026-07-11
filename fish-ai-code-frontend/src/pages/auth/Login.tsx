import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';
import logoUrl from '@/assets/logo.png';

const { Title, Text } = Typography;

export default function Login() {
  useTitle('登录');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { userAccount: string; userPassword: string }) => {
    try {
      await login(values.userAccount, values.userPassword);
      message.success('登录成功');
      // Only allow same-origin path redirects to prevent open-redirect abuse.
      // /login?redirect=https://evil.com must NOT bounce the user off-site
      // after a successful login. Anything that isn't a leading "/" (or that
      // starts with "//", which the URL parser treats as a protocol-relative
      // external URL) falls back to a safe in-app destination.
      const rawRedirect = searchParams.get('redirect');
      const safeRedirect =
        rawRedirect && /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : '/dashboard';
      navigate(safeRedirect, { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败');
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" variant="borderless">
        <div className="auth-card-head">
          <img src={logoUrl} alt="Fish AI Code" className="auth-logo-image" />
          <Title level={3}>Fish AI Code</Title>
          <Text>AI 驱动的网站生成平台</Text>
        </div>

        <Form form={form} onFinish={handleSubmit} size="large" autoComplete="off">
          <Form.Item
            name="userAccount"
            rules={[
              { required: true, message: '请输入账号' },
              { min: 4, max: 15, message: '账号长度需在 4-15 个字符之间' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>

          <Form.Item
            name="userPassword"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, max: 16, message: '密码长度需在 8-16 个字符之间' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button className="btn-gradient" htmlType="submit" block loading={isLoading} size="large">
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className="auth-switch">
          <Text style={{ color: 'rgba(17,25,37,0.45)' }}>还没有账号？</Text>{' '}
          <Link to="/register" style={{ color: '#36D2BE' }}>立即注册</Link>
        </div>
      </Card>
    </div>
  );
}
