import { useState, useEffect } from 'react';
import { Table, Input, Space, Tag, App, Typography } from 'antd';
import dayjs from 'dayjs';
import { adminListChatHistory } from '@/api/chatHistory';
import { useTitle } from '@/hooks/useTitle';
import type { ChatHistory, AdminChatHistoryQueryRequest } from '@/api/types';

const { Title } = Typography;
const { TextArea } = Input;

export default function ChatManage() {
  useTitle('对话管理');
  const { message } = App.useApp();
  const [records, setRecords] = useState<ChatHistory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AdminChatHistoryQueryRequest>({ pageNum: 1, pageSize: 10 });

  const fetchData = () => {
    setLoading(true);
    adminListChatHistory(query)
      .then((res) => {
        setRecords(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {
        message.error('加载对话历史失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [query]);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 120,
      ellipsis: true,
    },
    {
      title: '应用ID',
      dataIndex: 'appId',
      width: 120,
      ellipsis: true,
    },
    {
      title: '用户ID',
      dataIndex: 'userId',
      width: 120,
      ellipsis: true,
    },
    {
      title: '消息类型',
      dataIndex: 'messageType',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'user' ? 'blue' : 'green'}>
          {type === 'user' ? '用户' : 'AI'}
        </Tag>
      ),
    },
    {
      title: '消息内容',
      dataIndex: 'message',
      ellipsis: true,
      render: (text: string) => (
        <TextArea
          value={text}
          readOnly
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{ resize: 'none', background: 'transparent', border: 'none', padding: 0, cursor: 'default' }}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>对话管理</Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="应用ID"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, appId: v || undefined, pageNum: 1 }))}
          style={{ width: 160 }}
        />
        <Input.Search
          placeholder="用户ID"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, userId: v || undefined, pageNum: 1 }))}
          style={{ width: 160 }}
        />
        <Input.Search
          placeholder="消息类型 (user/ai)"
          allowClear
          onSearch={(v) => setQuery((prev) => ({ ...prev, messageType: v || undefined, pageNum: 1 }))}
          style={{ width: 180 }}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={records}
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{
          current: query.pageNum,
          pageSize: query.pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, pageNum: page, pageSize })),
        }}
      />
    </div>
  );
}
