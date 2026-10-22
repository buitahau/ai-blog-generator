import { and, count, desc, eq, sql } from 'drizzle-orm';
import { slugify } from '../lib/slug.js';
import { getDb } from './client.js';
import { blogs } from './schema.js';

const MAX_SLUG_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 10;

// drizzle-orm >= 0.44 wraps driver errors in DrizzleQueryError, with the driver error in .cause.
const isUniqueViolation = (err) => (err?.cause?.code ?? err?.code) === '23505';

function paging({ page, pageSize } = {}) {
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const current = Math.max(1, Math.floor(page) || 1);
  return { page: current, pageSize: size, offset: (current - 1) * size };
}

export function createBlogsRepo(db) {
  async function list(where, order, opts) {
    const { page, pageSize, offset } = paging(opts);
    const [items, [{ total }]] = await Promise.all([
      db.select().from(blogs).where(where).orderBy(order, desc(blogs.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(blogs).where(where),
    ]);
    return { items, total, page, pageSize };
  }

  return {
    // Rely on the unique constraint and retry, instead of check-then-insert, to avoid a race.
    async createDraft({ title, excerpt, contentMd, topic, sources = [], runId }) {
      const base = slugify(title);
      for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
        const suffix = attempt === 1 ? '' : `-${attempt}`;
        const slug = `${base.slice(0, 80 - suffix.length).replace(/-+$/, '')}${suffix}`;
        try {
          const [row] = await db
            .insert(blogs)
            .values({ slug, title, excerpt, contentMd, topic, sources, status: 'draft', runId })
            .returning();
          return row;
        } catch (err) {
          if (!isUniqueViolation(err) || attempt === MAX_SLUG_ATTEMPTS) throw err;
        }
      }
    },

    async getById(id) {
      const [row] = await db.select().from(blogs).where(eq(blogs.id, id));
      return row ?? null;
    },

    async getPublishedBySlug(slug) {
      const [row] = await db
        .select()
        .from(blogs)
        .where(and(eq(blogs.slug, slug), eq(blogs.status, 'published')));
      return row ?? null;
    },

    listPublished({ page, pageSize } = {}) {
      return list(eq(blogs.status, 'published'), desc(blogs.publishedAt), { page, pageSize });
    },

    listAll({ status, page, pageSize } = {}) {
      return list(status ? eq(blogs.status, status) : undefined, desc(blogs.createdAt), { page, pageSize });
    },

    async setStatus(id, status) {
      const now = new Date();
      const [row] = await db
        .update(blogs)
        .set({ status, // coalesce keeps the first publish date so re-publishing is idempotent.
          publishedAt: status === 'published' ? sql`coalesce(${blogs.publishedAt}, now())` : null, updatedAt: now })
        .where(eq(blogs.id, id))
        .returning();
      return row ?? null;
    },

    async remove(id) {
      const rows = await db.delete(blogs).where(eq(blogs.id, id)).returning({ id: blogs.id });
      return rows.length > 0;
    },
  };
}

// Bound lazily so importing this module never requires DATABASE_URL.
let defaultRepo;
const repo = () => (defaultRepo ??= createBlogsRepo(getDb()));
export const blogsRepo = {
  createDraft: (...a) => repo().createDraft(...a),
  getById: (...a) => repo().getById(...a),
  getPublishedBySlug: (...a) => repo().getPublishedBySlug(...a),
  listPublished: (...a) => repo().listPublished(...a),
  listAll: (...a) => repo().listAll(...a),
  setStatus: (...a) => repo().setStatus(...a),
  remove: (...a) => repo().remove(...a),
};
