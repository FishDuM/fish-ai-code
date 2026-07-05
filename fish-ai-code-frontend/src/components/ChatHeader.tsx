import { memo } from 'react';
import { useNavigate } from 'react-router';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined, CloudUploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import logoUrl from '@/assets/logo.png';

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
    <div className="chat-header">
      <Space className="chat-header-left">
        <Button className="chat-back-button" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')} />
        <span className="chat-app-icon">
          <img src={logoUrl} alt="" />
        </span>
        <Text strong className="chat-app-title">{appName || '未命名应用'}</Text>
      </Space>
      <Space className="chat-header-actions">
        {isOwner && (
          <>
            <Button type="text" icon={<EditOutlined />} onClick={onRename}>
              重命名
            </Button>
            <Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete}>
              删除
            </Button>
            <Button
              className="chat-deploy-button"
              icon={<CloudUploadOutlined />}
              onClick={onDeploy}
              loading={deploying}
              disabled={!showPreview}
            >
              部署
            </Button>
          </>
        )}
      </Space>
    </div>
  );
}

export default memo(ChatHeader);
