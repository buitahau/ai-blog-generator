import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AdminBlogsPage from './AdminBlogsPage.jsx';
import { clearToken, setToken } from '../api/auth.js';

const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const row = (n, over = {}) => ({
  id: n,
  slug: `post-${n}`,
  title: `Post ${n}`,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  publishedAt: null,
  ...over,
});
const list = (items, total = items.length) => json({ items, total, page: 1, pageSize: 10 });
const full = (n, over = {}) => ({
  ...row(n),
  contentMd: 'Body text\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
  sources: [
    { title: 'Example', url: 'https://example.com/a' },
    { title: 'Bad', url: 'javascript:alert(1)' },
  ],
  ...over,
});

beforeEach(() => {
  setToken('tok');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  clearToken();
  vi.unstubAllGlobals();
});

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
};
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminBlogsPage />
      <Where />
    </MemoryRouter>,
  );
const urls = () => fetch.mock.calls.map((c) => c[0]);

it('sends the Bearer token and the status param from the URL', async () => {
  fetch.mockResolvedValue(list([row(1)]));
  renderAt('/admin/blogs?status=draft&page=2');
  await screen.findByText('Post 1');
  expect(fetch.mock.calls[0][0]).toBe('/api/admin/blogs?page=2&pageSize=10&status=draft');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
});

it('changing the status filter updates the URL, resets the page and refetches', async () => {
  fetch.mockResolvedValue(list([row(1)]));
  renderAt('/admin/blogs?page=2');
  await screen.findByText('Post 1');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /status filter/i }));
  fireEvent.click(await screen.findByText('Published', { selector: '.ant-select-item-option-content' }));
  await waitFor(() => expect(urls()).toContain('/api/admin/blogs?page=1&pageSize=10&status=published'));
  expect(screen.getByTestId('where').textContent).toBe('/admin/blogs?status=published');
});

it('publishes a draft and updates the row without refetching the list', async () => {
  fetch.mockResolvedValueOnce(list([row(1)]));
  renderAt('/admin/blogs');
  await screen.findByText('Post 1');
  expect(screen.queryByText('View')).toBeNull();
  fetch.mockResolvedValueOnce(json(row(1, { status: 'published', publishedAt: '2026-02-01T00:00:00Z' })));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Publish' })).at(-1));
  const link = await screen.findByRole('link', { name: 'View' });
  expect(link.getAttribute('href')).toBe('/blogs/post-1');
  expect(fetch.mock.calls[1][0]).toBe('/api/admin/blogs/1/publish');
  expect(fetch.mock.calls[1][1].method).toBe('POST');
  expect(screen.getByText('published')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('unpublishes a published post: row returns to draft and View disappears', async () => {
  fetch.mockResolvedValueOnce(list([row(1, { status: 'published', publishedAt: '2026-02-01T00:00:00Z' })]));
  renderAt('/admin/blogs');
  await screen.findByRole('link', { name: 'View' });
  fetch.mockResolvedValueOnce(json(row(1)));
  fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Unpublish' })).at(-1));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'View' })).toBeNull());
  expect(fetch.mock.calls[1][0]).toBe('/api/admin/blogs/1/unpublish');
  expect(fetch.mock.calls[1][1].method).toBe('POST');
  expect(screen.getByText('draft')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('deleting the last row on page > 1 steps back a page', async () => {
  fetch.mockResolvedValueOnce(list([row(11)], 11));
  renderAt('/admin/blogs?page=2');
  await screen.findByText('Post 11');
  fetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
  fetch.mockResolvedValueOnce(list([row(1)], 10));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Delete' })).at(-1));
  await waitFor(() => expect(urls()).toContain('/api/admin/blogs?page=1&pageSize=10'));
  expect(screen.getByTestId('where').textContent).toBe('/admin/blogs');
});

it('pagination writes ?page= to the URL', async () => {
  fetch.mockResolvedValue(list([row(1)], 25));
  renderAt('/admin/blogs');
  await screen.findByText('Post 1');
  fireEvent.click(screen.getByTitle('2'));
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/blogs?page=2'));
  await waitFor(() => expect(urls()).toContain('/api/admin/blogs?page=2&pageSize=10'));
});

it('retries a failed list load', async () => {
  fetch.mockResolvedValueOnce(json({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }, 500));
  renderAt('/admin/blogs');
  const retry = await screen.findByRole('button', { name: 'Retry' });
  fetch.mockResolvedValueOnce(list([row(1)]));
  fireEvent.click(retry);
  await screen.findByText('Post 1');
});

it('offers a way back from an out-of-range page', async () => {
  fetch.mockResolvedValueOnce(list([], 3));
  renderAt('/admin/blogs?page=5');
  fetch.mockResolvedValueOnce(list([row(1)], 3));
  fireEvent.click(await screen.findByRole('button', { name: 'Back to first page' }));
  await screen.findByText('Post 1');
  expect(screen.getByTestId('where').textContent).toBe('/admin/blogs');
});

it('shows message.error when publishing fails and leaves the row alone', async () => {
  fetch.mockResolvedValueOnce(list([row(1)]));
  renderAt('/admin/blogs');
  await screen.findByText('Post 1');
  fetch.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND', message: 'Gone' } }, 404));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1));
  expect(await screen.findByText('Gone')).toBeTruthy();
  expect(screen.getByText('draft')).toBeTruthy();
});

it('deletes only after confirming, then refetches', async () => {
  fetch.mockResolvedValueOnce(list([row(1)]));
  renderAt('/admin/blogs');
  await screen.findByText('Post 1');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
  fetch.mockResolvedValueOnce(list([]));
  const confirm = (await screen.findAllByRole('button', { name: 'Delete' })).at(-1);
  fireEvent.click(confirm);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[1][0]).toBe('/api/admin/blogs/1');
  expect(fetch.mock.calls[1][1].method).toBe('DELETE');
  await waitFor(() => expect(screen.queryByText('Post 1')).toBeNull());
});

it('shows an error toast when the list fails', async () => {
  fetch.mockResolvedValue(json({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }, 500));
  renderAt('/admin/blogs');
  expect((await screen.findAllByText('Boom')).length).toBeGreaterThan(0);
});

function expectSanitized() {
  const drawer = document.querySelector('.ant-drawer');
  expect(within(drawer).getByText('Body text')).toBeTruthy();
  expect(drawer.querySelector('script')).toBeNull();
  expect(drawer.querySelector('img[onerror]')).toBeNull();
  expect(drawer.innerHTML).not.toContain('onerror');
  const links = [...drawer.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  expect(links).toContain('https://example.com/a');
  expect(links.some((h) => h?.startsWith('javascript:'))).toBe(false);
}

it('previews a post with sanitized markdown and http(s) sources only', async () => {
  fetch.mockResolvedValueOnce(list([row(1)]));
  renderAt('/admin/blogs');
  await screen.findByText('Post 1');
  fetch.mockResolvedValueOnce(json(full(1)));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Body text');
  expect(fetch.mock.calls[1][0]).toBe('/api/admin/blogs/1');
  expectSanitized();
});

it('opens the preview automatically for ?highlight=<id> and clears it on close', async () => {
  fetch.mockImplementation(async (url) => (url === '/api/admin/blogs/7' ? json(full(7)) : list([row(7)])));
  renderAt('/admin/blogs?highlight=7');
  await screen.findByText('Body text');
  expect(urls()).toContain('/api/admin/blogs/7');
  expectSanitized();
  fireEvent.click(document.querySelector('.ant-drawer-close'));
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/blogs'));
});
