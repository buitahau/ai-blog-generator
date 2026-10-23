import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { validateQuery } from '../src/middleware/validate.js';
import { listBlogsQuerySchema, PAGE_SIZE_MAX } from '../src/validation/blogsSchema.js';

const row = {
  id: 1,
  slug: 'hello',
  title: 'Hello',
  excerpt: 'Ex',
  contentMd: '# Hi',
  topic: 'secret topic',
  status: 'published',
  runId: 'r1',
  sources: [{ title: 'S', url: 'https://e.com', extra: 'x' }],
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

const repo = { listPublished: vi.fn(), getPublishedBySlug: vi.fn() };
const app = createApp({ blogsRepo: repo });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('validateQuery on Express 5', () => {
  it('applies defaults without assigning req.query', async () => {
    const mini = express();
    mini.get('/', validateQuery(listBlogsQuerySchema), (req, res) => res.json(res.locals.query));
    const res = await request(mini).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ page: 1, pageSize: 10 });
  });
});

describe('GET /api/blogs', () => {
  it('returns camelCase public fields only', async () => {
    repo.listPublished.mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 2 });
    const res = await request(app).get('/api/blogs?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(repo.listPublished).toHaveBeenCalledWith({ page: 1, pageSize: 2 });
    expect(res.body).toEqual({
      items: [{ id: 1, slug: 'hello', title: 'Hello', excerpt: 'Ex', publishedAt: '2026-01-01T00:00:00.000Z' }],
      total: 1,
      page: 1,
      pageSize: 2,
    });
  });

  it('uses defaults', async () => {
    repo.listPublished.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    await request(app).get('/api/blogs').expect(200);
    expect(repo.listPublished).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it.each([`pageSize=${PAGE_SIZE_MAX + 450}`, 'pageSize=0', 'page=0', 'page=abc', 'foo=bar', 'status=draft'])(
    'rejects ?%s',
    async (qs) => {
      const res = await request(app).get(`/api/blogs?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
      expect(repo.listPublished).not.toHaveBeenCalled();
    },
  );

  it('maps DB errors to a safe 500', async () => {
    repo.listPublished.mockRejectedValue(new Error('connection to db.neon.tech failed'));
    const res = await request(app).get('/api/blogs');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('neon');
  });
});

describe('GET /api/blogs/:slug', () => {
  it('returns the published blog', async () => {
    repo.getPublishedBySlug.mockResolvedValue(row);
    const res = await request(app).get('/api/blogs/hello');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      slug: 'hello',
      title: 'Hello',
      contentMd: '# Hi',
      sources: [{ title: 'S', url: 'https://e.com' }],
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('404s for draft or missing slugs', async () => {
    repo.getPublishedBySlug.mockResolvedValue(null);
    const res = await request(app).get('/api/blogs/draft-slug');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps DB errors to a safe 500', async () => {
    repo.getPublishedBySlug.mockRejectedValue(new Error('boom password=x'));
    const res = await request(app).get('/api/blogs/hello');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
