import { useEffect, useRef } from 'react';
import { Card, Collapse, Space, Spin, Tag, Typography, theme } from 'antd';
import MarkdownView from '../MarkdownView.jsx';
import ToolCallItem, { ToolCallLabel } from './ToolCallItem.jsx';

const { Text } = Typography;

const TITLES = { orchestrator: 'Orchestrator', researcher: 'Researcher', writer: 'Writer' };
const STATUS_TAG = {
  idle: { color: 'default', text: 'Waiting' },
  running: { color: 'processing', text: 'Running' },
  completed: { color: 'success', text: 'Completed' },
  failed: { color: 'error', text: 'Failed' },
};
const NEAR_BOTTOM_PX = 40;
const RETRY_LABEL = { RATE_LIMITED: 'rate limit', OVERLOADED: 'overloaded', UPSTREAM_ERROR: 'server error' };

export default function AgentPanel({ name, spawn = 1, instance: agent }) {
  const { token } = theme.useToken();
  const tag = STATUS_TAG[agent.status] ?? STATUS_TAG.idle;
  const title = `${TITLES[name] ?? name}${spawn > 1 ? ` (pass ${spawn})` : ''}`;
  const running = agent.status === 'running';
  const streamRef = useRef(null);
  const pinned = useRef(true);
  const onStreamScroll = () => {
    const el = streamRef.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };
  useEffect(() => {
    const el = streamRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [agent.text]);
  const boxStyle = {
    maxHeight: 240,
    overflowY: 'auto',
    padding: token.paddingSM,
    background: token.colorFillQuaternary,
    borderRadius: token.borderRadius,
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          {title}
          <Tag color={tag.color}>{tag.text}</Tag>
          {running && <Spin size="small" />}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {agent.heartbeat && (
          <Text type="secondary">
            Waiting on {agent.heartbeat.toolName}… {agent.heartbeat.elapsedSec} s
          </Text>
        )}
        {agent.retrying && (
          <Text type="warning">
            Retrying ({RETRY_LABEL[agent.retrying.category] ?? agent.retrying.category ?? 'error'})
          </Text>
        )}
        {agent.status === 'failed' && agent.error?.message && <Text type="danger">{agent.error.message}</Text>}
        {agent.tools.length > 0 && (
          <Collapse
            size="small"
            items={agent.tools.map((tool, i) => ({
              key: tool.toolUseId ?? i,
              label: <ToolCallLabel tool={tool} />,
              children: <ToolCallItem tool={tool} />,
            }))}
          />
        )}
        {agent.text &&
          (agent.status === 'completed' ? (
            <div style={boxStyle}>
              <MarkdownView content={agent.text} />
            </div>
          ) : (
            // Plain text while streaming: re-parsing Markdown on every batch would hurt responsiveness.
            <div ref={streamRef} onScroll={onStreamScroll} style={{ ...boxStyle, whiteSpace: 'pre-wrap' }}>{agent.text}</div>
          ))}
        {agent.status === 'completed' && (
          <Text type="secondary">
            {agent.numTurns != null && `${agent.numTurns} turns · `}
            {agent.usage ? `${agent.usage.inputTokens} in / ${agent.usage.outputTokens} out tokens` : ''}
            {agent.costUsd != null && ` · $${agent.costUsd.toFixed(4)}`}
          </Text>
        )}
      </Space>
    </Card>
  );
}
