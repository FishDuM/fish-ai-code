import { useState } from 'react';
import { Card, Form, Input, Button, Radio, Typography, App } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router';
import { createApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function AppCreate() {
  useTitle('创建应用');
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const promptFromQuery = new URLSearchParams(location.search).get('prompt') || '';
  const initialPrompt =
    typeof location.state?.initPrompt === 'string' ? location.state.initPrompt : promptFromQuery;

  const handleSubmit = async (values: { initPrompt: string; appName?: string; codeGenType: string }) => {
    setLoading(true);
    try {
      const appId = await createApp({
        initPrompt: values.initPrompt,
        appName: values.appName || undefined,
        codeGenType: values.codeGenType,
      });
      message.success('应用创建成功');
      navigate(`/app/${appId}/chat`, { replace: true, state: { autoSendInit: true } });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-surface create-page">
      <div className="page-hero-heading">
        <Title level={2}>创建新应用</Title>
        <Paragraph>描述你想要的网站，AI 将为你生成代码</Paragraph>
      </div>

      <Card className="glass-card create-card">
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          initialValues={{ codeGenType: 'html', initPrompt: initialPrompt }}
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
              <Radio.Button value="vue_project">Vue 工程</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item>
            <Button className="btn-gradient" htmlType="submit" icon={<RocketOutlined />} loading={loading} block size="large">
              开始生成
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
