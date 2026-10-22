import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { startRunSchema } from '../validation/runSchema.js';
import { initSse, sendEvent, sendComment } from '../lib/sse.js';
import { FINAL_EVENT_TYPES, RegistryClosedError, RunInProgressError } from '../services/runRegistry.js';
import { HEARTBEAT_MS } from '../config.js';

const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });

// Auth is applied by the parent admin router.
export function createAdminRunsRouter(registry, { heartbeatMs = HEARTBEAT_MS } = {}) {
  const router = Router();

  router.post('/', validate(startRunSchema), (req, res) => {
    try {
      res.status(202).json({ runId: registry.start({ title: req.body.title }) });
    } catch (err) {
      if (err instanceof RunInProgressError) return sendError(res, 409, 'RUN_IN_PROGRESS', 'A run is already in progress.');
      if (err instanceof RegistryClosedError) return sendError(res, 503, 'SERVER_SHUTDOWN', 'The server is shutting down.');
      throw err;
    }
  });

  router.get('/active', (req, res) => {
    res.json({ runId: registry.activeRunId() });
  });

  router.post('/:runId/cancel', (req, res) => {
    if (!registry.cancel(req.params.runId)) return sendError(res, 404, 'NOT_FOUND', 'Run not found.');
    res.status(202).end();
  });

  router.get('/:runId/events', (req, res) => {
    const header = req.get('Last-Event-ID');
    const lastEventId = /^\d+$/.test(header ?? '') ? Number(header) : 0;

    let heartbeat;
    let unsubscribe = () => {};
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    const write = (event) => {
      const { type, ...data } = event;
      // Snapshots are replay-only; giving them an SSE id would move the client's Last-Event-ID backwards.
      sendEvent(res, type, data, type === 'agent_text_snapshot' ? undefined : event.id);
    };
    const sub = registry.subscribe(req.params.runId, {
      lastEventId,
      onEvent(event) {
        write(event);
        if (FINAL_EVENT_TYPES.has(event.type)) {
          close();
          res.end();
        }
      },
    });
    if (!sub) return sendError(res, 404, 'NOT_FOUND', 'Run not found.');
    unsubscribe = sub.unsubscribe;

    // A subscriber leaving only unsubscribes; the run keeps going.
    res.on('close', close);
    initSse(res);
    for (const event of sub.backlog) write(event);
    if (sub.finished) {
      close();
      res.end();
      return;
    }
    heartbeat = setInterval(() => sendComment(res, 'ping'), heartbeatMs);
  });

  return router;
}
