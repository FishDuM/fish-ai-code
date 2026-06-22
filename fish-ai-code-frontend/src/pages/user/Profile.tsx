import { Card, Avatar, Descriptions, Typography, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTitle } from '@/hooks/useTitle';

const { Title } = Typography;

export default function Profile() {
  useTitle('个人资料');
  const { loginUser } = useAuthStore();

  if (!loginUser) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar
            size={80}
            src={loginUser.userAvatar}
            icon={!loginUser.userAvatar ? <UserOutlined /> : undefined}
          />
          <Title level={4} style={{ marginTop: 12, marginBottom: 0 }}>
            {loginUser.userName || loginUser.userAccount}
          </Title>
          <Tag color={loginUser.userRole === 'admin' ? 'red' : 'blue'} style={{ marginTop: 4 }}>
            {loginUser.userRole === 'admin' ? '管理员' : '普通用户'}
          </Tag>
        </div>

        <Descriptions column={1} variant="bordered" size="small">
          <Descriptions.Item label="账号">{loginUser.userAccount}</Descriptions.Item>
          <Descriptions.Item label="昵称">{loginUser.userName || '-'}</Descriptions.Item>
          <Descriptions.Item label="简介">{loginUser.userProfile || '-'}</Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {dayjs(loginUser.createTime).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {dayjs(loginUser.updateTime).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
