import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';

export function createAdminRouter(auth = requireAdmin()) {
  const router = Router();
  router.use(auth);

  router.get('/session', (req, res) => {
    res.status(204).end();
  });

  return router;
}
