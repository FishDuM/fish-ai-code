import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';
import logoUrl from '@/assets/logo.png';

const { Title, Text } = Typography;

export default function Register() {
  useTitle('注册');
  const navigate = useNavigate();
  const { register, isLoading } = useAuthStore();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { userAccount: string; userPassword: string; checkPassword: string }) => {
    try {
      await register(values.userAccount, values.userPassword, values.checkPassword);
      message.success('注册成功，请登录');
      navigate('/login', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '注册失败');
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" variant="borderless">
        <div className="auth-card-head">
          <img src={logoUrl} alt="Fish AI Code" className="auth-logo-image" />
          <Title level={3}>Fish AI Code</Title>
          <Text>创建你的账号</Text>
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

          <Form.Item
            name="checkPassword"
            dependencies={['userPassword']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('userPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>

          <Form.Item>
            <Button className="btn-gradient" htmlType="submit" block loading={isLoading} size="large">
              注册
            </Button>
          </Form.Item>
        </Form>

        <div className="auth-switch">
          <Text style={{ color: 'rgba(17,25,37,0.45)' }}>已有账号？</Text>{' '}
          <Link to="/login" style={{ color: '#36D2BE' }}>立即登录</Link>
        </div>
      </Card>
    </div>
  );
}
