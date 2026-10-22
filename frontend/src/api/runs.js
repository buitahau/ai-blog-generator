import { adminRequest } from './admin.js';
import { streamSse } from './stream.js';

const BASE = '/api/admin/runs';

/** POST /api/admin/runs -> { runId } */
export const startRun = (title) => adminRequest(BASE, { method: 'POST', body: { title } });

/** GET /api/admin/runs/active -> { runId } (runId is null when nothing is running) */
export const getActiveRun = () => adminRequest(`${BASE}/active`);

/** POST /api/admin/runs/:runId/cancel (202) */
export const cancelRun = (runId) =>
  adminRequest(`${BASE}/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });

/**
 * Subscribe to a run's SSE stream; resumes after `lastEventId` via Last-Event-ID.
 * onEvent({ event, data, id }) receives every server event, including server `error` events
 * (e.g. RUN_TIMEOUT), which are also final. onError({ code, message, lastEventId? }) is for
 * transport/HTTP failures only; lastEventId falls back to the one passed in when resuming.
 */
export function subscribeRun(runId, { lastEventId, signal, onEvent, onError } = {}) {
  const headers = lastEventId === undefined || lastEventId === null ? {} : { 'Last-Event-ID': String(lastEventId) };
  return streamSse(`${BASE}/${encodeURIComponent(runId)}/events`, {
    headers,
    initialLastEventId: lastEventId,
    signal,
    onEvent,
    onError,
    auth: true,
    finalEvents: ['run_completed', 'run_cancelled', 'error'],
  });
}
