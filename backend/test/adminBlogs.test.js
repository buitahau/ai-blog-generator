import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';

const TOKEN = 't'.repeat(40);
const auth = { Authorization: `Bearer ${TOKEN}` };

const row = {
  id: 1,
  slug: 'hello',
  title: 'Hello',
  excerpt: 'Ex',
  contentMd: '# Hi',
  topic: 'topic',
  status: 'draft',
  runId: 'r1',
  sources: [{ title: 'S', url: 'https://e.com' }],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  publishedAt: null,
};

const repo = {
  listPublished: vi.fn(),
  getPublishedBySlug: vi.fn(),
  listAll: vi.fn(),
  getById: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
};
const app = createApp({ blogsRepo: repo, adminAuth: requireAdmin(() => TOKEN) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('auth', () => {
  it.each([
    ['get', '/api/admin/blogs'],
    ['get', '/api/admin/blogs/1'],
    ['post', '/api/admin/blogs/1/publish'],
    ['post', '/api/admin/blogs/1/unpublish'],
    ['delete', '/api/admin/blogs/1'],
  ])('%s %s returns 401 without a token', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(repo.listAll).not.toHaveBeenCalled();
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/blogs', () => {
  it('lists with status filter and maps fields', async () => {
    repo.listAll.mockResolvedValue({ items: [row], total: 1, page: 2, pageSize: 5 });
    const res = await request(app).get('/api/admin/blogs?status=draft&page=2&pageSize=5').set(auth);
    expect(res.status).toBe(200);
    expect(repo.listAll).toHaveBeenCalledWith({ status: 'draft', page: 2, pageSize: 5 });
    expect(res.body).toEqual({
      items: [
        {
          id: 1,
          slug: 'hello',
          title: 'Hello',
          excerpt: 'Ex',
          status: 'draft',
          createdAt: '2026-01-01T00:00:00.000Z',
          publishedAt: null,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    });
  });

  it('uses defaults and no status filter', async () => {
    repo.listAll.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    await request(app).get('/api/admin/blogs').set(auth).expect(200);
    expect(repo.listAll).toHaveBeenCalledWith({ status: undefined, page: 1, pageSize: 10 });
  });

  it.each(['pageSize=51', 'pageSize=0', 'page=0', 'status=archived', 'foo=bar'])('rejects ?%s', async (qs) => {
    const res = await request(app).get(`/api/admin/blogs?${qs}`).set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.listAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/blogs/:id', () => {
  it('returns the full record', async () => {
    repo.getById.mockResolvedValue(row);
    const res = await request(app).get('/api/admin/blogs/1').set(auth);
    expect(res.status).toBe(200);
    expect(repo.getById).toHaveBeenCalledWith(1);
    expect(res.body).toMatchObject({
      id: 1,
      contentMd: '# Hi',
      sources: [{ title: 'S', url: 'https://e.com' }],
      topic: 'topic',
      runId: 'r1',
      status: 'draft',
    });
  });

  it('404s for an unknown id', async () => {
    repo.getById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/blogs/99').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe(':id validation', () => {
  it.each(['abc', '0', '-1', '1.5', '2147483648'])('rejects id %s on every route', async (id) => {
    const calls = [
      request(app).get(`/api/admin/blogs/${id}`),
      request(app).post(`/api/admin/blogs/${id}/publish`),
      request(app).post(`/api/admin/blogs/${id}/unpublish`),
      request(app).delete(`/api/admin/blogs/${id}`),
    ];
    for (const call of calls) {
      const res = await call.set(auth);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(repo.getById).not.toHaveBeenCalled();
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

describe('publish / unpublish', () => {
  it('publishes and returns the updated record', async () => {
    const published = { ...row, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') };
    repo.setStatus.mockResolvedValue(published);
    const res = await request(app).post('/api/admin/blogs/1/publish').set(auth);
    expect(res.status).toBe(200);
    expect(repo.setStatus).toHaveBeenCalledWith(1, 'published');
    expect(res.body.status).toBe('published');
    expect(res.body.publishedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('unpublishes to draft', async () => {
    repo.setStatus.mockResolvedValue(row);
    const res = await request(app).post('/api/admin/blogs/1/unpublish').set(auth);
    expect(res.status).toBe(200);
    expect(repo.setStatus).toHaveBeenCalledWith(1, 'draft');
    expect(res.body.publishedAt).toBeNull();
  });

  it('reflects status in the public list via the shared repo', async () => {
    // Stateful fake: the public endpoint must follow admin status changes.
    let status = 'draft';
    repo.setStatus.mockImplementation(async (id, s) => ((status = s), { ...row, status }));
    repo.listPublished.mockImplementation(async () => ({
      items: status === 'published' ? [{ ...row, publishedAt: new Date() }] : [],
      total: status === 'published' ? 1 : 0,
      page: 1,
      pageSize: 10,
    }));
    await request(app).post('/api/admin/blogs/1/publish').set(auth).expect(200);
    expect((await request(app).get('/api/blogs')).body.items).toHaveLength(1);
    await request(app).post('/api/admin/blogs/1/unpublish').set(auth).expect(200);
    expect((await request(app).get('/api/blogs')).body.items).toHaveLength(0);
  });

  it.each(['publish', 'unpublish'])('404s on %s for an unknown id', async (action) => {
    repo.setStatus.mockResolvedValue(null);
    const res = await request(app).post(`/api/admin/blogs/9/${action}`).set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/admin/blogs/:id', () => {
  it('returns 204', async () => {
    repo.remove.mockResolvedValue(true);
    const res = await request(app).delete('/api/admin/blogs/1').set(auth);
    expect(res.status).toBe(204);
    expect(repo.remove).toHaveBeenCalledWith(1);
  });

  it('404s for an unknown id', async () => {
    repo.remove.mockResolvedValue(false);
    const res = await request(app).delete('/api/admin/blogs/9').set(auth);
    expect(res.status).toBe(404);
  });
});
