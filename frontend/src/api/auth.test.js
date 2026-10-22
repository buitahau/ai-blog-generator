import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkToken, clearToken, getToken, setToken } from './auth.js';
import { adminRequest } from './admin.js';

const res = (status, body) => ({ ok: status < 300, status, text: async () => (body ? JSON.stringify(body) : '') });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => {
  clearToken();
  vi.unstubAllGlobals();
});

it('stores the token in sessionStorage only', () => {
  setToken('abc');
  expect(sessionStorage.getItem('adminToken')).toBe('abc');
  expect(localStorage.length).toBe(0);
  clearToken();
  expect(getToken()).toBeNull();
});

it('checkToken sends the bearer header and resolves on 204', async () => {
  fetch.mockResolvedValue(res(204));
  await checkToken('secret');
  expect(fetch).toHaveBeenCalledWith('/api/admin/session', { headers: { Authorization: 'Bearer secret' } });
});

it('checkToken rejects UNAUTHORIZED on 401', async () => {
  fetch.mockResolvedValue(res(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } }));
  await expect(checkToken('bad')).rejects.toEqual({ code: 'UNAUTHORIZED', message: 'nope' });
});

it('adminRequest sends bearer, and on 401 clears the token and rejects UNAUTHORIZED', async () => {
  setToken('abc');
  fetch.mockResolvedValue(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }));
  await expect(adminRequest('/api/admin/blogs')).rejects.toEqual({ code: 'UNAUTHORIZED', message: 'expired' });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  expect(getToken()).toBeNull();
});
