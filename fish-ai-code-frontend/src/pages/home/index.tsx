import { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Typography, Button, Pagination, Empty, App, Input } from 'antd';
import { ArrowRightOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router';
import AppCard from '@/components/AppCard';
import { createApp, listFeaturedApps } from '@/api/app';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';
import logoUrl from '@/assets/logo.png';
import type { AppVO, AppQueryRequest } from '@/api/types';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const promptExamples = [
  '使用 Fish AI Code 创建一个数据分析看板，',
  '帮我生成一个暗黑风电商落地页，',
  '做一个企业官网，包含产品、案例和联系表单，',
  '创建一个活动报名页面，带倒计时和报名表单，',
  '生成一个适合 SaaS 产品的官网首屏和价格页，',
  '做一个适合运营团队使用的数据管理后台，',
  '创建一个带会员体系的内容社区首页，',
  '帮我搭建一个高级感作品集网站，',
];

const quickPrompts = [
  {
    label: '波普风电商页面',
    description: '撞色商品页',
    prompt:
      '创建一个波普艺术风格的电商首页，主视觉要有高饱和撞色、漫画网点纹理、夸张商品卡片和醒目的促销标题。页面包含顶部导航、首屏活动 Banner、限时折扣区、热门商品网格、品牌故事、用户评价和底部订阅模块。整体要年轻、有冲击力，按钮和卡片有轻微动效，移动端也要排版精致。',
  },
  {
    label: '企业网站',
    description: '官网与联系表单',
    prompt:
      '创建一个高级感企业官网，面向科技服务公司。页面包含顶部导航、首屏价值主张、核心服务、解决方案、客户案例、数据成就、合作客户 Logo 墙、团队介绍、联系表单和页脚。设计风格要专业、简洁、有国际化质感，使用留白、细线、柔和阴影和克制的品牌色，支持移动端响应式。',
  },
  {
    label: '电商运营后台',
    description: '数据与订单看板',
    prompt:
      '创建一个电商运营后台管理系统首页，适合运营人员高频使用。页面包含侧边栏导航、顶部用户区域、销售额/订单量/转化率/库存预警数据卡片、销售趋势图、订单状态分布、热销商品排行、待处理事项、快捷操作和最近订单表格。整体要信息密度高但清晰，视觉专业，适合桌面端后台场景。',
  },
  {
    label: '暗黑话题社区',
    description: '话题流与趋势榜',
    prompt:
      '创建一个暗黑风格话题社区首页，面向年轻用户讨论科技、游戏和创意项目。页面包含沉浸式顶部导航、热门话题推荐、帖子信息流、精选讨论卡片、侧边趋势榜、活跃用户、发布入口和社区规则提示。视觉要有深色背景、霓虹点缀、玻璃拟态卡片和流畅 hover 效果，同时保证文字可读性。',
  },
];

export default function Home() {
  useTitle('首页');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginUser } = useAuthStore();
  const { message } = App.useApp();
  const [apps, setApps] = useState<AppVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AppQueryRequest>({ pageNum: 1, pageSize: 12 });
  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') || '');
  const [creating, setCreating] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);

  // 单调递增的 fetch id：每次新请求自增；回调里只有 id 仍是最新值才 setState。
  // 快速切换搜索/分页或组件卸载时旧的响应不会用旧数据覆盖新结果，
  // 也不会在已卸载组件上 setState 触发警告。
  const fetchIdRef = useRef(0);

  const fetchApps = useCallback(() => {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    listFeaturedApps(query)
      .then((res) => {
        if (myId !== fetchIdRef.current) return;
        setApps(res.records);
        setTotal(res.totalRow);
      })
      .catch(() => {
        if (myId !== fetchIdRef.current) return;
        message.error('加载精选应用失败');
      })
      .finally(() => {
        // 注意：loading 也受 fetchId 保护，避免最后一次旧请求把 loading 关掉
        // 而新请求还在路上导致 UI 提前进入 "已加载" 状态。
        if (myId !== fetchIdRef.current) return;
        setLoading(false);
      });
  }, [query, message]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  useEffect(() => {
    if (prompt) return;
    const timer = window.setInterval(() => {
      setTypingIndex((prev) => (prev + 1) % promptExamples.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [prompt]);

  const handleSearch = (appName: string) => {
    setQuery((prev) => ({ ...prev, appName: appName || undefined, pageNum: 1 }));
  };

  const handleCreate = async () => {
    const initPrompt = prompt.trim();
    if (!initPrompt) {
      message.warning('请输入你想创建的应用描述');
      return;
    }
    if (!loginUser) {
      const redirect = `/?prompt=${encodeURIComponent(initPrompt)}`;
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    setCreating(true);
    try {
      const appId = await createApp({ initPrompt });
      message.success('应用创建成功');
      navigate(`/app/${appId}/chat`, { state: { autoSendInit: true } });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-soft-ball" />
        <div className="home-hero-inner">
          <Title level={1} className="home-title">
            一句话 <span className="home-logo-dot"><img src={logoUrl} alt="" /></span> 呈所想
          </Title>
          <Paragraph className="home-subtitle">与 AI 对话轻松创建应用和网站</Paragraph>

          <div className="home-prompt-panel">
            {!prompt && (
              <div className="home-typewriter" aria-hidden="true">
                <span key={typingIndex}>{promptExamples[typingIndex]}</span>
              </div>
            )}
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              autoSize={false}
              maxLength={2000}
              className="home-prompt-input"
              aria-label="描述你想创建的应用"
            />
            <div className="home-prompt-actions">
              <Button
                shape="circle"
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={handleCreate}
                loading={creating}
                disabled={creating}
                className="home-send-button"
                aria-label="开始创建"
              />
            </div>
          </div>

          <div className="home-example-tags">
            {quickPrompts.map((item) => (
              <button key={item.label} type="button" onClick={() => setPrompt(item.prompt)} className="home-example-card">
                <span className="home-example-title">{item.label}</span>
                <span className="home-example-desc">{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="home-gallery">
        <div className="home-gallery-header">
          <Title level={2} className="home-gallery-title">案例广场</Title>
        </div>

        <div className="home-filter-row">
          <Button shape="round" type="primary" className="home-filter-active">
            全部
          </Button>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索应用..."
            allowClear
            className="home-gallery-search"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {!loading && apps.length === 0 ? (
          <Empty description="暂无精选应用" className="home-empty" />
        ) : !loading && (
          <>
            <Row gutter={[24, 28]}>
              {apps.map((app) => (
                <Col key={app.id} xs={24} sm={12} lg={8} xl={6}>
                  <AppCard
                    app={app}
                    showActions={false}
                    onOpen={(a) => {
                      const chatPath = `/app/${a.id}/chat`;
                      if (!loginUser) {
                        navigate(`/login?redirect=${encodeURIComponent(chatPath)}`);
                        return;
                      }
                      if (loginUser.id === a.userId || loginUser.userRole === 'admin') {
                        navigate(chatPath);
                        return;
                      }
                      message.warning('只能打开自己创建的应用');
                    }}
                  />
                </Col>
              ))}
            </Row>
            {total > query.pageSize! && (
              <div className="home-pagination">
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
        {loading && (
          <div className="home-loading">
            <Text type="secondary">案例加载中...</Text>
          </div>
        )}
      </section>
    </div>
  );
}
