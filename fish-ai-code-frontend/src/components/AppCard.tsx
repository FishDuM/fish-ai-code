import { Card, Tag, Typography, Space, Button, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';
import { useState } from 'react';
import dayjs from 'dayjs';
import type { AppVO } from '@/api/types';

const { Text } = Typography;

interface AppCardProps {
  app: AppVO;
  onEdit?: (app: AppVO) => void;
  onDelete?: (app: AppVO) => void;
  onOpen?: (app: AppVO) => void;
  showActions?: boolean;
}

const gradients = [
  'linear-gradient(135deg, #19cfff 0%, #8429ff 100%)',
  'linear-gradient(135deg, #36D2BE 0%, #2BA898 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
];

function getGradient(id: string) {
  const index = parseInt(id, 10) % gradients.length || 0;
  return gradients[index];
}

export default function AppCard({ app, onEdit, onDelete, onOpen, showActions = true }: AppCardProps) {
  const codeGenLabel = app.codeGenType === 'multi_file' ? '多文件' : 'HTML';
  const [imageError, setImageError] = useState(false);
  const showGradient = !app.cover || imageError;

  return (
    <Card
      hoverable
      onClick={() => onOpen?.(app)}
      style={{ height: '100%', borderRadius: 8, boxShadow: '0px 4px 20px rgba(17,25,37,0.08)' }}
      styles={{ body: { padding: 16 } }}
      cover={
        showGradient ? (
          <div
            style={{
              height: 160,
              background: getGradient(app.id),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px 8px 0 0',
            }}
          >
            <CodeOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.8)' }} />
          </div>
        ) : (
          <div style={{ height: 160, overflow: 'hidden', borderRadius: '8px 8px 0 0' }}>
            <img
              src={app.cover}
              alt={app.appName || '应用封面'}
              loading="lazy"
              onError={() => setImageError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )
      }
      actions={
        showActions
          ? [
              <Tooltip title="编辑" key="edit">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(app);
                  }}
                />
              </Tooltip>,
              <Tooltip title="删除" key="delete">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(app);
                  }}
                />
              </Tooltip>,
            ]
          : undefined
      }
    >
      <Card.Meta
        title={app.appName || '未命名应用'}
        description={
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <Space>
              <Tag color={app.codeGenType === 'multi_file' ? 'cyan' : 'green'}>
                {codeGenLabel}
              </Tag>
              {app.priority === 99 && <Tag color="gold">精选</Tag>}
            </Space>
            <Text type="secondary" style={{ fontSize: 12, color: 'rgba(17,25,37,0.45)' }}>
              {dayjs(app.createTime).format('YYYY-MM-DD HH:mm')}
            </Text>
          </Space>
        }
      />
    </Card>
  );
}
