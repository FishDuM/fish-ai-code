import { Skeleton } from 'antd';

interface PageSkeletonProps {
  type?: 'default' | 'card' | 'chat';
}

export default function PageSkeleton({ type = 'default' }: PageSkeletonProps) {
  if (type === 'card') {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Skeleton.Input active size="large" style={{ width: 200, height: 32 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ border: '1px solid rgba(17,25,37,0.1)', borderRadius: 8, overflow: 'hidden' }}>
              <Skeleton.Image active style={{ width: '100%', height: 160, borderRadius: 0 }} />
              <div style={{ padding: 16 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'chat') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, borderBottom: '1px solid rgba(17,25,37,0.1)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton.Button active size="small" />
          <Skeleton.Input active size="small" style={{ width: 160 }} />
        </div>
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: '40%', minWidth: 320, borderRight: '1px solid rgba(17,25,37,0.1)', padding: 16 }}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
          <div style={{ flex: 1, padding: 16 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        </div>
      </div>
    );
  }

  // Default: simple skeleton for forms and profiles
  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', width: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Skeleton.Input active size="large" style={{ width: 240, height: 32 }} />
        <div style={{ marginTop: 12 }}>
          <Skeleton.Input active style={{ width: 300, height: 16 }} />
        </div>
      </div>
      <div style={{ border: '1px solid rgba(17,25,37,0.1)', borderRadius: 8, padding: 24 }}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    </div>
  );
}
