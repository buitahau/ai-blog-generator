import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { streamGenerate } from '../api/generate.js';
import { useBlogGeneration } from './useBlogGeneration.js';

vi.mock('../api/generate.js', () => ({ streamGenerate: vi.fn() }));

// Each call to the mocked client is captured so tests can drive its callbacks.
let calls;
beforeEach(() => {
  calls = [];
  streamGenerate.mockImplementation((params, opts) => {
    calls.push({ params, ...opts });
    return Promise.resolve();
  });
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tick = () => act(() => vi.advanceTimersByTime(20));

describe('useBlogGeneration', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBlogGeneration());
    expect(result.current.status).toBe('idle');
    expect(result.current.content).toBe('');
  });

  it('streams, batches deltas, and finishes', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({ topic: 'x' }));
    expect(result.current.status).toBe('streaming');
    expect(calls[0].params).toEqual({ topic: 'x' });

    act(() => {
      calls[0].onDelta('Hel');
      calls[0].onDelta('lo');
    });
    expect(result.current.content).toBe(''); // batched until the next frame
    tick();
    expect(result.current.content).toBe('Hello');

    act(() => {
      calls[0].onDelta('!');
      calls[0].onDone({ stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2 } });
    });
    expect(result.current.status).toBe('done');
    expect(result.current.content).toBe('Hello!'); // done flushes the buffer
    expect(result.current.stopReason).toBe('end_turn');
    expect(result.current.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it('cancel aborts the request and keeps partial content', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => calls[0].onDelta('partial'));
    act(() => result.current.cancel());
    expect(calls[0].signal.aborted).toBe(true);
    expect(result.current.status).toBe('cancelled');
    expect(result.current.content).toBe('partial');
    expect(result.current.error).toBeNull();
  });

  it('sets error status and keeps content received so far', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => {
      calls[0].onDelta('abc');
      calls[0].onError({ code: 'STREAM_INTERRUPTED', message: 'cut' });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({ code: 'STREAM_INTERRUPTED', message: 'cut' });
    expect(result.current.content).toBe('abc');
  });

  it('a new generation aborts the previous one and ignores its stale callbacks', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({ topic: 'a' }));
    act(() => calls[0].onDelta('old'));
    act(() => result.current.generate({ topic: 'b' }));
    expect(calls[0].signal.aborted).toBe(true);
    expect(result.current.content).toBe('');

    act(() => {
      calls[0].onDelta('stale');
      calls[0].onDone({ stopReason: 'end_turn' });
      calls[0].onError({ code: 'X', message: 'x' });
      calls[1].onDelta('new');
    });
    tick();
    expect(result.current.status).toBe('streaming');
    expect(result.current.content).toBe('new');
    expect(result.current.error).toBeNull();
  });

  it('a buffered delta from the previous run is dropped on a new generation', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => calls[0].onDelta('unflushed'));
    act(() => result.current.generate({}));
    act(() => calls[1].onDelta('fresh'));
    tick();
    expect(result.current.content).toBe('fresh');
  });

  it('reset returns to idle and aborts', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => result.current.reset());
    expect(calls[0].signal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
  });

  it('reset clears content and error after an error', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => {
      calls[0].onDelta('abc');
      calls[0].onError({ code: 'X', message: 'x' });
    });
    expect(result.current.status).toBe('error');
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.content).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('cancel is a no-op once done', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => {
      calls[0].onDelta('x');
      calls[0].onDone({ stopReason: 'end_turn' });
    });
    act(() => result.current.cancel());
    expect(result.current.status).toBe('done');
    expect(result.current.content).toBe('x');
  });

  it('cancel is a no-op when idle', () => {
    const { result } = renderHook(() => useBlogGeneration());
    act(() => result.current.cancel());
    expect(result.current.status).toBe('idle');
  });

  it('moves to error when streamGenerate rejects', async () => {
    streamGenerate.mockImplementation(() => Promise.reject(new Error('no body')));
    const { result } = renderHook(() => useBlogGeneration());
    await act(async () => {
      result.current.generate({});
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected client error.',
    });
  });

  it('aborts on unmount and writes nothing afterwards', () => {
    const { result, unmount } = renderHook(() => useBlogGeneration());
    act(() => result.current.generate({}));
    act(() => calls[0].onDelta('x'));
    const before = result.current.content;
    unmount();
    expect(calls[0].signal.aborted).toBe(true);
    act(() => {
      calls[0].onDelta('late');
      vi.advanceTimersByTime(20);
    });
    expect(result.current.content).toBe(before);
  });
});
