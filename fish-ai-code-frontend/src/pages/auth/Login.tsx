import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(17,25,37,0.02)',
      }}
    >
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0px 4px 20px rgba(17,25,37,0.08)' }} variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🐟</div>
          <Title level={3} style={{ marginBottom: 4, color: '#111925' }}>Fish AI Code</Title>
          <Text style={{ color: 'rgba(17,25,37,0.65)' }}>AI 驱动的网站生成平台</Text>
        </div>

        <Form form={form} onFinish={handleSubmit} size="large" autoComplete="off">
          <Form.Item
            name="userAccount"
            rules={[
              { required: true, message: '请输入账号' },
              { min: 4, message: '账号至少 4 个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="账号" />
          </Form.Item>

          <Form.Item
            name="userPassword"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 个字符' },
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

        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: 'rgba(17,25,37,0.45)' }}>还没有账号？</Text>{' '}
          <Link to="/register" style={{ color: '#36D2BE' }}>立即注册</Link>
        </div>
      </Card>
    </div>
  );
}
