import { useCallback, useEffect, useRef } from 'react';
import { Alert, Button, Card, Col, Layout, Row, Space, Typography, message, theme } from 'antd';
import BlogForm from './components/BlogForm.jsx';
import BlogOutput from './components/BlogOutput.jsx';
import { BUSY_ERRORS as BUSY, RETRYABLE_ERRORS as RETRYABLE } from './constants/errors.js';
import { useBlogGeneration } from './hooks/useBlogGeneration.js';

const { Header, Content } = Layout;

export default function App() {
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const { status, content, error, stopReason, generate, cancel } = useBlogGeneration();
  const lastRequest = useRef(null);

  const submit = useCallback(
    (params) => {
      lastRequest.current = params;
      generate(params);
    },
    [generate],
  );
  const retry = useCallback(() => {
    if (lastRequest.current) generate(lastRequest.current);
  }, [generate]);

  useEffect(() => {
    if (error?.code === 'VALIDATION_ERROR') messageApi.error(error.message);
  }, [error, messageApi]);

  let alert = null;
  if (status === 'error' && error && error.code !== 'VALIDATION_ERROR') {
    if (BUSY.has(error.code)) {
      alert = (
        <Alert
          type="warning"
          showIcon
          message="The service is busy. Please try again shortly."
          description={error.message}
        />
      );
    } else if (RETRYABLE.has(error.code)) {
      alert = (
        <Alert
          type="error"
          showIcon
          message={error.message}
          action={
            <Button size="small" danger onClick={retry}>
              Retry
            </Button>
          }
        />
      );
    } else {
      // INVALID_JSON / PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE: resending the same request won't help.
      alert = <Alert type="error" showIcon message={error.message} />;
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={3} style={{ color: token.colorTextLightSolid, margin: 0 }}>
          Blog Generator
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24 }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={10}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Card title="Details">
                <BlogForm
                  onSubmit={submit}
                  onCancel={cancel}
                  loading={status === 'streaming'}
                  errorDetails={error?.code === 'VALIDATION_ERROR' ? error.details : undefined}
                />
              </Card>
              {alert}
            </Space>
          </Col>
          <Col xs={24} lg={14}>
            <BlogOutput content={content} status={status} stopReason={stopReason} />
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
