import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Divider, List, Result, Skeleton, Typography } from 'antd';
import { getBlog } from '../api/blogs.js';
import MarkdownView from '../components/MarkdownView.jsx';

const SITE_TITLE = 'Blog';

// The writer prompt makes the model open with "# Title", which the page already renders as its h1.
const stripLeadingH1 = (md) => (md ?? '').replace(/^\s*#[ \t]+[^\n]*(\n+|$)/, '');

// Source URLs come from model output; only http(s) may become clickable links.
const isHttpUrl = (url) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

export default function BlogDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Tagged with its slug/attempt so "loading" is derived rather than set inside the effect.
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${slug}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    getBlog(slug, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
      });
    return () => controller.abort();
  }, [slug, key]);

  const current = result?.key === key ? result : null;
  const status = !current ? 'loading' : current.error ? 'error' : 'ready';
  const { data, error } = current ?? {};
  const notFound = status === 'error' && error?.code === 'NOT_FOUND';

  useEffect(() => {
    const prev = document.title;
    if (status === 'ready') document.title = `${data.title} | ${SITE_TITLE}`;
    return () => {
      document.title = prev;
    };
  }, [status, data]);

  // History back restores the list's ?page= query; a direct visit falls back to the first page.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));
  const backButton = (
    <Button type="link" onClick={goBack} style={{ paddingInline: 0 }}>
      Back to posts
    </Button>
  );

  if (status === 'loading') return <Skeleton active paragraph={{ rows: 8 }} />;

  if (notFound) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="This post does not exist."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Back home
          </Button>
        }
      />
    );
  }

  if (status === 'error') {
    return (
      <>
        {backButton}
        <Alert
          type="error"
          showIcon
          message={error?.message ?? 'Failed to load the post.'}
          action={<Button onClick={() => setAttempt((a) => a + 1)}>Retry</Button>}
        />
      </>
    );
  }

  const sources = (data.sources ?? []).filter((s) => isHttpUrl(s.url));
  return (
    <article>
      {backButton}
      <Typography.Title level={1}>{data.title}</Typography.Title>
      {data.publishedAt && (
        <Typography.Text type="secondary">
          <time dateTime={data.publishedAt}>{new Date(data.publishedAt).toLocaleDateString()}</time>
        </Typography.Text>
      )}
      <MarkdownView content={stripLeadingH1(data.contentMd)} />
      {sources.length > 0 && (
        <>
          <Divider />
          <Typography.Title level={3}>Sources</Typography.Title>
          <List
            size="small"
            dataSource={sources}
            renderItem={(s) => (
              <List.Item>
                <Typography.Link href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || s.url}
                </Typography.Link>
              </List.Item>
            )}
          />
        </>
      )}
    </article>
  );
}
