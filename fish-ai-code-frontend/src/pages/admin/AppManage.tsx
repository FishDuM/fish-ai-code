import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, App, Typography } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { adminListApps, adminUpdateApp, adminDeleteApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';
import type { App as AppType, AdminAppQueryRequest } from '@/api/types';

const { Title } = Typography;
const FEATURED_PRIORITY = 99;
const NORMAL_PRIORITY = 0;

type FeaturedStatus = 'featured' | 'normal';

function priorityToFeaturedStatus(priority: number | null | undefined): FeaturedStatus {
  return priority === FEATURED_PRIORITY ? 'featured' : 'normal';
}

function featuredStatusToPriority(status: FeaturedStatus): number {
  return status === 'featured' ? FEATURED_PRIORITY : NORMAL_PRIORITY;
}

export default function AppManage() {
  useTitle('应用管理');
  const { message } = App.useApp();
  const [apps, setApps] = useState<AppType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AdminAppQueryRequest>({ pageNum: 1, pageSize: 10 });
  const [editApp, setEditApp] = useState<AppType | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();
  const fetchIdRef = useRef(0);

  const fetchApps = useCallback(() => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    adminListApps(query)
      .then((res) => {
        if (fetchId !== fetchIdRef.current) return;
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {
        if (fetchId !== fetchIdRef.current) return;
        message.error('加载应用列表失败');
      })
      .finally(() => {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
        }
      });
  }, [query, message]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleEdit = (app: AppType) => {
    setEditApp(app);
    form.setFieldsValue({
      appName: app.appName,
      cover: app.cover,
      featuredStatus: priorityToFeaturedStatus(app.priority),
    });
  };

  const handleEditOk = async () => {
    if (!editApp) return;
    setEditLoading(true);
    try {
      const values = await form.validateFields();
      const { featuredStatus, ...rest } = values;
      await adminUpdateApp({
        id: editApp.id,
        ...rest,
        priority: featuredStatusToPriority(featuredStatus),
      });
      message.success('更新成功');
      setEditApp(null);
      fetchApps();
    } catch (err) {
      if (err instanceof Error && err.message) message.error(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (app: AppType) => {
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
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
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
      width: 180,
      ellipsis: true,
      render: (name: string | null) => name || '-',
    },
    {
      title: '代码类型',
      dataIndex: 'codeGenType',
      width: 120,
      render: (type: string | null) => (
        <Tag color={type === 'multi_file' ? 'default' : type === 'vue_project' ? 'lime' : 'green'}>
          {type === 'multi_file' ? '多文件' : type === 'vue_project' ? 'Vue 工程' : 'HTML'}
        </Tag>
      ),
    },
    {
      title: '精选',
      dataIndex: 'priority',
      width: 90,
      render: (p: number | null) => (
        <Tag color={p === FEATURED_PRIORITY ? 'gold' : 'default'}>
          {p === FEATURED_PRIORITY ? '精选' : '非精选'}
        </Tag>
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
      width: 180,
      className: 'admin-action-cell',
      render: (_: unknown, record: AppType) => (
        <Space size={4} wrap={false}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <div className="page-toolbar">
        <div>
          <Title level={3} className="page-title">应用管理</Title>
          <div className="page-subtitle">查看、筛选和维护平台应用</div>
        </div>
      </div>

      <Space className="admin-filter-bar" wrap>
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

      <div className="glass-panel admin-table-panel">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={apps}
          loading={loading}
          scroll={{ x: 1230 }}
          pagination={{
            current: query.pageNum,
            pageSize: query.pageSize,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, pageNum: page, pageSize })),
          }}
        />
      </div>

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
          <Form.Item
            name="appName"
            label="应用名"
            rules={[{ required: true, whitespace: true, message: '请输入应用名' }]}
          >
            <Input placeholder="应用名称" />
          </Form.Item>
          <Form.Item name="cover" label="封面 URL">
            <Input placeholder="封面图片链接" />
          </Form.Item>
          <Form.Item
            name="featuredStatus"
            label="精选状态"
            rules={[{ required: true, message: '请选择精选状态' }]}
          >
            <Select
              options={[
                { label: '精选', value: 'featured' },
                { label: '非精选', value: 'normal' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
