import { Link, Outlet } from 'react-router-dom';
import { Layout, Typography, theme } from 'antd';

const { Header, Content } = Layout;

export default function PublicLayout() {
  const { token } = theme.useToken();
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Link to="/">
          <Typography.Title level={3} style={{ color: token.colorTextLightSolid, margin: 0 }}>
            Blog Generator
          </Typography.Title>
        </Link>
      </Header>
      <Content style={{ padding: 24, maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
