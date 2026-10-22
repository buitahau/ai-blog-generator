import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { blogsRepo as defaultBlogsRepo } from '../db/blogsRepo.js';
import { createAdminBlogsRouter } from './adminBlogs.js';

export function createAdminRouter({ auth = requireAdmin(), blogsRepo = defaultBlogsRepo } = {}) {
  const router = Router();
  router.use(auth);

  router.get('/session', (req, res) => {
    res.status(204).end();
  });

  router.use('/blogs', createAdminBlogsRouter(blogsRepo));

  return router;
}
