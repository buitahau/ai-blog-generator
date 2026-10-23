import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BlogListPage from './BlogListPage.jsx';

const post = (n) => ({ id: n, slug: `post-${n}`, title: `Post ${n}`, excerpt: `Excerpt ${n}`, publishedAt: '2026-01-01T00:00:00Z' });
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BlogListPage />
    </MemoryRouter>,
  );

it('lists posts with links to the detail page', async () => {
  fetch.mockResolvedValue(json({ items: [post(1), post(2)], total: 2, page: 1, pageSize: 10 }));
  renderAt('/');
  const link = await screen.findByRole('link', { name: 'Post 1' });
  expect(link.getAttribute('href')).toBe('/blogs/post-1');
  expect(fetch.mock.calls[0][0]).toBe('/api/blogs?page=1&pageSize=10');
});

it('loads the page from ?page= and aborts on unmount', async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const first = renderAt('/?page=2');
  expect(fetch.mock.calls[0][0]).toBe('/api/blogs?page=2&pageSize=10');
  const signal = fetch.mock.calls[0][1].signal;
  first.unmount();
  expect(signal.aborted).toBe(true);
});

it('changes page through the pagination control', async () => {
  fetch.mockResolvedValue(json({ items: [post(1)], total: 12, page: 1, pageSize: 10 }));
  renderAt('/');
  await screen.findByText('Post 1');
  const signal = fetch.mock.calls[0][1].signal;
  fireEvent.click(screen.getByTitle('2'));
  await waitFor(() => expect(fetch.mock.calls[1][0]).toBe('/api/blogs?page=2&pageSize=10'));
  expect(signal.aborted).toBe(true);
});

it('shows the empty state for an out-of-range page', async () => {
  fetch.mockResolvedValue(json({ items: [], total: 12, page: 9, pageSize: 10 }));
  renderAt('/?page=9');
  expect(await screen.findByText('No posts found')).toBeTruthy();
});

it('clamps a page above the backend max and offers a way back', async () => {
  fetch.mockResolvedValueOnce(json({ items: [], total: 12, page: 1000000, pageSize: 10 }));
  renderAt('/?page=2000000');
  expect(fetch.mock.calls[0][0]).toBe('/api/blogs?page=1000000&pageSize=10');
  expect(await screen.findByText('No posts found')).toBeTruthy();
  fetch.mockResolvedValueOnce(json({ items: [post(1)], total: 12, page: 1, pageSize: 10 }));
  fireEvent.click(screen.getByRole('button', { name: /back to first page/i }));
  expect(await screen.findByText('Post 1')).toBeTruthy();
  expect(fetch.mock.calls[1][0]).toBe('/api/blogs?page=1&pageSize=10');
});

it('treats an exponent-form page as the max, not "1e+21"', async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  renderAt('/?page=1e21');
  expect(fetch.mock.calls[0][0]).toBe('/api/blogs?page=1000000&pageSize=10');
});

it('shows an error Alert and retries', async () => {
  fetch.mockResolvedValueOnce(json({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }, 500));
  fetch.mockResolvedValueOnce(json({ items: [post(1)], total: 1, page: 1, pageSize: 10 }));
  renderAt('/');
  expect(await screen.findByText('Boom')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('Post 1')).toBeTruthy();
});
