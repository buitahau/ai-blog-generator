import { Router } from 'express';
import { listBlogsQuerySchema } from '../validation/blogsSchema.js';
import { validateQuery } from '../middleware/validate.js';

// Explicit mapping keeps internal columns (status, topic, runId, ...) out of public responses.
const toIso = (d) => (d ? new Date(d).toISOString() : null);

const toListItem = (b) => ({
  id: b.id,
  slug: b.slug,
  title: b.title,
  excerpt: b.excerpt,
  publishedAt: toIso(b.publishedAt),
});

const toDetail = (b) => ({
  id: b.id,
  slug: b.slug,
  title: b.title,
  contentMd: b.contentMd,
  sources: (b.sources ?? []).map(({ title, url }) => ({ title, url })),
  publishedAt: toIso(b.publishedAt),
});

export function createBlogsRouter(repo) {
  const router = Router();

  router.get('/', validateQuery(listBlogsQuerySchema), async (req, res) => {
    const { page, pageSize } = res.locals.query;
    const result = await repo.listPublished({ page, pageSize });
    res.json({
      items: result.items.map(toListItem),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  });

  router.get('/:slug', async (req, res) => {
    const blog = await repo.getPublishedBySlug(req.params.slug);
    if (!blog) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Blog not found.' } });
    }
    res.json(toDetail(blog));
  });

  return router;
}
