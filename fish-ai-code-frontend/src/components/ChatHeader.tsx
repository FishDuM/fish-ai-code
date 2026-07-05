import { memo } from 'react';
import { useNavigate } from 'react-router';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined, CloudUploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ChatHeaderProps {
  appName: string;
  isOwner: boolean;
  showPreview: boolean;
  deploying: boolean;
  onDeploy: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ChatHeader({ appName, isOwner, showPreview, deploying, onDeploy, onRename, onDelete }: ChatHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        height: 56,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(17,25,37,0.1)',
        background: '#fff',
        flexShrink: 0,
      }}
    >
      <Space>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
          返回
        </Button>
        <Text strong style={{ color: '#111925' }}>{appName || '未命名应用'}</Text>
      </Space>
      <Space>
        {isOwner && (
          <>
            <Button
              className="btn-gradient"
              icon={<CloudUploadOutlined />}
              onClick={onDeploy}
              loading={deploying}
              disabled={!showPreview}
            >
              部署
            </Button>
            <Button type="text" icon={<EditOutlined />} onClick={onRename}>
              重命名
            </Button>
            <Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete}>
              删除
            </Button>
          </>
        )}
      </Space>
    </div>
  );
}

export default memo(ChatHeader);
