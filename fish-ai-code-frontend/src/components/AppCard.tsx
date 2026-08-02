import { Card, Tag, Typography, Space, Button, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';
import { useState } from 'react';
import dayjs from 'dayjs';
import type { AppVO } from '@/api/types';
import { CODE_GEN_TYPES, FEATURED_PRIORITY } from '@/constants';

const { Text } = Typography;

type AppCardData = Pick<AppVO, 'id' | 'appName' | 'cover' | 'codeGenType' | 'priority' | 'createTime'>;

interface AppCardProps<T extends AppCardData> {
  app: T;
  onEdit?: (app: T) => void;
  onDelete?: (app: T) => void;
  onOpen?: (app: T) => void;
  showActions?: boolean;
}

const gradients = [
  'linear-gradient(135deg, #111925 0%, #1f6f68 54%, #36D2BE 100%)',
  'linear-gradient(135deg, #0f2c2a 0%, #2BA898 58%, #b8fff4 100%)',
  'linear-gradient(135deg, #26323f 0%, #40716d 52%, #9ee9df 100%)',
  'linear-gradient(135deg, #f7fbfa 0%, #d8f6f1 48%, #36D2BE 100%)',
  'linear-gradient(135deg, #111925 0%, #344650 48%, #6fd8ca 100%)',
  'linear-gradient(135deg, #effaf8 0%, #bceee7 46%, #2BA898 100%)',
];

function getGradient(id: string) {
  const index = parseInt(id, 10) % gradients.length || 0;
  return gradients[index];
}

export default function AppCard<T extends AppCardData>({ app, onEdit, onDelete, onOpen, showActions = true }: AppCardProps<T>) {
  const codeGenLabel = app.codeGenType === CODE_GEN_TYPES.MULTI_FILE ? '多文件' : app.codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? 'Vue 工程' : 'HTML';
  const [imageError, setImageError] = useState(false);
  const showGradient = !app.cover || imageError;

  return (
    <Card
      hoverable
      onClick={() => onOpen?.(app)}
      className="app-card"
      style={{ height: '100%' }}
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
              src={app.cover || undefined}
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
              <Tag color={app.codeGenType === CODE_GEN_TYPES.MULTI_FILE ? 'default' : app.codeGenType === CODE_GEN_TYPES.VUE_PROJECT ? 'lime' : 'green'}>
                {codeGenLabel}
              </Tag>
              {app.priority === FEATURED_PRIORITY && <Tag color="gold">精选</Tag>}
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
