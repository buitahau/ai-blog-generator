import { Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';

const { Text, Link } = Typography;

const safeHref = (url) => (/^https?:\/\//i.test(url ?? '') ? url : undefined);

const STATUS = {
  running: { icon: <LoadingOutlined />, color: 'processing', text: 'running' },
  ok: { icon: <CheckCircleOutlined />, color: 'success', text: 'done' },
  error: { icon: <CloseCircleOutlined />, color: 'error', text: 'failed' },
};

export const toolTarget = (tool) => tool.input?.query ?? tool.input?.url ?? '';

// Collapse header: always visible, so every call shows even when its body is closed.
export function ToolCallLabel({ tool }) {
  const s = STATUS[tool.status] ?? STATUS.running;
  return (
    <Space wrap size={4}>
      <Tag icon={s.icon} color={s.color}>
        {tool.name ?? 'tool'} {s.text}
      </Tag>
      <Text type="secondary" ellipsis style={{ maxWidth: 360 }}>
        {toolTarget(tool)}
      </Text>
    </Space>
  );
}

export default function ToolCallItem({ tool }) {
  const results = Array.isArray(tool.results) ? tool.results : [];
  return (
    <Space direction="vertical" size={2} style={{ width: '100%' }}>
      {tool.summary && <Text type="secondary">{tool.summary}</Text>}
      {tool.status === 'error' && <Text type="danger">{tool.errorCode ?? 'The tool call failed.'}</Text>}
      {results.map((r, i) => {
        const href = safeHref(r.url);
        const title = r.title || r.url || 'Untitled';
        return href ? (
          <Link key={`${r.url}-${i}`} href={href} target="_blank" rel="noopener noreferrer">
            {title}
          </Link>
        ) : (
          <Text key={i}>{title}</Text>
        );
      })}
      {!tool.summary && !results.length && tool.status !== 'error' && <Text type="secondary">No result yet.</Text>}
    </Space>
  );
}
