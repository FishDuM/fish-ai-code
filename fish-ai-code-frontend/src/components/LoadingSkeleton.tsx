import { Card, Col, Row, Skeleton } from 'antd';

interface LoadingSkeletonProps {
  count?: number;
}

export default function LoadingSkeleton({ count = 6 }: LoadingSkeletonProps) {
  return (
    <Row gutter={[16, 16]}>
      {Array.from({ length: count }).map((_, i) => (
        <Col key={i} xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Skeleton.Image style={{ width: '100%', height: 160 }} active />
            <Skeleton active paragraph={{ rows: 2 }} style={{ marginTop: 16 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
