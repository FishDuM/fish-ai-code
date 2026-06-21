import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Avatar, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listUsers, updateUser, deleteUser } from '@/api/user';
import { useTitle } from '@/hooks/useTitle';
import type { UserVO, UserQueryRequest } from '@/api/types';

const { Title } = Typography;

export default function UserManage() {
  useTitle('用户管理');
  const [users, setUsers] = useState<UserVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<UserQueryRequest>({ pageNum: 1, pageSize: 10 });
  const [editUser, setEditUser] = useState<UserVO | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = () => {
    setLoading(true);
    listUsers(query)
      .then((res) => {
        setUsers(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [query]);

  const handleEdit = (user: UserVO) => {
    setEditUser(user);
    form.setFieldsValue({
      userName: user.userName,
      userRole: user.userRole,
    });
  };

  const handleEditOk = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const values = await form.validateFields();
      await updateUser({ id: editUser.id, ...values });
      message.success('更新成功');
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (user: UserVO) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除用户「${user.userName || user.userAccount}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteUser(user.id);
          message.success('删除成功');
          fetchUsers();
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
      title: '头像',
      dataIndex: 'userAvatar',
      width: 60,
      render: (url: string | null) => (
        <Avatar size="small" src={url} icon={<UserOutlined />} />
      ),
    },
    {
      title: '账号',
      dataIndex: 'userAccount',
    },
    {
      title: '昵称',
      dataIndex: 'userName',
      render: (name: string | null) => name || '-',
    },
    {
      title: '角色',
      dataIndex: 'userRole',
      width: 100,
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role === 'admin' ? '管理员' : '用户'}
        </Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createTime',
      width: 170,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: UserVO) => (
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
      <Title level={4} style={{ marginBottom: 16 }}>用户管理</Title>

      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索账号或昵称"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, userAccount: v || undefined, pageNum: 1 }))}
          style={{ width: 240 }}
        />
        <Select
          placeholder="角色筛选"
          allowClear
          style={{ width: 120 }}
          onChange={(v) => setQuery((prev) => ({ ...prev, userRole: v || undefined, pageNum: 1 }))}
          options={[
            { label: '用户', value: 'user' },
            { label: '管理员', value: 'admin' },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{
          current: query.pageNum,
          pageSize: query.pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, pageNum: page, pageSize })),
        }}
      />

      <Modal
        title="编辑用户"
        open={!!editUser}
        onOk={handleEditOk}
        onCancel={() => setEditUser(null)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="userName" label="昵称">
            <Input placeholder="用户昵称" />
          </Form.Item>
          <Form.Item name="userRole" label="角色">
            <Select
              options={[
                { label: '普通用户', value: 'user' },
                { label: '管理员', value: 'admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
