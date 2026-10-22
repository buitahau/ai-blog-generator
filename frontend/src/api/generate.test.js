import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamGenerate } from './generate.js';

const enc = new TextEncoder();

function sseResponse(chunks, { hang = false, signal } = {}) {
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else if (hang) {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function setup() {
  return { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
}

afterEach(() => vi.unstubAllGlobals());

describe('streamGenerate', () => {
  it('dispatches delta and done on the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        frame('start', {}),
        frame('delta', { text: 'Hel' }) + ': ping\n\n',
        frame('delta', { text: 'lo' }),
        frame('done', { stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2 } }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cb = setup();
    await streamGenerate({ topic: 'abc' }, cb);
    expect(cb.onDelta.mock.calls.map((c) => c[0])).toEqual(['Hel', 'lo']);
    expect(cb.onDone).toHaveBeenCalledWith({
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 2 },
    });
    expect(cb.onError).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ topic: 'abc' });
  });

  it('reports a 400 JSON error with details', async () => {
    const error = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: [{ path: 'topic', message: 'Too short' }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 })));
    const cb = setup();
    await streamGenerate({}, cb);
    expect(cb.onError).toHaveBeenCalledWith(error);
    expect(cb.onDelta).not.toHaveBeenCalled();
  });

  it('reports a mid-stream error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          frame('delta', { text: 'a' }),
          frame('error', { code: 'RATE_LIMITED', message: 'Slow down' }),
        ]),
      ),
    );
    const cb = setup();
    await streamGenerate({}, cb);
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledWith({ code: 'RATE_LIMITED', message: 'Slow down' });
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it('stops quietly on abort without calling onError', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url, init) =>
        Promise.resolve(sseResponse([frame('delta', { text: 'a' })], { hang: true, signal: init.signal })),
      ),
    );
    const cb = setup();
    cb.onDelta.mockImplementation(() => controller.abort());
    await streamGenerate({}, { ...cb, signal: controller.signal });
    expect(cb.onDelta).toHaveBeenCalledWith('a');
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it('does not call onError when fetch itself is aborted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    const controller = new AbortController();
    controller.abort();
    const cb = setup();
    await streamGenerate({}, { ...cb, signal: controller.signal });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('reports STREAM_INTERRUPTED when the stream ends without done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([frame('start', {}), frame('delta', { text: 'a' })])),
    );
    const cb = setup();
    await streamGenerate({}, cb);
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError.mock.calls[0][0].code).toBe('STREAM_INTERRUPTED');
  });

  it('treats abort with a custom reason as cancel (fetch rejection)', async () => {
    const controller = new AbortController();
    controller.abort('unmount');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('unmount'));
    const cb = setup();
    await streamGenerate({}, { ...cb, signal: controller.signal });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('treats abort with a custom reason as cancel (mid-stream)', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url, init) => {
        const body = new ReadableStream({
          pull(c) {
            c.enqueue(enc.encode(frame('delta', { text: 'a' })));
            return new Promise((_, reject) =>
              init.signal.addEventListener('abort', () => reject(init.signal.reason)),
            );
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );
    const cb = setup();
    cb.onDelta.mockImplementation(() => controller.abort(new Error('nav')));
    await streamGenerate({}, { ...cb, signal: controller.signal });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('does not call onError when aborted while reading the HTTP error body', async () => {
    const controller = new AbortController();
    const response = {
      ok: false,
      status: 500,
      text: () => {
        controller.abort('x');
        return Promise.reject('x');
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const cb = setup();
    await streamGenerate({}, { ...cb, signal: controller.signal });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('cancels the reader and logs when a callback throws', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(enc.encode(frame('delta', { text: 'a' })));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cb = setup();
    cb.onDelta.mockImplementation(() => {
      throw new Error('boom');
    });
    await streamGenerate({}, cb);
    expect(cancel).toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('decodes a multi-byte character split across chunks', async () => {
    const bytes = enc.encode(frame('delta', { text: 'é' }) + frame('done', {}));
    const split = bytes.indexOf(0xc3) + 1; // between the two bytes of é
    const body = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, split));
        c.enqueue(bytes.slice(split));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const cb = setup();
    await streamGenerate({}, cb);
    expect(cb.onDelta).toHaveBeenCalledWith('é');
    expect(cb.onDone).toHaveBeenCalled();
  });
});
