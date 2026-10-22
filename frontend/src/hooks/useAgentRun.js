import { useCallback, useEffect, useReducer, useRef } from 'react';
import { cancelRun, getActiveRun, startRun, subscribeRun } from '../api/runs.js';

const MAX_RECONNECTS = 3;
const BACKOFF_BASE_MS = 500;
// Transport failures worth resuming from the last event id; anything else is surfaced.
const RETRYABLE = new Set(['NETWORK_ERROR', 'STREAM_INTERRUPTED', 'HTTP_ERROR']);
const AGENT_STEP = { researcher: 'research', writer: 'write' };
const TERMINAL = new Set(['done', 'cancelled', 'error']);

const newAgent = () => ({ status: 'idle', text: '', tools: [], heartbeat: null, retrying: null, usage: null, costUsd: null });

const freshRun = () => ({
  runId: null,
  title: null,
  status: 'idle', // idle | starting | running | reconnecting | done | cancelled | error
  steps: { research: 'pending', write: 'pending', save: 'pending', notify: 'pending' },
  agents: { researcher: newAgent(), writer: newAgent() },
  blog: null,
  notification: null,
  error: null,
  totalCostUsd: null,
  cancelling: false,
});

export const initialState = { ...freshRun(), history: [] };

const patchAgent = (state, agent, patch) => {
  const current = state.agents[agent];
  if (!current) return state;
  const next = typeof patch === 'function' ? patch(current) : patch;
  return { ...state, agents: { ...state.agents, [agent]: { ...current, ...next } } };
};

const patchStep = (state, step, value) =>
  step ? { ...state, steps: { ...state.steps, [step]: value } } : state;

// Archive the finished run so the chat can show earlier runs from this browser session.
const finish = (state, patch) => {
  const next = { ...state, ...patch, cancelling: false };
  const entry = {
    runId: next.runId,
    title: next.title,
    status: next.status,
    blog: next.blog,
    error: next.error,
    totalCostUsd: next.totalCostUsd,
  };
  return { ...next, history: [...state.history, entry] };
};

function applyEvent(state, { event, data = {} }) {
  switch (event) {
    case 'run_started':
      return { ...state, runId: data.runId ?? state.runId, title: data.title ?? state.title, status: 'running' };
    case 'agent_started':
      return patchStep(patchAgent(state, data.agent, { status: 'running' }), AGENT_STEP[data.agent], 'active');
    case 'agent_text_delta':
      return patchAgent(state, data.agent, (a) => ({ text: a.text + (data.text ?? ''), retrying: null }));
    case 'agent_text_snapshot':
      return patchAgent(state, data.agent, { text: data.text ?? '' });
    case 'tool_call':
      return patchAgent(state, data.agent, (a) => ({
        retrying: null,
        tools: [
          ...a.tools,
          { toolUseId: data.toolUseId, name: data.name, input: data.input, status: 'running', ok: null },
        ],
      }));
    case 'tool_result':
      return patchAgent(state, data.agent, (a) => {
        const result = {
          name: data.name,
          ok: data.ok,
          status: data.ok ? 'ok' : 'error',
          results: data.results,
          summary: data.summary,
          errorCode: data.errorCode,
        };
        const found = a.tools.some((t) => t.toolUseId === data.toolUseId);
        return {
          heartbeat: null,
          tools: found
            ? a.tools.map((t) => (t.toolUseId === data.toolUseId ? { ...t, ...result, name: data.name ?? t.name } : t))
            : [...a.tools, { toolUseId: data.toolUseId, input: undefined, ...result }],
        };
      });
    case 'agent_heartbeat':
      return patchAgent(state, data.agent, { heartbeat: { toolName: data.toolName, elapsedSec: data.elapsedSec } });
    case 'agent_status':
      if (data.state === 'failed') {
        return patchStep(patchAgent(state, data.agent, { status: 'failed', retrying: null, heartbeat: null }), AGENT_STEP[data.agent], 'failed');
      }
      return patchAgent(state, data.agent, { retrying: { category: data.category, attempt: data.attempt } });
    case 'agent_completed':
      return patchStep(
        patchAgent(state, data.agent, {
          status: 'completed',
          heartbeat: null,
          retrying: null,
          usage: data.usage ?? null,
          costUsd: data.costUsd ?? null,
        }),
        AGENT_STEP[data.agent],
        'done',
      );
    case 'blog_saved':
      return patchStep({ ...state, blog: data }, 'save', 'done');
    case 'notification': {
      const step = data.status === 'sent' ? 'done' : data.status === 'failed' ? 'failed' : 'skipped';
      return patchStep({ ...state, notification: data }, 'notify', step);
    }
    case 'run_completed':
      return finish(state, { status: 'done', totalCostUsd: data.totalCostUsd ?? null });
    case 'run_cancelled':
      return finish(state, { status: 'cancelled' });
    case 'error': {
      let next = state;
      if (data.agent) {
        next = patchStep(patchAgent(next, data.agent, { status: 'failed', heartbeat: null, retrying: null }), AGENT_STEP[data.agent], 'failed');
      } else {
        const steps = Object.fromEntries(Object.entries(next.steps).map(([k, v]) => [k, v === 'active' ? 'failed' : v]));
        next = { ...next, steps };
      }
      return finish(next, { status: 'error', error: { code: data.code, message: data.message, agent: data.agent } });
    }
    default:
      return state;
  }
}

export function runReducer(state, action) {
  switch (action.type) {
    case 'begin':
      return { ...freshRun(), history: state.history, status: action.status, runId: action.runId ?? null, title: action.title ?? null };
    case 'attached':
      return { ...state, runId: action.runId, status: 'running' };
    case 'event':
      return applyEvent(state, action.event);
    case 'text_batch': {
      let next = state;
      for (const [agent, text] of Object.entries(action.deltas)) {
        next = patchAgent(next, agent, (a) => ({ text: a.text + text, retrying: null }));
      }
      return next;
    }
    case 'reconnecting':
      return TERMINAL.has(state.status) ? state : { ...state, status: 'reconnecting' };
    case 'resumed':
      return state.status === 'reconnecting' ? { ...state, status: 'running' } : state;
    case 'cancelling':
      return { ...state, cancelling: true };
    case 'failed':
      // A start error has no run to archive; transport errors leave the run unfinished.
      return { ...state, status: 'error', error: action.error, cancelling: false };
    case 'soft_error':
      // E.g. a failed cancel request: the run itself is still going.
      return { ...state, error: action.error, cancelling: false };
    case 'idle':
      return { ...freshRun(), history: state.history };
    default:
      return state;
  }
}

export function useAgentRun() {
  const [state, dispatch] = useReducer(runReducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const sub = useRef(null); // current subscription; callbacks compare against it to ignore superseded ones
  const seq = useRef(0); // bumps on start/mount/unmount to invalidate in-flight async work
  const timer = useRef(null);
  const lastId = useRef(null);
  const attempts = useRef(0);
  const reconnecting = useRef(false);
  const cancelWanted = useRef(false);
  const pending = useRef({});
  const frame = useRef(null);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const deltas = pending.current;
    pending.current = {};
    if (Object.keys(deltas).length) dispatch({ type: 'text_batch', deltas });
  }, []);

  const dropBuffer = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pending.current = {};
  }, []);

  // Only unsubscribes; the run keeps going on the server.
  const unsubscribe = useCallback(() => {
    sub.current?.controller.abort();
    sub.current = null;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Reconnects inside open() need open() itself; reach it through a ref.
  const openRef = useRef(null);

  const open = useCallback(
    (runId, { reattach = false, lastEventId } = {}) => {
      const controller = new AbortController();
      const me = { controller };
      sub.current = me;
      const live = () => sub.current === me;

      const onEvent = (ev) => {
        if (!live()) return;
        const n = Number(ev.id);
        if (ev.id !== undefined && Number.isFinite(n)) {
          if (lastId.current !== null && n <= Number(lastId.current)) return; // already applied
          lastId.current = ev.id;
        }
        if (reconnecting.current) {
          reconnecting.current = false;
          attempts.current = 0; // the budget is for consecutive failures, not the whole run
          dispatch({ type: 'resumed' });
        }
        if (ev.event === 'agent_text_delta' && ev.data?.agent) {
          pending.current[ev.data.agent] = (pending.current[ev.data.agent] ?? '') + (ev.data.text ?? '');
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
          return;
        }
        flush(); // keep order: buffered text lands before the next structural event
        dispatch({ type: 'event', event: ev });
      };

      const onError = (err) => {
        if (!live()) return;
        flush();
        if (err.code === 'NOT_FOUND' && reattach && lastId.current === null) {
          // Stale run id (evicted or server restarted) before any event arrived: back to idle, not an error.
          // Once events have flowed the run was real, so a later NOT_FOUND falls through to RUN_LOST.
          sub.current = null;
          dispatch({ type: 'idle' });
          return;
        }
        if (RETRYABLE.has(err.code) && attempts.current < MAX_RECONNECTS) {
          const delay = BACKOFF_BASE_MS * 2 ** attempts.current;
          attempts.current += 1;
          reconnecting.current = true;
          dispatch({ type: 'reconnecting' });
          const resumeFrom = err.lastEventId ?? lastId.current ?? undefined;
          timer.current = setTimeout(() => {
            timer.current = null;
            if (live()) openRef.current(runId, { reattach, lastEventId: resumeFrom });
          }, delay);
          return;
        }
        if (err.code === 'NOT_FOUND') {
          // The run vanished while we were following it (evicted or server restarted).
          sub.current = null;
          dispatch({ type: 'failed', error: { code: 'RUN_LOST', message: 'The run is no longer available.' } });
          return;
        }
        // UNAUTHORIZED lands here too: api/admin has cleared the token and the route guard redirects.
        sub.current = null;
        dispatch({ type: 'failed', error: { code: err.code, message: err.message } });
      };

      subscribeRun(runId, { lastEventId, signal: controller.signal, onEvent, onError }).catch(() =>
        onError({ code: 'INTERNAL_ERROR', message: 'Unexpected client error.' }),
      );
    },
    [flush],
  );
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const reset = useCallback(() => {
    seq.current += 1;
    unsubscribe();
    dropBuffer();
    dispatch({ type: 'idle' });
  }, [unsubscribe, dropBuffer]);

  const begin = useCallback(
    (runId, opts) => {
      unsubscribe();
      dropBuffer();
      lastId.current = null;
      attempts.current = 0;
      reconnecting.current = false;
      open(runId, opts);
    },
    [unsubscribe, dropBuffer, open],
  );

  const start = useCallback(
    async (title) => {
      seq.current += 1;
      const mine = seq.current;
      unsubscribe();
      dropBuffer();
      cancelWanted.current = false;
      dispatch({ type: 'begin', status: 'starting', title });
      let runId;
      try {
        ({ runId } = await startRun(title));
      } catch (error) {
        if (seq.current !== mine) return;
        dispatch({ type: 'failed', error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'Could not start the run.' } });
        return;
      }
      if (seq.current !== mine) return;
      dispatch({ type: 'attached', runId });
      begin(runId);
      if (cancelWanted.current) {
        cancelWanted.current = false;
        cancelRun(runId).catch((error) => {
          if (seq.current !== mine) return;
          dispatch({ type: 'soft_error', error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'Could not cancel the run.' } });
        });
      }
    },
    [unsubscribe, dropBuffer, begin],
  );

  const cancel = useCallback(async () => {
    const { runId, status, cancelling } = stateRef.current;
    if (cancelling) return;
    if (status === 'starting') {
      cancelWanted.current = true;
      dispatch({ type: 'cancelling' });
      return;
    }
    if (!runId || TERMINAL.has(status) || status === 'idle') return;
    dispatch({ type: 'cancelling' });
    try {
      await cancelRun(runId); // the final run_cancelled event arrives over the open subscription
    } catch (error) {
      dispatch({ type: 'soft_error', error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'Could not cancel the run.' } });
    }
  }, []);

  // Attach to the run already in progress (page reload, back to the chat, or after a RUN_IN_PROGRESS 409).
  // `silent` is for the mount probe, where failing to look is not worth an error.
  const attach = useCallback(
    (silent) => {
      seq.current += 1;
      const mine = seq.current;
      return getActiveRun()
        .then((res) => {
          if (seq.current !== mine || !res?.runId) return;
          dispatch({ type: 'begin', status: 'running', runId: res.runId });
          begin(res.runId, { reattach: true });
        })
        .catch((error) => {
          // UNAUTHORIZED is handled by the route guard.
          if (silent || seq.current !== mine) return;
          dispatch({ type: 'soft_error', error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'Could not look for an active run.' } });
        });
    },
    [begin],
  );
  const reattach = useCallback(() => attach(false), [attach]);

  useEffect(() => {
    attach(true);
    return () => {
      seq.current += 1;
      unsubscribe();
      dropBuffer();
    };
  }, [attach, unsubscribe, dropBuffer]);

  return { ...state, start, cancel, reset, reattach };
}
