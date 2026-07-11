import { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Button, Pagination, Empty, Modal, Input, App, Typography, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import AppCard from '@/components/AppCard';
import SearchInput from '@/components/SearchInput';
import { listMyApps, updateMyApp, deleteMyApp } from '@/api/app';
import { useTitle } from '@/hooks/useTitle';
import type { AppVO, AppQueryRequest } from '@/api/types';

const { Title } = Typography;

export default function Dashboard() {
  useTitle('我的应用');
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [apps, setApps] = useState<AppVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AppQueryRequest>({ pageNum: 1, pageSize: 12 });
  const [editApp, setEditApp] = useState<AppVO | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // 单调递增的 fetch id：与 home 页同样的 stale 防护。dashboard 这里尤其重要，
  // 因为 fetchApps 既被 effect 调用、也被编辑/删除的事件回调调用，叠加在一起
  // 时没有这层保护就很容易出现"编辑完成后旧分页数据覆盖新分页数据"。
  const fetchIdRef = useRef(0);

  const fetchApps = useCallback(() => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    listMyApps(query)
      .then((res) => {
        if (myId !== fetchIdRef.current) return;
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {
        if (myId !== fetchIdRef.current) return;
        message.error('加载应用列表失败');
      })
      .finally(() => {
        if (myId !== fetchIdRef.current) return;
        setLoading(false);
      });
  }, [query, message]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleSearch = (appName: string) => {
    setQuery((prev) => ({ ...prev, appName: appName || undefined, pageNum: 1 }));
  };

  // useCallback 包一下 AppCard 传进来的回调，配合 React.memo 风格的子组件
  // 可以减少无谓的列表项重渲染。这里主要是为 handleDelete 用（Modal.confirm
  // 闭包里需要稳定引用以便 latest fetchApps 能被取到）。
  const handleEdit = useCallback((app: AppVO) => {
    setEditApp(app);
    setEditName(app.appName || '');
  }, []);

  const handleEditOk = async () => {
    if (!editApp || !editName.trim()) return;
    setEditLoading(true);
    try {
      await updateMyApp({ id: editApp.id, appName: editName.trim() });
      message.success('重命名成功');
      setEditApp(null);
      // 这里 fetchApps() 同样会被 fetchIdRef 保护：若用户在编辑过程中已经
      // 触发了翻页/搜索，最新的 fetch 不会被这次编辑刷新覆盖。
      fetchApps();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = useCallback((app: AppVO) => {
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
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  }, [fetchApps]);

  return (
    <div className="page-surface">
      <div className="page-toolbar">
        <div>
          <Title level={3} className="page-title">我的应用</Title>
          <div className="page-subtitle">管理你创建的应用和网站</div>
        </div>
        <Space wrap>
          <SearchInput onSearch={handleSearch} placeholder="搜索应用..." style={{ width: 200 }} />
          <Button className="btn-gradient" icon={<PlusOutlined />} onClick={() => navigate('/')}>
            创建应用
          </Button>
        </Space>
      </div>

      <div className="glass-panel">
        {!loading && apps.length === 0 ? (
        <Empty description="你还没有创建应用" className="page-empty">
          <Button type="primary" onClick={() => navigate('/')}>
            创建第一个应用
          </Button>
        </Empty>
      ) : !loading && (
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
      </div>

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
