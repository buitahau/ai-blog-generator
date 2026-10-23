import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }));

vi.mock('../src/services/claude.js', async () => {
  class ClaudeServiceError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  class StreamAbortedError extends Error {}
  return { streamBlogPost: streamMock, ClaudeServiceError, StreamAbortedError };
});

const { createApp } = await import('../src/app.js');
const { ClaudeServiceError, StreamAbortedError } = await import('../src/services/claude.js');
const { HEARTBEAT_MS } = await import('../src/config.js');

const body = { topic: 'Benefits of unit testing', length: 'short' };

function parseEvents(text) {
  return text
    .split('\n\n')
    .filter((f) => f.startsWith('event:'))
    .map((f) => {
      const [e, d] = f.split('\n');
      return { event: e.slice(7), data: JSON.parse(d.slice(6)) };
    });
}

const sseParser = (res, cb) => {
  res.setEncoding('utf8');
  let buf = '';
  res.on('data', (c) => (buf += c));
  res.on('end', () => cb(null, buf));
};

beforeEach(() => {
  streamMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('POST /api/generate', () => {
  it('streams start, delta(s), done with converted usage', async () => {
    streamMock.mockImplementation(async ({ onText }) => {
      onText('Hello');
      onText(' world');
      return { stopReason: 'end_turn', usage: { input_tokens: 5, output_tokens: 7 } };
    });
    const res = await request(createApp()).post('/api/generate').send(body).buffer(true).parse(sseParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(parseEvents(res.body)).toEqual([
      { event: 'start', data: {} },
      { event: 'delta', data: { text: 'Hello' } },
      { event: 'delta', data: { text: ' world' } },
      { event: 'done', data: { stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 7 } } },
    ]);
  });

  it('takes maxTokens from the length preset', async () => {
    streamMock.mockResolvedValue({ stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    await request(createApp()).post('/api/generate').send({ ...body, length: 'long' }).buffer(true).parse(sseParser);
    const arg = streamMock.mock.calls[0][0];
    expect(arg.maxTokens).toBe(4096);
    expect(arg.system).toContain('blog');
    expect(arg.messages[0].role).toBe('user');
  });

  it('sends a single safe error event on upstream failure', async () => {
    streamMock.mockImplementation(async ({ onText }) => {
      onText('partial');
      throw new ClaudeServiceError('OVERLOADED', 'The service is overloaded. Please retry shortly.');
    });
    const res = await request(createApp()).post('/api/generate').send(body).buffer(true).parse(sseParser);
    const events = parseEvents(res.body);
    expect(events.map((e) => e.event)).toEqual(['start', 'delta', 'error']);
    expect(events[2].data).toEqual({ code: 'OVERLOADED', message: 'The service is overloaded. Please retry shortly.' });
  });

  it('maps unexpected errors to INTERNAL_ERROR without leaking details', async () => {
    streamMock.mockRejectedValue(new Error('secret stack detail'));
    const res = await request(createApp()).post('/api/generate').send(body).buffer(true).parse(sseParser);
    expect(res.body).not.toContain('secret');
    expect(parseEvents(res.body).at(-1)).toEqual({
      event: 'error',
      data: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' },
    });
  });

  it('returns JSON 400 VALIDATION_ERROR (not SSE) and does not call Claude', async () => {
    const res = await request(createApp()).post('/api/generate').send({ topic: 'ok topic', max_tokens: 99999 });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('maps refusal to an error event instead of done', async () => {
    streamMock.mockResolvedValue({ stopReason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } });
    const res = await request(createApp()).post('/api/generate').send(body).buffer(true).parse(sseParser);
    const events = parseEvents(res.body);
    expect(events.map((e) => e.event)).toEqual(['start', 'error']);
    expect(events[1].data.code).toBe('UPSTREAM_ERROR');
  });

  it.each([
    ['max_tokens', 'max_tokens'],
    ['stop_sequence', 'end_turn'],
    ['pause_turn', 'end_turn'],
  ])('narrows stopReason %s to %s', async (sdk, expected) => {
    streamMock.mockResolvedValue({ stopReason: sdk, usage: { input_tokens: 1, output_tokens: 1 } });
    const res = await request(createApp()).post('/api/generate').send(body).buffer(true).parse(sseParser);
    expect(parseEvents(res.body).at(-1).data.stopReason).toBe(expected);
  });

  it('aborts the stream on client disconnect and writes nothing more', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errors = [];
    let serverRes;
    let signal;
    let resolveStarted;
    const started = new Promise((r) => (resolveStarted = r));
    let lateWritten;
    const lateWrite = new Promise((r) => (lateWritten = r));
    streamMock.mockImplementation(
      ({ signal: s, onText }) =>
        new Promise((_, reject) => {
          signal = s;
          onText('first');
          // The SDK may still deliver a chunk after the client is gone; the
          // route must swallow it instead of writing to a closed response.
          s.addEventListener('abort', () => {
            onText('late');
            lateWritten();
            reject(new StreamAbortedError());
          });
          resolveStarted();
        }),
    );
    const server = createApp().listen(0);
    server.on('request', (_req, res) => {
      serverRes = res;
      res.on('error', (e) => errors.push(e));
    });
    try {
      const { port } = server.address();
      const req = http.request({ port, method: 'POST', path: '/api/generate', headers: { 'Content-Type': 'application/json' } });
      req.on('error', () => {});
      req.end(JSON.stringify(body));
      await started;
      expect(signal.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      const writeSpy = vi.spyOn(serverRes, 'write');
      req.destroy();
      await vi.waitFor(() => expect(signal.aborted).toBe(true), { timeout: 1000 });
      await lateWrite;
      await vi.waitFor(() => expect(infoSpy).toHaveBeenCalledWith('Generation aborted by client.'));
      expect(writeSpy).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
      expect(console.error).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('sends ping heartbeats and clears the timer on finish', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let finish;
    streamMock.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }))),
    );
    const server = createApp().listen(0);
    try {
      const { port } = server.address();
      const chunks = [];
      const done = new Promise((resolve) => {
        const req = http.request({ port, method: 'POST', path: '/api/generate', headers: { 'Content-Type': 'application/json' } }, (res) => {
          res.setEncoding('utf8');
          res.on('data', (c) => chunks.push(c));
          res.on('end', resolve);
        });
        req.end(JSON.stringify(body));
      });
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      vi.advanceTimersByTime(HEARTBEAT_MS);
      await vi.waitFor(() => expect(chunks.join('')).toContain(': ping\n\n'));
      finish();
      await done;
      expect(vi.getTimerCount()).toBe(0);
      const pings = () => chunks.join('').split(': ping').length - 1;
      const before = pings();
      vi.advanceTimersByTime(HEARTBEAT_MS * 2);
      expect(pings()).toBe(before);
      expect(chunks.join('')).toContain('event: done');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
