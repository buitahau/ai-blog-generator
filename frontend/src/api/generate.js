import { createSseParser } from './sse.js';
import { readHttpError, safeJson } from './http.js';

const ENDPOINT = '/api/generate';

/**
 * POST /api/generate and dispatch SSE events to callbacks.
 * Abort is a cancel: it resolves quietly without calling onError.
 */
export async function streamGenerate(params, { signal, onDelta, onDone, onError } = {}) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(params),
      signal,
    });
  } catch {
    // signal.reason may be any value, so the error name alone can't identify a cancel.
    if (signal?.aborted) return;
    onError?.({ code: 'NETWORK_ERROR', message: 'Could not reach the server.' });
    return;
  }

  if (!response.ok) {
    const httpError = await readHttpError(response);
    if (signal?.aborted) return;
    onError?.(httpError);
    return;
  }

  const parser = createSseParser();
  const decoder = new TextDecoder();
  let finished = false;

  const dispatch = ({ event, data }) => {
    const payload = safeJson(data);
    if (event === 'delta') {
      if (typeof payload?.text === 'string') onDelta?.(payload.text);
    } else if (event === 'done') {
      finished = true;
      onDone?.(payload ?? {});
    } else if (event === 'error') {
      finished = true;
      onError?.({
        code: payload?.code ?? 'INTERNAL_ERROR',
        message: payload?.message ?? 'Unexpected server error.',
      });
    }
    // `start` and unknown events are ignored.
  };

  const reader = response.body.getReader();
  let callbackFailed = false;
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        try {
          dispatch(frame);
        } catch (err) {
          callbackFailed = true;
          throw err;
        }
        if (finished) break;
      }
    }
    if (!finished) {
      for (const frame of parser.push(decoder.decode())) {
        try {
          dispatch(frame);
        } catch (err) {
          callbackFailed = true;
          throw err;
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    if (callbackFailed) {
      // A throwing consumer callback is a caller bug, not a stream failure.
      console.error('streamGenerate callback threw:', err);
      return;
    }
    if (!finished) {
      onError?.({ code: 'STREAM_INTERRUPTED', message: 'The connection was interrupted.' });
    }
    return;
  } finally {
    // Stops the server from generating further when we stop reading for any reason.
    reader.cancel().catch(() => {});
  }

  if (signal?.aborted) return;
  if (!finished) {
    onError?.({ code: 'STREAM_INTERRUPTED', message: 'The stream ended before the post was complete.' });
  }
}
