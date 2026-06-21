import { useState, useEffect } from 'react';
import { Row, Col, Typography, Button, Pagination, Space, Empty } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import AppCard from '@/components/AppCard';
import SearchInput from '@/components/SearchInput';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { listFeaturedApps } from '@/api/app';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';
import type { AppVO, AppQueryRequest } from '@/api/types';

const { Title, Paragraph } = Typography;

export default function Home() {
  useTitle('首页');
  const navigate = useNavigate();
  const { loginUser } = useAuthStore();
  const [apps, setApps] = useState<AppVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AppQueryRequest>({ pageNum: 1, pageSize: 12 });

  useEffect(() => {
    setLoading(true);
    listFeaturedApps(query)
      .then((res) => {
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  const handleSearch = (appName: string) => {
    setQuery((prev) => ({ ...prev, appName: appName || undefined, pageNum: 1 }));
  };

  return (
    <div>
      {/* Hero */}
      <div
        style={{
          textAlign: 'center',
          padding: '48px 0 32px',
          background: 'linear-gradient(135deg, #667eea20 0%, #764ba220 100%)',
          borderRadius: 16,
          marginBottom: 32,
        }}
      >
        <Title level={2} style={{ marginBottom: 8 }}>
          🐟 用 AI 一句话生成网站
        </Title>
        <Paragraph style={{ fontSize: 16, color: '#666', marginBottom: 24 }}>
          描述你想要的网站，AI 帮你实时生成代码并预览
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          onClick={() => navigate(loginUser ? '/app/create' : '/register')}
        >
          {loginUser ? '开始创建' : '免费注册'}
        </Button>
      </div>

      {/* Search + Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>精选应用</Title>
        <SearchInput onSearch={handleSearch} placeholder="搜索应用..." style={{ width: 240 }} />
      </div>

      {/* Grid */}
      {loading ? (
        <LoadingSkeleton count={8} />
      ) : apps.length === 0 ? (
        <Empty description="暂无精选应用" />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {apps.map((app) => (
              <Col key={app.id} xs={24} sm={12} md={8} lg={6}>
                <AppCard
                  app={app}
                  showActions={false}
                  onOpen={(a) => navigate(loginUser ? `/app/${a.id}/chat` : `/login?redirect=${encodeURIComponent(`/app/${a.id}/chat`)}`)}
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
  );
}
