import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Space, Tag, Typography, theme } from 'antd';
import { Link } from 'react-router-dom';
import { useAgentRun } from '../hooks/useAgentRun.js';
import RunMessage from '../components/agent/RunMessage.jsx';

const { Title, Text } = Typography;
// Mirrors TITLE_MAX in backend/src/validation/runSchema.js.
const TITLE_MAX = 200;
const NEAR_BOTTOM_PX = 40;
const ACTIVE = new Set(['starting', 'running', 'reconnecting']);

export default function AdminGeneratePage() {
  const { token } = theme.useToken();
  const run = useAgentRun();
  const [title, setTitle] = useState('');
  const listRef = useRef(null);
  const atBottom = useRef(true);
  const busy = ACTIVE.has(run.status);

  const onScroll = () => {
    const el = listRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // Follow the stream only while the user hasn't scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [run.instances, run.steps, run.status, run.blog, run.error, run.history.length]);

  const submit = useCallback(() => {
    const value = title.trim();
    if (!value || busy) return;
    atBottom.current = true;
    setTitle('');
    run.start(value);
  }, [title, busy, run]);

  const retry = () => run.start(run.title);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: token.marginSM }}>
      <Title level={2} style={{ margin: 0 }}>
        Generate
      </Title>
      <div
        ref={listRef}
        onScroll={onScroll}
        aria-live="polite"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: token.paddingXS }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {run.history.length === 0 && run.status === 'idle' && (
            <Text type="secondary">Enter a blog title to start a research and write run.</Text>
          )}
          {run.history
            .filter((h) => h.runId !== run.runId)
            .map((h) => (
              <Card size="small" key={h.runId}>
                <Space wrap>
                  <Text strong>{h.title}</Text>
                  <Tag color={h.status === 'done' ? 'success' : h.status === 'error' ? 'error' : 'default'}>{h.status}</Tag>
                  {h.blog && <Link to={`/admin/blogs?highlight=${encodeURIComponent(h.blog.blogId)}`}>Open draft</Link>}
                </Space>
              </Card>
            ))}
          {run.status !== 'idle' && (
            <RunMessage run={run} onCancel={run.cancel} onRetry={retry} onReattach={run.reattach} />
          )}
        </Space>
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          aria-label="Blog title"
          placeholder="Blog title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={submit}
        />
        <Button type="primary" onClick={submit} disabled={busy || !title.trim()}>
          Send
        </Button>
      </Space.Compact>
    </div>
  );
}
