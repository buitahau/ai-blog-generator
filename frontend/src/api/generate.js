import { streamSse } from './stream.js';

const ENDPOINT = '/api/generate';

/**
 * POST /api/generate and dispatch SSE events to callbacks.
 * Abort is a cancel: it resolves quietly without calling onError.
 */
export function streamGenerate(params, { signal, onDelta, onDone, onError } = {}) {
  return streamSse(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
    finalEvents: ['done', 'error'],
    endedMessage: 'The stream ended before the post was complete.',
    onError,
    onEvent({ event, data }) {
      if (event === 'delta') {
        if (typeof data?.text === 'string') onDelta?.(data.text);
      } else if (event === 'done') {
        onDone?.(data ?? {});
      } else if (event === 'error') {
        onError?.({
          code: data?.code ?? 'INTERNAL_ERROR',
          message: data?.message ?? 'Unexpected server error.',
        });
      }
      // `start` and unknown events are ignored.
    },
  });
}
