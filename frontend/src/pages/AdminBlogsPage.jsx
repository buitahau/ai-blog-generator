import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Divider, Drawer, List, Popconfirm, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { deleteBlog, getAdminBlog, listAdminBlogs, publishBlog, unpublishBlog } from '../api/adminBlogs.js';
import MarkdownView from '../components/MarkdownView.jsx';
import { PAGE_MAX } from '../constants/options.js';

const PAGE_SIZE = 10;
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

function parsePage(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, PAGE_MAX) : 1;
}

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Source URLs come from model output; only http(s) may become clickable links.
const isHttpUrl = (url) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

const fmt = (d) => (d ? new Date(d).toLocaleString() : '-');

function Preview({ id, onClose, onError }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (id == null) return undefined;
    const controller = new AbortController();
    getAdminBlog(id, { signal: controller.signal })
      .then((data) => setResult({ id, data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ id, error });
        onError(error);
      });
    return () => controller.abort();
  }, [id, onError]);

  const current = result?.id === id ? result : null;
  const data = current?.data;
  const sources = (data?.sources ?? []).filter((s) => isHttpUrl(s.url));

  return (
    <Drawer title={data?.title ?? 'Preview'} open={id != null} onClose={onClose} width={720} destroyOnClose>
      {!current && <Skeleton active paragraph={{ rows: 8 }} />}
      {current?.error && <Alert type="error" showIcon message={current.error.message ?? 'Failed to load post.'} />}
      {data && (
        <>
          <MarkdownView content={data.contentMd} />
          {sources.length > 0 && (
            <>
              <Divider />
              <Typography.Title level={4}>Sources</Typography.Title>
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
        </>
      )}
    </Drawer>
  );
}

export default function AdminBlogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messageApi, contextHolder] = message.useMessage();
  const status = ['draft', 'published'].includes(searchParams.get('status')) ? searchParams.get('status') : '';
  const page = parsePage(searchParams.get('page'));
  const highlight = parseId(searchParams.get('highlight'));

  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  // Preview follows ?highlight= until the user opens another post or closes the drawer.
  const [previewOverride, setPreviewOverride] = useState(undefined);
  const [seenHighlight, setSeenHighlight] = useState(highlight);
  if (seenHighlight !== highlight) {
    // A new ?highlight= should open its post even if the user closed an earlier preview.
    setSeenHighlight(highlight);
    setPreviewOverride(undefined);
  }
  const previewId = previewOverride === undefined ? highlight : previewOverride;
  const key = `${status}:${page}:${attempt}`;

  const showError = useCallback(
    (error) => {
      // An expired token redirects to login; an extra toast would just flash.
      if (error?.code !== 'UNAUTHORIZED') messageApi.error(error?.message ?? 'Request failed.');
    },
    [messageApi],
  );

  useEffect(() => {
    const controller = new AbortController();
    listAdminBlogs({ status, page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        showError(error);
      });
    return () => controller.abort();
  }, [status, page, key, showError]);

  const current = result?.key === key ? result : null;
  const loading = !current;
  // Keep showing the previous rows while a refetch is in flight.
  const shown = (current ?? result)?.data;

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    setSearchParams(next);
  };

  const patchRow = (record) =>
    setResult((r) =>
      r?.data ? { ...r, data: { ...r.data, items: r.data.items.map((i) => (i.id === record.id ? { ...i, ...record } : i)) } } : r,
    );

  const toggle = async (row) => {
    try {
      const record = await (row.status === 'published' ? unpublishBlog : publishBlog)(row.id);
      patchRow(record);
      messageApi.success(row.status === 'published' ? 'Unpublished' : 'Published');
    } catch (error) {
      showError(error);
    }
  };

  const remove = async (row) => {
    try {
      await deleteBlog(row.id);
      messageApi.success('Deleted');
      if (shown.items.length === 1 && page > 1) update({ page: page - 1 > 1 ? page - 1 : null });
      else setAttempt((a) => a + 1);
    } catch (error) {
      showError(error);
    }
  };

  const closePreview = () => {
    setPreviewOverride(null);
    if (searchParams.has('highlight')) update({ highlight: null });
  };

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={s === 'published' ? 'green' : 'default'}>{s}</Tag>,
    },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: fmt },
    { title: 'Published', dataIndex: 'publishedAt', key: 'publishedAt', render: fmt },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, row) => {
        const published = row.status === 'published';
        return (
          <Space wrap>
            <Button size="small" onClick={() => setPreviewOverride(row.id)}>
              Preview
            </Button>
            <Popconfirm
              title={published ? 'Unpublish this post?' : 'Publish this post?'}
              okText={published ? 'Unpublish' : 'Publish'}
              onConfirm={() => toggle(row)}
            >
              <Button size="small">{published ? 'Unpublish' : 'Publish'}</Button>
            </Popconfirm>
            <Popconfirm title="Delete this post?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(row)}>
              <Button size="small" danger>
                Delete
              </Button>
            </Popconfirm>
            {published && <Link to={`/blogs/${row.slug}`}>View</Link>}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      {contextHolder}
      <Typography.Title level={2}>Blogs</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Select
          aria-label="Status filter"
          style={{ width: 180 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => update({ status: value, page: null })}
        />
      </Space>
      {current?.error && !shown && (
        <Alert
          type="error"
          showIcon
          message={current.error.message ?? 'Failed to load posts.'}
          action={<Button onClick={() => setAttempt((a) => a + 1)}>Retry</Button>}
        />
      )}
      {current?.data && current.data.items.length === 0 && current.data.total > 0 && (
        <Button style={{ marginBottom: 16 }} onClick={() => update({ page: null })}>
          Back to first page
        </Button>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={shown?.items ?? []}
        loading={loading}
        scroll={{ x: true }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: shown?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: (p) => update({ page: p > 1 ? p : null }),
        }}
      />
      <Preview id={previewId} onClose={closePreview} onError={showError} />
    </>
  );
}
