import { Card, Space, Spin, Tag, Timeline, Typography, theme } from 'antd';
import { RETRY_LABEL } from '../../constants/errors.js';
import { useAgentBoxStyle, usePinToBottom } from './useAgentBox.js';

const { Text } = Typography;

const REASON_LABEL = {
  LIMIT_REACHED: 'limit reached',
  BUDGET_EXHAUSTED: 'budget exhausted',
  SPAWN_IN_PROGRESS: 'another agent is running',
  INVALID_INPUT: 'invalid input',
};
const STATUS_TAG = {
  running: { color: 'processing', text: 'Running' },
  completed: { color: 'success', text: 'Completed' },
  failed: { color: 'error', text: 'Failed' },
  cancelled: { color: 'default', text: 'Cancelled' },
};
const ACTION_LABEL = { spawn_researcher: 'Research', spawn_writer: 'Write' };

function actionLabel(d) {
  const base = ACTION_LABEL[d.action] ?? d.action;
  return d.action === 'spawn_researcher' && d.accepted && d.spawn ? `${base} (pass ${d.spawn})` : base;
}

// `text` is the orchestrator's streamed output; shown as plain text, never parsed as Markdown.
export default function OrchestratorPanel({ decisions = [], instance }) {
  const text = instance?.text ?? '';
  const tag = STATUS_TAG[instance?.status];
  const { token } = theme.useToken();
  const boxStyle = useAgentBoxStyle();
  const pinRef = usePinToBottom(text);

  const items = decisions.map((d, i) => ({
    key: i,
    color: d.accepted ? token.colorSuccess : token.colorWarning,
    children: d.accepted ? (
      <Space direction="vertical" size={0}>
        <Text>{actionLabel(d)}</Text>
        {d.focus && <Text type="secondary">{d.focus}</Text>}
      </Space>
    ) : (
      <Text type="warning">
        {actionLabel(d)} rejected: {REASON_LABEL[d.reason] ?? d.reason ?? 'unknown'}
      </Text>
    ),
  }));

  return (
    <Card
      size="small"
      title={
        <Space>
          Orchestrator decisions
          {tag && <Tag color={tag.color}>{tag.text}</Tag>}
          {instance?.status === 'running' && <Spin size="small" />}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {instance?.retrying && (
          <Text type="warning">
            Retrying ({RETRY_LABEL[instance.retrying.category] ?? instance.retrying.category ?? 'error'})
          </Text>
        )}
        {instance?.status === 'failed' && instance.error?.message && <Text type="danger">{instance.error.message}</Text>}
        {items.length > 0 ? <Timeline items={items} /> : <Text type="secondary">No decisions yet</Text>}
        {text && (
          <div ref={pinRef} style={{ ...boxStyle, whiteSpace: 'pre-wrap' }}>
            {text}
          </div>
        )}
      </Space>
    </Card>
  );
}
