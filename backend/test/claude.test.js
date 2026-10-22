import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { streamMock, FakeAPIError, FakeAbortError, FakeConnectionError } = vi.hoisted(() => {
  class FakeAPIError extends Error {
    constructor(status, type) {
      super(`status ${status}`);
      this.status = status;
      this.type = type;
    }
  }
  class FakeAbortError extends FakeAPIError {}
  class FakeConnectionError extends FakeAPIError {}
  return { streamMock: vi.fn(), FakeAPIError, FakeAbortError, FakeConnectionError };
});

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    constructor() {
      this.messages = { stream: streamMock };
    }
  }
  Anthropic.APIError = FakeAPIError;
  Anthropic.APIUserAbortError = FakeAbortError;
  Anthropic.APIConnectionError = FakeConnectionError;
  return { default: Anthropic };
});

const { streamBlogPost, ClaudeServiceError, StreamAbortedError } = await import('../src/services/claude.js');
const { MODEL, MAX_TOKENS_CEILING } = await import('../src/config.js');

function fakeStream({ deltas = [], message, error } = {}) {
  const s = new EventEmitter();
  s.abort = vi.fn();
  s.finalMessage = vi.fn(async () => {
    for (const d of deltas) s.emit('text', d);
    if (error) throw error;
    return message;
  });
  return s;
}

const base = { system: 'sys', messages: [{ role: 'user', content: 'hi' }], maxTokens: 1000 };

beforeEach(() => {
  streamMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('streamBlogPost', () => {
  it('forwards deltas in order and returns stopReason and usage', async () => {
    const usage = { input_tokens: 5, output_tokens: 7 };
    streamMock.mockReturnValue(fakeStream({ deltas: ['a', 'b', 'c'], message: { stop_reason: 'end_turn', usage } }));
    const seen = [];
    const result = await streamBlogPost({ ...base, onText: (t) => seen.push(t) });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ stopReason: 'end_turn', usage });
  });

  it('uses the configured MODEL and passes system/messages', async () => {
    streamMock.mockReturnValue(fakeStream({ message: { stop_reason: 'end_turn', usage: {} } }));
    await streamBlogPost(base);
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL, system: 'sys', messages: base.messages, max_tokens: 1000 }),
    );
  });

  it('clamps maxTokens to the ceiling', async () => {
    streamMock.mockReturnValue(fakeStream({ message: { stop_reason: 'end_turn', usage: {} } }));
    await streamBlogPost({ ...base, maxTokens: MAX_TOKENS_CEILING + 5000 });
    expect(streamMock.mock.calls[0][0].max_tokens).toBe(MAX_TOKENS_CEILING);
  });

  it('aborts the stream when the signal fires and surfaces an abort error', async () => {
    const ctrl = new AbortController();
    const s = fakeStream();
    s.finalMessage = vi.fn(() => new Promise((_, reject) => {
      s.abort.mockImplementation(() => reject(new FakeAbortError()));
    }));
    streamMock.mockReturnValue(s);
    const p = streamBlogPost({ ...base, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(StreamAbortedError);
    expect(s.abort).toHaveBeenCalledOnce();
  });

  it('rejects immediately without calling the SDK if already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(streamBlogPost({ ...base, signal: ctrl.signal })).rejects.toBeInstanceOf(StreamAbortedError);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [529, 'OVERLOADED'],
    [500, 'UPSTREAM_ERROR'],
  ])('maps upstream %i to %s', async (status, code) => {
    streamMock.mockReturnValue(fakeStream({ error: new FakeAPIError(status) }));
    const err = await streamBlogPost(base).catch((e) => e);
    expect(err).toBeInstanceOf(ClaudeServiceError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain(String(status));
    expect(console.error).toHaveBeenCalled();
  });

  it.each([
    ['overloaded_error', 'OVERLOADED'],
    ['rate_limit_error', 'RATE_LIMITED'],
    ['api_error', 'UPSTREAM_ERROR'],
  ])('maps status-less in-stream %s to %s', async (type, code) => {
    streamMock.mockReturnValue(fakeStream({ error: new FakeAPIError(undefined, type) }));
    const err = await streamBlogPost(base).catch((e) => e);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('reach');
  });

  it('keeps the could-not-reach message for connection errors', async () => {
    streamMock.mockReturnValue(fakeStream({ error: new FakeConnectionError(undefined) }));
    const err = await streamBlogPost(base).catch((e) => e);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.message).toContain('reach');
  });

  it.each([undefined, NaN, 0, -5, 1.5])('defaults max_tokens to the ceiling for %s', async (maxTokens) => {
    streamMock.mockReturnValue(fakeStream({ message: { stop_reason: 'end_turn', usage: {} } }));
    await streamBlogPost({ ...base, maxTokens });
    expect(streamMock.mock.calls[0][0].max_tokens).toBe(MAX_TOKENS_CEILING);
  });

  it('maps unknown errors to INTERNAL_ERROR', async () => {
    streamMock.mockReturnValue(fakeStream({ error: new TypeError('boom') }));
    const err = await streamBlogPost(base).catch((e) => e);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).not.toContain('boom');
  });
});
