import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { FileTextOutlined, LogoutOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Sider, Content } = Layout;

const ITEMS = [
  { key: '/admin/generate', icon: <ThunderboltOutlined />, label: 'Generate' },
  { key: '/admin/blogs', icon: <FileTextOutlined />, label: 'Blogs' },
  { key: 'logout', icon: <LogoutOutlined />, label: 'Logout' },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Logout only navigates for now; session handling arrives with the auth task.
  const onClick = ({ key }) => navigate(key === 'logout' ? '/admin/login' : key);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={0}>
        <Menu theme="dark" mode="inline" selectedKeys={[pathname]} items={ITEMS} onClick={onClick} />
      </Sider>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
