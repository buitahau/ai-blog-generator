import { useCallback, useEffect, useRef, useState } from 'react';
import { streamGenerate } from '../api/generate.js';

const INITIAL = { status: 'idle', content: '', error: null, stopReason: null, usage: null };

export function useBlogGeneration() {
  const [state, setState] = useState(INITIAL);
  // Each generation gets its own controller; callbacks compare against `current`
  // so a superseded request can never write into the new one's state.
  const current = useRef(null);
  const pending = useRef('');
  const frame = useRef(null);

  const dropBuffer = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pending.current = '';
  }, []);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const text = pending.current;
    pending.current = '';
    if (text) setState((s) => ({ ...s, content: s.content + text }));
  }, []);

  const abortCurrent = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);

  const generate = useCallback(
    (params) => {
      abortCurrent();
      dropBuffer();
      const controller = new AbortController();
      current.current = controller;
      const isLive = () => current.current === controller;

      setState({ ...INITIAL, status: 'streaming' });

      streamGenerate(params, {
        signal: controller.signal,
        onDelta: (text) => {
          if (!isLive()) return;
          pending.current += text;
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        },
        onDone: ({ stopReason, usage } = {}) => {
          if (!isLive()) return;
          flush();
          current.current = null;
          setState((s) => ({
            ...s,
            status: 'done',
            stopReason: stopReason ?? null,
            usage: usage ?? null,
          }));
        },
        onError: (error) => {
          if (!isLive()) return;
          flush();
          current.current = null;
          setState((s) => ({ ...s, status: 'error', error }));
        },
      }).catch(() => {
        // streamGenerate reports nearly everything via onError; this covers throws outside its try.
        if (!isLive()) return;
        flush();
        current.current = null;
        setState((s) => ({
          ...s,
          status: 'error',
          error: { code: 'INTERNAL_ERROR', message: 'Unexpected client error.' },
        }));
      });
    },
    [abortCurrent, dropBuffer, flush],
  );

  const cancel = useCallback(() => {
    if (!current.current) return;
    abortCurrent();
    flush();
    setState((s) => (s.status === 'streaming' ? { ...s, status: 'cancelled' } : s));
  }, [abortCurrent, flush]);

  const reset = useCallback(() => {
    abortCurrent();
    dropBuffer();
    setState(INITIAL);
  }, [abortCurrent, dropBuffer]);

  useEffect(
    () => () => {
      abortCurrent();
      dropBuffer();
    },
    [abortCurrent, dropBuffer],
  );

  return { ...state, generate, cancel, reset };
}
