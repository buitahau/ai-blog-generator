import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import BlogDetailPage from './BlogDetailPage.jsx';

const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const blog = (over = {}) => ({
  id: 1,
  slug: 'hello',
  title: 'Hello World',
  contentMd: 'Body text\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
  sources: [
    { title: 'Example', url: 'https://example.com/a' },
    { title: 'Bad', url: 'javascript:alert(1)' },
  ],
  publishedAt: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
};
const renderAt = (entries, index) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/" element={<Where />} />
        <Route path="/blogs/:slug" element={<BlogDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

it('renders title, sanitized content, safe sources and sets document.title', async () => {
  fetch.mockResolvedValue(json(blog()));
  const { container } = renderAt(['/blogs/hello']);
  expect(await screen.findByRole('heading', { level: 1, name: 'Hello World' })).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe('/api/blogs/hello');
  expect(screen.getByText(/Body text/)).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  const link = screen.getByRole('link', { name: 'Example' });
  expect(link.getAttribute('href')).toBe('https://example.com/a');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(screen.queryByText('Bad')).toBeNull();
  expect(document.title).toBe('Hello World | Blog');
});

it('does not render the title twice when contentMd starts with an H1', async () => {
  fetch.mockResolvedValue(json(blog({ contentMd: '# Hello World\n\nBody text' })));
  renderAt(['/blogs/hello']);
  await screen.findByText(/Body text/);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});

it('restores the previous document.title on unmount', async () => {
  document.title = 'Blog Generator';
  fetch.mockResolvedValue(json(blog()));
  const view = renderAt(['/blogs/hello']);
  await screen.findByText('Hello World');
  view.unmount();
  expect(document.title).toBe('Blog Generator');
});

it('omits the Sources section when there are none', async () => {
  fetch.mockResolvedValue(json(blog({ sources: [] })));
  renderAt(['/blogs/hello']);
  await screen.findByText('Hello World');
  expect(screen.queryByText('Sources')).toBeNull();
});

it('shows a 404 Result for a missing post', async () => {
  fetch.mockResolvedValue(json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));
  renderAt(['/blogs/draft']);
  expect(await screen.findByText('This post does not exist.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /back home/i })).toBeTruthy();
});

it('shows an error Alert on network failure and retries', async () => {
  fetch.mockRejectedValueOnce(new TypeError('fail'));
  fetch.mockResolvedValueOnce(json(blog()));
  renderAt(['/blogs/hello']);
  expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('Hello World')).toBeTruthy();
});

it('back goes through history so the list keeps its page number', async () => {
  fetch.mockResolvedValue(json(blog()));
  renderAt(['/?page=3', '/blogs/hello'], 1);
  await screen.findByText('Hello World');
  fireEvent.click(screen.getByRole('button', { name: /back to posts/i }));
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/?page=3'));
});

it('aborts the request on unmount', () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const view = renderAt(['/blogs/hello']);
  const { signal } = fetch.mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
});
