import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertConfig } from '../src/config.js';
import { getDb } from '../src/db/client.js';
import { blogs } from '../src/db/schema.js';
import { createPgliteDb } from './helpers/pgliteDb.js';

describe('db', () => {
  let db;
  let client;
  beforeAll(async () => {
    ({ db, client } = await createPgliteDb());
  });
  afterAll(() => client.close());

  const row = (slug) => ({
    slug,
    title: 'T',
    excerpt: 'E',
    contentMd: '# hi',
    topic: 'topic',
    status: 'draft',
    runId: '11111111-1111-4111-8111-111111111111',
  });

  it('inserts and selects with defaults applied', async () => {
    const [created] = await db.insert(blogs).values(row('a')).returning();
    expect(created.id).toBeTypeOf('number');
    expect(created.sources).toEqual([]);
    expect(created.publishedAt).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);
    const found = await db.select().from(blogs).where(eq(blogs.slug, 'a'));
    expect(found).toHaveLength(1);
  });

  it('enforces unique slug and the status enum', async () => {
    await db.insert(blogs).values(row('b'));
    await expect(db.insert(blogs).values(row('b'))).rejects.toThrow();
    await expect(db.insert(blogs).values({ ...row('c'), status: 'bogus' })).rejects.toThrow();
  });

  // Must run before anything calls getDb() successfully: the client is cached at module level.
  it('getDb throws when DATABASE_URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '');
    try {
      expect(() => getDb()).toThrow('DATABASE_URL is not set');
    } finally {
      vi.unstubAllEnvs();
    }
    expect(() => assertConfig({ ANTHROPIC_API_KEY: 'k' })).toThrow('missing DATABASE_URL');
  });
});
