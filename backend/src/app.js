import express from 'express';
import generateRouter from './routes/generate.js';
import { createBlogsRouter } from './routes/blogs.js';
import { createAdminRouter } from './routes/admin.js';
import { blogsRepo as defaultBlogsRepo } from './db/blogsRepo.js';

export const BODY_LIMIT = '10kb';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

// express.json() silently skips non-JSON bodies, so reject them explicitly.
function requireJsonContentType(req, res, next) {
  const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'];
  if (BODY_METHODS.has(req.method) && hasBody && !req.is('json')) {
    return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  next();
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 10 KB limit.');
  }
  if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
    return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported charset or encoding.');
  }
  if (err.status >= 400 && err.status < 500) {
    return sendError(res, err.status, 'BAD_REQUEST', err.expose ? err.message : 'Bad request.');
  }
  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
}

export function createApp({ blogsRepo = defaultBlogsRepo, adminAuth } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requireJsonContentType);
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/generate', generateRouter);
  app.use('/api/blogs', createBlogsRouter(blogsRepo));

  app.use('/api/admin', createAdminRouter({ auth: adminAuth, blogsRepo }));

  app.use((req, res) => sendError(res, 404, 'NOT_FOUND', 'Route not found.'));
  app.use(errorHandler);
  return app;
}

export default createApp();
