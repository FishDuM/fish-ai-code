import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';
import { getCaptcha } from '@/api/user';
import logoUrl from '@/assets/logo.png';
import { useCallback, useEffect, useState } from 'react';

const { Title, Text } = Typography;

export default function Register() {
  useTitle('注册');
  const navigate = useNavigate();
  const { register, isLoading } = useAuthStore();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  // 当前验证码：captchaId 提交注册时携带，imgBase64 用于展示图片
  const [captcha, setCaptcha] = useState<{ captchaId: string; imgBase64: string } | null>(null);

  // 获取/刷新验证码（答案由后端存入 Redis，注册时携带 captchaId + captchaCode 校验）
  const refreshCaptcha = useCallback(() => {
    getCaptcha()
      .then((data) => {
        setCaptcha(data);
        form.setFieldValue('captchaCode', '');
      })
      .catch(() => {
        // 加载失败保留旧图，不打断用户输入
      });
  }, [form]);

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  const handleSubmit = async (values: {
    userAccount: string;
    userPassword: string;
    checkPassword: string;
    captchaCode: string;
  }) => {
    try {
      await register(values.userAccount, values.userPassword, values.checkPassword, captcha?.captchaId ?? '', values.captchaCode);
      message.success('注册成功，请登录');
      navigate('/login', { replace: true });
    } catch (err) {
      // 验证码 5 分钟内可重复使用，失败（账号重复等）不会使其失效，
      // 保留当前验证码，用户可直接重试；点击图片可手动刷新
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
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>

          <Form.Item name="captchaCode" rules={[{ required: true, message: '请输入验证码' }]}>
            <div className="auth-captcha-row">
              <Input
                prefix={<SafetyCertificateOutlined />}
                placeholder="验证码"
                maxLength={4}
                autoComplete="off"
                className="auth-captcha-input"
              />
              {captcha ? (
                <img
                  src={captcha.imgBase64}
                  alt="验证码"
                  title="看不清？点击图片刷新"
                  className="auth-captcha-img"
                  onClick={refreshCaptcha}
                />
              ) : (
                <div className="auth-captcha-img auth-captcha-placeholder" onClick={refreshCaptcha}>
                  点击加载验证码
                </div>
              )}
            </div>
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
