import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, List, Pagination, Skeleton, Typography } from 'antd';
import { listBlogs } from '../api/blogs.js';
import { PAGE_MAX } from '../constants/options.js';

const PAGE_SIZE = 10;

function parsePage(raw) {
  const n = Number(raw);
  // Above the backend max the request would 400 forever; clamp so the user gets the empty state.
  return Number.isInteger(n) && n >= 1 ? Math.min(n, PAGE_MAX) : 1;
}

export default function BlogListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  // The result is tagged with the request key it belongs to, so "loading" is derived
  // instead of being set synchronously inside the effect.
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${page}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    listBlogs({ page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
      });
    return () => controller.abort();
  }, [page, key]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const goToPage = (p) => setSearchParams(p > 1 ? { page: String(p) } : {});

  const current = result?.key === key ? result : null;
  const status = !current ? 'loading' : current.error ? 'error' : 'ready';
  const { data, error } = current ?? {};
  const items = data?.items ?? [];

  return (
    <>
      <Typography.Title level={2}>Blog</Typography.Title>
      {status === 'error' && (
        <Alert
          type="error"
          showIcon
          message={error?.message ?? 'Failed to load posts.'}
          action={<Button onClick={retry}>Retry</Button>}
        />
      )}
      {status === 'loading' && <Skeleton active paragraph={{ rows: 6 }} />}
      {status === 'ready' && items.length === 0 && (
        <Empty description="No posts found">
          {data.total > 0 && <Button onClick={() => goToPage(1)}>Back to first page</Button>}
        </Empty>
      )}
      {status === 'ready' && items.length > 0 && (
        <>
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={items}
            renderItem={(post) => (
              <List.Item>
                <Card
                  title={<Link to={`/blogs/${post.slug}`}>{post.title}</Link>}
                  extra={
                    post.publishedAt && (
                      <Typography.Text type="secondary">
                        {new Date(post.publishedAt).toLocaleDateString()}
                      </Typography.Text>
                    )
                  }
                >
                  <Typography.Paragraph style={{ marginBottom: 0 }}>{post.excerpt}</Typography.Paragraph>
                </Card>
              </List.Item>
            )}
          />
          <Pagination
            align="center"
            current={data.page}
            pageSize={data.pageSize}
            total={data.total}
            showSizeChanger={false}
            hideOnSinglePage
            onChange={goToPage}
          />
        </>
      )}
    </>
  );
}
