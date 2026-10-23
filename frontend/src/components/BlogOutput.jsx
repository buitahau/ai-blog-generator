import { Alert, Button, Card, Empty, Space, Spin, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import MarkdownView from './MarkdownView.jsx';

const { Text } = Typography;

export default function BlogOutput({ content = '', status = 'idle', stopReason = null }) {
  const [messageApi, contextHolder] = message.useMessage();
  const streaming = status === 'streaming';
  const showEmpty = !content && !streaming;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      messageApi.success('Copied to clipboard');
    } catch {
      messageApi.error('Could not copy to clipboard');
    }
  };

  return (
    <Card
      title="Output"
      extra={
        <Button icon={<CopyOutlined />} onClick={copy} disabled={!content}>
          Copy
        </Button>
      }
    >
      {contextHolder}
      <div aria-live="polite" aria-busy={streaming}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {stopReason === 'max_tokens' && (
            <Alert type="warning" showIcon message="The post was cut off because it reached the length limit." />
          )}
          {status === 'cancelled' && <Alert type="info" showIcon message="Generation cancelled." />}
          {showEmpty ? (
            <Empty description="Your generated post will appear here" />
          ) : (
            <MarkdownView content={content} />
          )}
          {streaming && (
            <Space>
              <Spin size="small" />
              <Text type="secondary">Writing...</Text>
            </Space>
          )}
        </Space>
      </div>
    </Card>
  );
}
