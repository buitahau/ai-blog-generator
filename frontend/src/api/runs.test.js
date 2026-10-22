import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { subscribeRun, startRun, getActiveRun, cancelRun } from './runs.js';
import { getToken, setToken } from './auth.js';

const enc = new TextEncoder();

function sseResponse(chunks, { hang = false, signal } = {}) {
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else if (hang) {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      } else controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const frame = (id, event, data) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

beforeEach(() => setToken('tok'));
afterEach(() => vi.unstubAllGlobals());

describe('subscribeRun', () => {
  it('sends auth + Last-Event-ID headers and plumbs ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([frame(5, 'step', { n: 1 }), frame(6, 'run_completed', { ok: true }), frame(7, 'step', {})]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onEvent = vi.fn();
    const onError = vi.fn();
    await subscribeRun('r1', { lastEventId: 4, onEvent, onError });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/runs/r1/events');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['Last-Event-ID']).toBe('4');
    expect(onEvent.mock.calls.map(([e]) => [e.event, e.id])).toEqual([
      ['step', '5'],
      ['run_completed', '6'],
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['run_cancelled', 'error'])('treats %s as final', async (name) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([frame(1, name, {})])));
    const onError = vi.fn();
    await subscribeRun('r1', { onEvent: vi.fn(), onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports STREAM_INTERRUPTED with the last id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([frame(1, 'step', {}), frame(2, 'step', {})])));
    const onError = vi.fn();
    await subscribeRun('r1', { onEvent: vi.fn(), onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'STREAM_INTERRUPTED', lastEventId: '2' });
  });

  it('keeps the resume id when the stream ends with no new frames', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([])));
    const onError = vi.fn();
    await subscribeRun('r1', { lastEventId: '5', onEvent: vi.fn(), onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'STREAM_INTERRUPTED', lastEventId: '5' });
  });

  it('aborts quietly without onError', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([frame(1, 'step', {})], { hang: true, signal: controller.signal })),
    );
    const onError = vi.fn();
    const onEvent = vi.fn(() => controller.abort());
    await subscribeRun('r1', { signal: controller.signal, onEvent, onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it('clears the token and reports UNAUTHORIZED on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'nope' } }), { status: 401 }),
      ),
    );
    const onError = vi.fn();
    await subscribeRun('r1', { onEvent: vi.fn(), onError });
    expect(onError.mock.calls[0][0].code).toBe('UNAUTHORIZED');
    expect(getToken()).toBeFalsy();
  });
});

describe('run requests', () => {
  it('startRun / getActiveRun / cancelRun hit the right endpoints with Bearer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"runId":"r1"}', { status: 202 }))
      .mockResolvedValueOnce(new Response('{"runId":null}', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await startRun('T')).toEqual({ runId: 'r1' });
    expect(await getActiveRun()).toEqual({ runId: null });
    await cancelRun('r1');
    const [a, b, c] = fetchMock.mock.calls;
    expect(a[0]).toBe('/api/admin/runs');
    expect(a[1].method).toBe('POST');
    expect(a[1].body).toBe('{"title":"T"}');
    expect(a[1].headers.Authorization).toBe('Bearer tok');
    expect(b[0]).toBe('/api/admin/runs/active');
    expect(c[0]).toBe('/api/admin/runs/r1/cancel');
    expect(c[1].method).toBe('POST');
  });
});
