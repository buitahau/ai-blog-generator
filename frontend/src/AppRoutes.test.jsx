import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './AppRoutes.jsx';

afterEach(cleanup);

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

it.each([
  ['/', 'Blog', 'public'],
  ['/blogs/hello-world', 'hello-world', 'public'],
  ['/admin/login', 'Admin login', 'public'],
  ['/admin/generate', 'Generate', 'admin'],
  ['/admin/blogs', 'Blogs', 'admin'],
])('renders %s', (path, heading, layout) => {
  renderAt(path);
  expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: /logout/i }) !== null).toBe(layout === 'admin');
});

it('shows the admin menu items', () => {
  renderAt('/admin/blogs');
  for (const name of [/generate/i, /blogs/i, /logout/i]) {
    expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  }
});

it('renders a 404 for unknown routes', () => {
  renderAt('/nope');
  expect(screen.getByText('Sorry, the page you visited does not exist.')).toBeTruthy();
});
