import { createSseParser } from './sse.js';
import { readHttpError, safeJson } from './http.js';
import { clearToken, getToken } from './auth.js';

/**
 * Fetch an SSE endpoint and dispatch events: onEvent({ event, data, id }) with `data` JSON-parsed.
 * Events named in `finalEvents` are delivered, then the stream is closed. Transport failures go
 * to onError({ code, message, details?, lastEventId? }). `auth` adds the admin Bearer token and,
 * on a 401, clears it and reports UNAUTHORIZED (redirecting is the route guard's job).
 * Abort is a cancel: it resolves quietly without calling onError. `initialLastEventId` seeds the
 * id reported in onError when resuming; `endedMessage` overrides the text for a stream that ends early.
 */
export async function streamSse(
  url,
  { method = 'GET', body, headers = {}, signal, onEvent, onError, finalEvents = [], auth = false, initialLastEventId, endedMessage = 'The stream ended unexpectedly.' } = {},
) {
  const finals = new Set(finalEvents);
  const reqHeaders = { Accept: 'text/event-stream', ...headers };
  if (auth) reqHeaders.Authorization = `Bearer ${getToken() ?? ''}`;
  // Seeded so a resumed connection that drops before any new event still reports where it was.
  let lastId = initialLastEventId === undefined || initialLastEventId === null ? undefined : String(initialLastEventId);
  const fail = (err) => onError?.(lastId === undefined ? err : { ...err, lastEventId: lastId });

  let response;
  try {
    response = await fetch(url, { method, headers: reqHeaders, body, signal });
  } catch {
    // signal.reason may be any value, so the error name alone can't identify a cancel.
    if (signal?.aborted) return;
    fail({ code: 'NETWORK_ERROR', message: 'Could not reach the server.' });
    return;
  }

  if (!response.ok) {
    const httpError = await readHttpError(response);
    if (signal?.aborted) return;
    if (auth && response.status === 401) {
      clearToken();
      fail({ code: 'UNAUTHORIZED', message: httpError.message });
      return;
    }
    fail(httpError);
    return;
  }

  const parser = createSseParser();
  const decoder = new TextDecoder();
  let finished = false;

  const dispatch = ({ event, data, id }) => {
    if (id !== undefined) lastId = id;
    if (finals.has(event)) finished = true;
    onEvent?.({ event, data: safeJson(data), id });
  };

  const reader = response.body.getReader();
  let callbackFailed = false;
  const dispatchAll = (frames) => {
    for (const frame of frames) {
      try {
        dispatch(frame);
      } catch (err) {
        callbackFailed = true;
        throw err;
      }
      if (finished) break;
    }
  };
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      dispatchAll(parser.push(decoder.decode(value, { stream: true })));
    }
    if (!finished) dispatchAll(parser.push(decoder.decode()));
  } catch (err) {
    if (signal?.aborted) return;
    if (callbackFailed) {
      // A throwing consumer callback is a caller bug, not a stream failure.
      console.error('streamSse callback threw:', err);
      return;
    }
    if (!finished) fail({ code: 'STREAM_INTERRUPTED', message: 'The connection was interrupted.' });
    return;
  } finally {
    // Stops the server from generating further when we stop reading for any reason.
    reader.cancel().catch(() => {});
  }

  if (signal?.aborted) return;
  if (!finished) {
    fail({ code: 'STREAM_INTERRUPTED', message: endedMessage });
  }
}
