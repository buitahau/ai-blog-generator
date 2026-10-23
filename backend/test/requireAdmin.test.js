import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

const TOKEN = 'a'.repeat(32);
const repo = { listPublished: vi.fn(), getPublishedBySlug: vi.fn() };
const app = createApp({ blogsRepo: repo, adminAuth: requireAdmin(() => TOKEN) });

afterEach(() => vi.restoreAllMocks());

function expectUnauthorized(res) {
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHORIZED');
  expect(typeof res.body.error.message).toBe('string');
}

describe('GET /api/admin/session', () => {
  it('returns 204 for a valid token', async () => {
    const res = await request(app).get('/api/admin/session').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(204);
  });

  it('returns 401 for a missing header', async () => {
    expectUnauthorized(await request(app).get('/api/admin/session'));
  });

  it('returns 401 for a wrong scheme', async () => {
    expectUnauthorized(await request(app).get('/api/admin/session').set('Authorization', `Basic ${TOKEN}`));
    expectUnauthorized(await request(app).get('/api/admin/session').set('Authorization', TOKEN));
  });

  it('returns 401 for a wrong or empty token', async () => {
    expectUnauthorized(await request(app).get('/api/admin/session').set('Authorization', `Bearer ${'b'.repeat(32)}`));
    expectUnauthorized(await request(app).get('/api/admin/session').set('Authorization', 'Bearer '));
    expectUnauthorized(await request(app).get('/api/admin/session').set('Authorization', 'Bearer x'));
  });

  it('returns 401 when ADMIN_TOKEN is empty or unset, even for an empty bearer', async () => {
    for (const configured of ['', undefined]) {
      const a = createApp({ blogsRepo: repo, adminAuth: requireAdmin(() => configured) });
      expectUnauthorized(await request(a).get('/api/admin/session').set('Authorization', 'Bearer '));
      expectUnauthorized(await request(a).get('/api/admin/session').set('Authorization', 'Bearer anything'));
    }
  });

  it('reads ADMIN_TOKEN from the environment by default', async () => {
    vi.stubEnv('ADMIN_TOKEN', TOKEN);
    const a = createApp({ blogsRepo: repo });
    expect((await request(a).get('/api/admin/session').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(204);
    vi.unstubAllEnvs();
  });

  it('never logs the token', async () => {
    const spies = ['log', 'error', 'warn', 'info'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await request(app).get('/api/admin/session').set('Authorization', `Bearer ${TOKEN}`);
    await request(app).get('/api/admin/session').set('Authorization', 'Bearer wrong');
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
  });
});
