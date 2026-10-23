import { Router } from 'express';
import { adminListQuerySchema, blogIdParamsSchema } from '../validation/blogsSchema.js';
import { validateParams, validateQuery } from '../middleware/validate.js';

const toIso = (d) => (d ? new Date(d).toISOString() : null);

const toListItem = (b) => ({
  id: b.id,
  slug: b.slug,
  title: b.title,
  excerpt: b.excerpt,
  status: b.status,
  createdAt: toIso(b.createdAt),
  publishedAt: toIso(b.publishedAt),
});

const toDetail = (b) => ({
  ...toListItem(b),
  contentMd: b.contentMd,
  sources: b.sources ?? [],
  topic: b.topic,
  runId: b.runId,
  updatedAt: toIso(b.updatedAt),
});

const notFound = (res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Blog not found.' } });

// Auth is applied by the parent admin router.
export function createAdminBlogsRouter(repo) {
  const router = Router();

  router.get('/', validateQuery(adminListQuerySchema), async (req, res) => {
    const { status, page, pageSize } = res.locals.query;
    const result = await repo.listAll({ status, page, pageSize });
    res.json({
      items: result.items.map(toListItem),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  });

  router.get('/:id', validateParams(blogIdParamsSchema), async (req, res) => {
    const blog = await repo.getById(res.locals.params.id);
    if (!blog) return notFound(res);
    res.json(toDetail(blog));
  });

  for (const [action, status] of [['publish', 'published'], ['unpublish', 'draft']]) {
    router.post(`/:id/${action}`, validateParams(blogIdParamsSchema), async (req, res) => {
      const blog = await repo.setStatus(res.locals.params.id, status);
      if (!blog) return notFound(res);
      res.json(toDetail(blog));
    });
  }

  router.delete('/:id', validateParams(blogIdParamsSchema), async (req, res) => {
    if (!(await repo.remove(res.locals.params.id))) return notFound(res);
    res.status(204).end();
  });

  return router;
}
