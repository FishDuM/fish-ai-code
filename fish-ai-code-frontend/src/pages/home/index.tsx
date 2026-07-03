import { useState, useEffect } from 'react';
import { Row, Col, Typography, Button, Pagination, Space, Empty, App } from 'antd';
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
  const { message } = App.useApp();
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
      .catch(() => {
        message.error('加载精选应用失败');
      })
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
          padding: '56px 0 40px',
          marginBottom: 40,
        }}
      >
        <Title
          level={1}
          style={{
            marginBottom: 12,
            fontSize: 40,
            fontWeight: 700,
            color: '#111925',
            letterSpacing: '-0.02em',
          }}
        >
          <span>用 AI 一句话</span>
          <br />
          <span className="text-gradient">生成网站</span>
        </Title>
        <Paragraph
          style={{
            fontSize: 16,
            color: 'rgba(17,25,37,0.65)',
            marginBottom: 32,
            maxWidth: 480,
            margin: '0 auto 32px',
            lineHeight: 1.6,
          }}
        >
          描述你想要的网站，AI 帮你实时生成代码并预览
        </Paragraph>
        <Button
          className="btn-gradient"
          size="large"
          icon={<RocketOutlined />}
          onClick={() => navigate(loginUser ? '/app/create' : '/register')}
          style={{ height: 44, paddingInline: 28, fontSize: 15, fontWeight: 600 }}
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
