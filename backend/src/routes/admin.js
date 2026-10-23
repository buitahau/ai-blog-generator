import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { blogsRepo as defaultBlogsRepo } from '../db/blogsRepo.js';
import { createAdminBlogsRouter } from './adminBlogs.js';
import { createAdminRunsRouter } from './adminRuns.js';
import { runRegistry as defaultRunRegistry } from '../services/runRegistry.js';

export function createAdminRouter({ auth = requireAdmin(), blogsRepo = defaultBlogsRepo, runRegistry = defaultRunRegistry } = {}) {
  const router = Router();
  router.use(auth);

  router.get('/session', (req, res) => {
    res.status(204).end();
  });

  router.use('/blogs', createAdminBlogsRouter(blogsRepo));
  router.use('/runs', createAdminRunsRouter(runRegistry));

  return router;
}
