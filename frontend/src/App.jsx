import { Layout, Typography, theme } from 'antd';

const { Header, Content } = Layout;

export default function App() {
  const { token } = theme.useToken();
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={3} style={{ color: token.colorTextLightSolid, margin: 0 }}>
          Blog Generator
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24 }} />
    </Layout>
  );
}
