import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AppRoutes from '../AppRoutes.jsx';
import { clearToken, getToken, setToken } from '../api/auth.js';
import { adminRequest } from '../api/admin.js';

const res = (status, body) => ({ ok: status < 300, status, text: async () => (body ? JSON.stringify(body) : '') });

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AntApp>
        <AppRoutes />
      </AntApp>
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  clearToken();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  clearToken();
  vi.unstubAllGlobals();
});

const login = (value) => {
  fireEvent.change(screen.getByLabelText('Admin token'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
};

it('redirects to login with next when there is no token', () => {
  renderAt('/admin/generate');
  expect(screen.getByTestId('where').textContent).toBe('/admin/login?next=%2Fadmin%2Fgenerate');
  expect(screen.getByRole('heading', { level: 2, name: 'Admin login' })).toBeTruthy();
});

it('navigates to next after a successful check and stores the token', async () => {
  fetch.mockResolvedValue(res(204));
  renderAt('/admin/blogs');
  login('good-token');
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/blogs'));
  expect(getToken()).toBe('good-token');
  expect(localStorage.length).toBe(0);
});

it('shows an error and does not store a wrong token', async () => {
  fetch.mockResolvedValue(res(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));
  renderAt('/admin/generate');
  login('wrong');
  expect(await screen.findByText('Invalid admin token.')).toBeTruthy();
  expect(getToken()).toBeNull();
  expect(screen.getByTestId('where').textContent).toContain('/admin/login');
});

it('sends next=/admin/login to the default page instead of hanging', async () => {
  fetch.mockResolvedValue(res(204));
  renderAt('/admin/login?next=%2Fadmin%2Flogin');
  login('good-token');
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/generate'));
});

it('ignores an off-site next value', async () => {
  fetch.mockResolvedValue(res(204));
  renderAt('/admin/login?next=%2F%2Fevil.com');
  login('good-token');
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/admin/generate'));
});

it('a later 401 clears the token and the guard redirects, keeping next', async () => {
  setToken('abc');
  fetch.mockResolvedValue(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }));
  renderAt('/admin/blogs?x=1');
  expect(screen.getByTestId('where').textContent).toBe('/admin/blogs?x=1');
  await act(async () => {
    await expect(adminRequest('/api/admin/blogs')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  expect(getToken()).toBeNull();
  expect(screen.getByTestId('where').textContent).toBe('/admin/login?next=%2Fadmin%2Fblogs%3Fx%3D1');
});

it('logout clears the token and leaves the admin area', () => {
  setToken('abc');
  renderAt('/admin/blogs');
  fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }));
  expect(getToken()).toBeNull();
  expect(screen.getByTestId('where').textContent).toContain('/admin/login');
});
