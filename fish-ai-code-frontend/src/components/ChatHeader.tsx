import { memo } from 'react';
import { useNavigate } from 'react-router';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined, CloudUploadOutlined, EditOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import logoUrl from '@/assets/logo.png';

const { Text } = Typography;

function getCompactAppName(appName: string): string {
  const characters = Array.from(appName);
  return characters.length > 5 ? `${characters.slice(0, 5).join('')}...` : appName;
}

interface ChatHeaderProps {
  appName: string;
  isOwner: boolean;
  showPreview: boolean;
  isStreaming: boolean;
  /** 应用详情加载中：禁用依赖应用对象的操作，防止误操作上一个应用 */
  appLoading?: boolean;
  /** 返回按钮目标路径（未传时回 /dashboard） */
  backTo?: string;
  deploying: boolean;
  onDeploy: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ChatHeader({ appName, isOwner, showPreview, isStreaming, appLoading = false, backTo = '/dashboard', deploying, onDeploy, onDownload, onRename, onDelete }: ChatHeaderProps) {
  const navigate = useNavigate();
  const displayAppName = appName || '未命名应用';

  return (
    <div className="chat-header">
      <Space className="chat-header-left">
        <Button className="chat-back-button" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo)} />
        <span className="chat-app-icon">
          <img src={logoUrl} alt="" />
        </span>
        <Text strong className="chat-app-title">
          <span className="chat-app-title-full">{displayAppName}</span>
          <span className="chat-app-title-compact">{getCompactAppName(displayAppName)}</span>
        </Text>
      </Space>
      <Space className="chat-header-actions">
        {isOwner && (
          <>
            <Button type="text" icon={<EditOutlined />} onClick={onRename} disabled={appLoading}>
              重命名
            </Button>
            <Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete} disabled={appLoading}>
              删除
            </Button>
            <Button
              className="chat-deploy-button"
              icon={<CloudUploadOutlined />}
              onClick={onDeploy}
              loading={deploying}
              disabled={appLoading || !showPreview || isStreaming}
            >
              部署
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={onDownload}
              disabled={appLoading || !showPreview || isStreaming}
            >
              下载代码
            </Button>
          </>
        )}
      </Space>
    </div>
  );
}

export default memo(ChatHeader);
