import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Space, Tag, App, Typography } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { adminListApps, adminUpdateApp, adminDeleteApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';
import type { App, AdminAppQueryRequest, AdminAppUpdateRequest } from '@/api/types';

const { Title } = Typography;

export default function AppManage() {
  useTitle('应用管理');
  const { message } = App.useApp();
  const [apps, setApps] = useState<App[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AdminAppQueryRequest>({ pageNum: 1, pageSize: 10 });
  const [editApp, setEditApp] = useState<App | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchApps = () => {
    setLoading(true);
    adminListApps(query)
      .then((res) => {
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {
        message.error('加载应用列表失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchApps();
  }, [query]);

  const handleEdit = (app: App) => {
    setEditApp(app);
    form.setFieldsValue({
      appName: app.appName,
      cover: app.cover,
      priority: app.priority,
    });
  };

  const handleEditOk = async () => {
    if (!editApp) return;
    setEditLoading(true);
    try {
      const values = await form.validateFields();
      await adminUpdateApp({ id: editApp.id, ...values });
      message.success('更新成功');
      setEditApp(null);
      fetchApps();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (app: App) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除应用「${app.appName || '未命名'}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminDeleteApp(app.id);
          message.success('删除成功');
          fetchApps();
        } catch (err: any) {
          message.error(err.message || '删除失败');
        }
      },
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 120,
      ellipsis: true,
    },
    {
      title: '应用名',
      dataIndex: 'appName',
      render: (name: string | null) => name || '-',
    },
    {
      title: '代码类型',
      dataIndex: 'codeGenType',
      width: 120,
      render: (type: string | null) => (
        <Tag color={type === 'multi_file' ? 'cyan' : 'green'}>
          {type === 'multi_file' ? '多文件' : 'HTML'}
        </Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p: number | null) => (
        <Tag color={p === 99 ? 'gold' : 'default'}>{p ?? 0}</Tag>
      ),
    },
    {
      title: '用户ID',
      dataIndex: 'userId',
      width: 120,
      ellipsis: true,
    },
    {
      title: '部署Key',
      dataIndex: 'deployKey',
      width: 140,
      ellipsis: true,
      render: (key: string | null) => key || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: App) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>应用管理</Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索应用名"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, appName: v || undefined, pageNum: 1 }))}
          style={{ width: 200 }}
        />
        <Input.Search
          placeholder="用户ID"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, userId: v || undefined, pageNum: 1 }))}
          style={{ width: 160 }}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={apps}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: query.pageNum,
          pageSize: query.pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, pageNum: page, pageSize })),
        }}
      />

      <Modal
        title="编辑应用"
        open={!!editApp}
        onOk={handleEditOk}
        onCancel={() => setEditApp(null)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="appName" label="应用名">
            <Input placeholder="应用名称" />
          </Form.Item>
          <Form.Item name="cover" label="封面 URL">
            <Input placeholder="封面图片链接" />
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <InputNumber min={0} max={99} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
