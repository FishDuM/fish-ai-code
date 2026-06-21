import { useState } from 'react';
import { Card, Form, Input, Button, Radio, Typography, message } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { createApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function AppCreate() {
  useTitle('创建应用');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: { initPrompt: string; appName?: string; codeGenType: string }) => {
    setLoading(true);
    try {
      const appId = await createApp({
        initPrompt: values.initPrompt,
        appName: values.appName || undefined,
        codeGenType: values.codeGenType,
      });
      message.success('应用创建成功');
      navigate(`/app/${appId}/chat`, { replace: true });
    } catch (err: any) {
      message.error(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Title level={3}>✨ 创建新应用</Title>
        <Paragraph type="secondary">描述你想要的网站，AI 将为你生成代码</Paragraph>
      </div>

      <Card>
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          initialValues={{ codeGenType: 'html' }}
        >
          <Form.Item
            name="initPrompt"
            label="描述你想要的网站"
            rules={[
              { required: true, message: '请输入提示词' },
              { max: 10000, message: '提示词最多 10000 个字符' },
            ]}
          >
            <TextArea
              rows={6}
              placeholder="例如：帮我创建一个个人博客网站，包含首页文章列表、关于我页面，采用简洁现代的设计风格，深蓝色主题..."
              showCount
              maxLength={10000}
            />
          </Form.Item>

          <Form.Item name="appName" label="应用名称（可选）">
            <Input placeholder="给你的应用起个名字" maxLength={50} />
          </Form.Item>

          <Form.Item name="codeGenType" label="代码生成模式">
            <Radio.Group>
              <Radio.Button value="html">单文件 HTML</Radio.Button>
              <Radio.Button value="multi_file">多文件（HTML + CSS + JS）</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<RocketOutlined />} loading={loading} block size="large">
              开始生成
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
