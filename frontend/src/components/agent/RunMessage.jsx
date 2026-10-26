import { Link } from 'react-router-dom';
import { Alert, Button, Space, Steps, Tag, Tooltip, Typography } from 'antd';
import AgentPanel from './AgentPanel.jsx';
import { RETRYABLE_RUN_ERRORS, RUN_IN_PROGRESS, SILENT_RUN_ERRORS, TELEGRAM_ERRORS } from '../../constants/errors.js';

const { Text } = Typography;

const STEP_ITEMS = [
  ['research', 'Research'],
  ['write', 'Write'],
  ['save', 'Save draft'],
  ['notify', 'Notify'],
];
const STEP_STATUS = { pending: 'wait', active: 'process', done: 'finish', failed: 'error', skipped: 'finish' };
const AGENT_LABEL = { researcher: 'Researcher', writer: 'Writer' };

function NotificationTag({ notification }) {
  if (!notification) return null;
  if (notification.status === 'sent') return <Tag color="success">Telegram sent</Tag>;
  if (notification.status === 'failed') {
    return (
      <Tag color="warning">
        Telegram failed: {TELEGRAM_ERRORS[notification.errorCode] ?? 'The notification could not be sent.'}
      </Tag>
    );
  }
  return (
    <Tooltip title="Telegram not configured">
      <Tag>Telegram skipped</Tag>
    </Tooltip>
  );
}

function ErrorAlert({ error, status, onRetry, onReattach }) {
  if (!error || SILENT_RUN_ERRORS.has(error.code)) return null;
  if (error.code === RUN_IN_PROGRESS) {
    return (
      <Alert
        type="warning"
        showIcon
        message="A run is already in progress"
        action={
          <Button size="small" onClick={onReattach}>
            Show it
          </Button>
        }
      />
    );
  }
  const who = error.agent ? `${AGENT_LABEL[error.agent] ?? error.agent}: ` : '';
  return (
    <Alert
      type="error"
      showIcon
      message={`${who}${error.message ?? 'Something went wrong.'}`}
      action={
        status === 'error' && RETRYABLE_RUN_ERRORS.has(error.code) ? (
          <Button size="small" danger onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}

export default function RunMessage({ run, onCancel, onRetry, onReattach }) {
  const { status, steps, instances, blog, notification, error, totalCostUsd, cancelling } = run;
  const active = status === 'starting' || status === 'running' || status === 'reconnecting';
  // Minimal until F05 renders every instance in `order`.
  const showAgents = (name) => {
    const a = instances[`${name}:1`];
    return a && (a.status !== 'idle' || a.text || a.tools.length);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {run.title && <Text strong>{run.title}</Text>}
      {status !== 'starting' && <Steps size="small" items={STEP_ITEMS.map(([k, title]) => ({ title, status: STEP_STATUS[steps[k]] }))} />}
      {status === 'reconnecting' && <Alert type="info" showIcon message="Connection lost. Reconnecting…" />}
      {['researcher', 'writer'].filter(showAgents).map((name) => (
        <AgentPanel key={name} name={name} agent={instances[`${name}:1`]} />
      ))}
      {notification && <NotificationTag notification={notification} />}
      {blog && (
        <Space>
          <Text type="success">Draft saved</Text>
          <Link to={`/admin/blogs?highlight=${encodeURIComponent(blog.blogId)}`}>
            <Button type="primary">Open draft</Button>
          </Link>
        </Space>
      )}
      {status === 'done' && totalCostUsd != null && <Text type="secondary">Total cost ${totalCostUsd.toFixed(4)}</Text>}
      {status === 'cancelled' && <Alert type="info" showIcon message="Run cancelled" />}
      <ErrorAlert error={error} status={status} onRetry={onRetry} onReattach={onReattach} />
      {active && (
        <Button danger onClick={onCancel} loading={cancelling} disabled={cancelling}>
          Cancel
        </Button>
      )}
    </Space>
  );
}
