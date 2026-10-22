import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blogs } from '../src/db/schema.js';
import { createBlogsRepo } from '../src/db/blogsRepo.js';
import { createPgliteDb } from './helpers/pgliteDb.js';

const runId = '11111111-1111-4111-8111-111111111111';
const draft = (title, extra = {}) => ({ title, excerpt: 'e', contentMd: '# c', topic: 't', runId, ...extra });

describe('blogsRepo', () => {
  let db;
  let client;
  let repo;
  beforeAll(async () => {
    ({ db, client } = await createPgliteDb());
    repo = createBlogsRepo(db);
  });
  afterAll(() => client.close());
  beforeEach(() => db.delete(blogs));

  it('creates a draft with slug, defaults and no published_at', async () => {
    const row = await repo.createDraft(draft('Tối ưu Đà Nẵng!'));
    expect(row.slug).toBe('toi-uu-da-nang');
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
    expect(row.sources).toEqual([]);
    expect(await repo.getById(row.id)).toMatchObject({ id: row.id });
    expect(await repo.getById(999999)).toBeNull();
  });

  it('retries with -2, -3 on slug collision via the real driver error', async () => {
    const a = await repo.createDraft(draft('Same'));
    const b = await repo.createDraft(draft('Same'));
    const c = await repo.createDraft(draft('Same'));
    expect([a.slug, b.slug, c.slug]).toEqual(['same', 'same-2', 'same-3']);
  });

  it('gives up after 5 attempts', async () => {
    for (let i = 0; i < 5; i++) await repo.createDraft(draft('Same'));
    await expect(repo.createDraft(draft('Same'))).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(await db.select().from(blogs)).toHaveLength(5);
  });

  it('keeps a suffixed slug within 80 chars', async () => {
    const title = 'word '.repeat(30);
    await repo.createDraft(draft(title));
    const b = await repo.createDraft(draft(title));
    expect(b.slug.length).toBeLessThanOrEqual(80);
    expect(b.slug).toMatch(/[a-z]-2$/);
  });

  it('publish sets published_at, unpublish clears it, updated_at is bumped', async () => {
    const row = await repo.createDraft(draft('Post'));
    const pub = await repo.setStatus(row.id, 'published');
    expect(pub.status).toBe('published');
    expect(pub.publishedAt).toBeInstanceOf(Date);
    expect(pub.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
    const un = await repo.setStatus(row.id, 'draft');
    expect(un.publishedAt).toBeNull();
    expect(await repo.setStatus(999999, 'published')).toBeNull();
  });

  it('publishing twice keeps the first publishedAt', async () => {
    const row = await repo.createDraft(draft('Twice'));
    const first = await repo.setStatus(row.id, 'published');
    await new Promise((r) => setTimeout(r, 20));
    const second = await repo.setStatus(row.id, 'published');
    expect(second.publishedAt.getTime()).toBe(first.publishedAt.getTime());
  });

  it('getPublishedBySlug and listPublished never return drafts', async () => {
    const d = await repo.createDraft(draft('Draft one'));
    const p = await repo.createDraft(draft('Pub one'));
    await repo.setStatus(p.id, 'published');
    expect(await repo.getPublishedBySlug(d.slug)).toBeNull();
    expect((await repo.getPublishedBySlug(p.slug)).id).toBe(p.id);
    const res = await repo.listPublished({ page: 1, pageSize: 10 });
    expect(res.items.map((i) => i.id)).toEqual([p.id]);
    expect(res.total).toBe(1);
  });

  it('paginates and filters listAll; out-of-range pages are empty with correct total', async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(await repo.createDraft(draft(`Post ${i}`)));
    await repo.setStatus(rows[0].id, 'published');
    const first = await repo.listAll({ page: 1, pageSize: 2 });
    expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(first.items).toHaveLength(2);
    expect((await repo.listAll({ page: 3, pageSize: 2 })).items).toHaveLength(1);
    const far = await repo.listAll({ page: 10, pageSize: 2 });
    expect(far.items).toEqual([]);
    expect(far.total).toBe(5);
    expect((await repo.listAll({ status: 'draft' })).total).toBe(4);
    expect((await repo.listAll({ status: 'published' })).total).toBe(1);
    const farPub = await repo.listPublished({ page: 9, pageSize: 2 });
    expect(farPub).toMatchObject({ items: [], total: 1 });
  });

  it('removes a row', async () => {
    const row = await repo.createDraft(draft('Gone'));
    expect(await repo.remove(row.id)).toBe(true);
    expect(await repo.remove(row.id)).toBe(false);
    expect(await repo.getById(row.id)).toBeNull();
  });
});
