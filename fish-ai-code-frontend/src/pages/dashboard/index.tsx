import { useState, useEffect } from 'react';
import { Row, Col, Button, Pagination, Empty, Modal, Input, message, Typography, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import AppCard from '@/components/AppCard';
import SearchInput from '@/components/SearchInput';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { listMyApps, updateMyApp, deleteMyApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';
import type { AppVO, AppQueryRequest } from '@/api/types';

const { Title } = Typography;

export default function Dashboard() {
  useTitle('我的应用');
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AppQueryRequest>({ pageNum: 1, pageSize: 12 });
  const [editApp, setEditApp] = useState<AppVO | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fetchApps = () => {
    setLoading(true);
    listMyApps(query)
      .then((res) => {
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchApps();
  }, [query]);

  const handleSearch = (appName: string) => {
    setQuery((prev) => ({ ...prev, appName: appName || undefined, pageNum: 1 }));
  };

  const handleEdit = (app: AppVO) => {
    setEditApp(app);
    setEditName(app.appName || '');
  };

  const handleEditOk = async () => {
    if (!editApp || !editName.trim()) return;
    setEditLoading(true);
    try {
      await updateMyApp({ id: editApp.id, appName: editName.trim() });
      message.success('重命名成功');
      setEditApp(null);
      fetchApps();
    } catch (err: any) {
      message.error(err.message || '操作失败');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (app: AppVO) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除应用「${app.appName || '未命名'}」吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteMyApp(app.id);
          message.success('删除成功');
          fetchApps();
        } catch (err: any) {
          message.error(err.message || '删除失败');
        }
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>我的应用</Title>
        <Space>
          <SearchInput onSearch={handleSearch} placeholder="搜索应用..." style={{ width: 200 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/create')}>
            创建应用
          </Button>
        </Space>
      </div>

      {loading ? (
        <LoadingSkeleton count={6} />
      ) : apps.length === 0 ? (
        <Empty description="你还没有创建应用">
          <Button type="primary" onClick={() => navigate('/app/create')}>
            创建第一个应用
          </Button>
        </Empty>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {apps.map((app) => (
              <Col key={app.id} xs={24} sm={12} md={8} lg={6}>
                <AppCard
                  app={app}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onOpen={(a) => navigate(`/app/${a.id}/chat`)}
                />
              </Col>
            ))}
          </Row>
          {total > query.pageSize! && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Pagination
                current={query.pageNum}
                pageSize={query.pageSize}
                total={total}
                onChange={(page) => setQuery((prev) => ({ ...prev, pageNum: page }))}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}

      <Modal
        title="重命名应用"
        open={!!editApp}
        onOk={handleEditOk}
        onCancel={() => setEditApp(null)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
      >
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="应用名称"
          maxLength={50}
          onPressEnter={handleEditOk}
        />
      </Modal>
    </div>
  );
}
