import { randomUUID } from 'node:crypto';
import {
  MAX_CONCURRENT_RUNS,
  RUN_EVENT_BUFFER_MAX,
  RUN_RETENTION_MS,
  RUN_TIMEOUT_MS,
  ABORT_GRACE_MS,
  SHUTDOWN_WAIT_MS,
} from '../config.js';
import { blogsRepo as defaultRepo } from '../db/blogsRepo.js';
import { telegramNotifier } from './notifier/index.js';
import { runPipeline as defaultRunPipeline } from './pipeline.js';

// Abort reasons: the registry reads signal.reason to pick the final event.
export class RunCancelledError extends Error {
  constructor() { super('Run cancelled.'); this.name = 'RunCancelledError'; }
}
export class RunTimeoutError extends Error {
  constructor() { super('Run timed out.'); this.name = 'RunTimeoutError'; }
}
export class ServerShutdownError extends Error {
  constructor() { super('Server shutting down.'); this.name = 'ServerShutdownError'; }
}
export class RunInProgressError extends Error {
  constructor() { super('A run is already in progress.'); this.name = 'RunInProgressError'; }
}
export class RegistryClosedError extends Error {
  constructor() { super('The server is shutting down.'); this.name = 'RegistryClosedError'; }
}

export const FINAL_EVENT_TYPES = new Set(['run_completed', 'run_cancelled', 'error']);

const STATUS_BY_FINAL = { run_completed: 'completed', run_cancelled: 'cancelled', error: 'failed' };

function abortFinalEvent(reason) {
  if (reason instanceof RunCancelledError) return { type: 'run_cancelled' };
  if (reason instanceof RunTimeoutError) {
    return { type: 'error', code: 'RUN_TIMEOUT', message: 'The run exceeded the time limit.' };
  }
  if (reason instanceof ServerShutdownError) {
    return { type: 'error', code: 'SERVER_SHUTDOWN', message: 'The server is shutting down.' };
  }
  return { type: 'error', code: 'INTERNAL_ERROR', message: 'The run failed unexpectedly.' };
}

export function createRunRegistry({
  runPipeline = defaultRunPipeline,
  repo = defaultRepo,
  notifier = telegramNotifier,
  maxConcurrent = MAX_CONCURRENT_RUNS,
  bufferMax = RUN_EVENT_BUFFER_MAX,
  timeoutMs = RUN_TIMEOUT_MS,
  retentionMs = RUN_RETENTION_MS,
  shutdownWaitMs = SHUTDOWN_WAIT_MS,
  abortGraceMs = ABORT_GRACE_MS,
} = {}) {
  const runs = new Map();
  let closing = false;

  const activeRuns = () => [...runs.values()].filter((r) => r.status === 'running');

  function evictOldestDelta(run) {
    const i = run.events.findIndex((e) => e.type === 'agent_text_delta');
    if (i === -1) return;
    const [delta] = run.events.splice(i, 1);
    // Deltas leave oldest first, so the evicted text is always a prefix of the agent's full text.
    run.evictedText.set(delta.agent, (run.evictedText.get(delta.agent) ?? '') + delta.text);
    run.evictedUpToId = delta.id;
  }

  function emit(run, event) {
    // Nothing may follow a final event, so every subscriber sees the same ending.
    if (run.final) return;
    // id and runId are assigned here so a pipeline can never spoof them.
    const full = { ...event, id: ++run.lastId, runId: run.id };
    run.events.push(full);
    if (run.events.length > bufferMax) evictOldestDelta(run);
    if (FINAL_EVENT_TYPES.has(full.type)) run.final = full;
    for (const listener of [...run.subscribers]) {
      try {
        listener(full);
      } catch (err) {
        console.error('Run subscriber failed:', err?.name);
        run.subscribers.delete(listener);
      }
    }
  }

  function finish(run) {
    clearTimeout(run.timer);
    run.status = STATUS_BY_FINAL[run.final.type];
    run.subscribers.clear();
    run.evictTimer = setTimeout(() => runs.delete(run.id), retentionMs);
    run.evictTimer.unref();
  }

  async function execute(run, title) {
    const { signal } = run.controller;
    const pipeline = Promise.resolve()
      .then(() => runPipeline({ title, signal, emit: (e) => emit(run, e), repo, notifier, runId: run.id }))
      .catch((err) => {
        // An abort is expected and owns its final event below; anything else is a bug.
        if (!signal.aborted) console.error('Run failed:', err);
      });
    // shutdown() waits on this, not on done: done resolves at the grace point even if cleanup continues.
    run.pipeline = pipeline;
    // If the SDK ignores the abort, finish anyway so a stuck pipeline cannot block future runs.
    let graceTimer;
    const gaveUp = new Promise((resolve) => {
      const arm = () => { graceTimer = setTimeout(resolve, abortGraceMs); };
      if (signal.aborted) arm();
      else signal.addEventListener('abort', arm, { once: true });
    });
    await Promise.race([pipeline, gaveUp]);
    clearTimeout(graceTimer);
    if (!run.final) {
      emit(run, signal.aborted
        ? abortFinalEvent(signal.reason)
        : { type: 'error', code: 'INTERNAL_ERROR', message: 'The run failed unexpectedly.' });
    }
    finish(run);
  }

  // Snapshots sit between the old structural events and the retained tail: a reducer that resets
  // an agent's text on agent_started would otherwise wipe the snapshot it just applied.
  function backlogFor(run, lastId) {
    const out = [];
    const snapshot = run.evictedUpToId > lastId;
    for (const e of run.events) if (e.id > lastId && e.id <= run.evictedUpToId) out.push(e);
    if (snapshot) {
      for (const [agent, text] of run.evictedText) {
        out.push({ type: 'agent_text_snapshot', agent, text, upToId: run.evictedUpToId, id: run.evictedUpToId, runId: run.id });
      }
    }
    for (const e of run.events) if (e.id > lastId && e.id > run.evictedUpToId) out.push(e);
    return out;
  }

  return {
    start({ title }) {
      if (closing) throw new RegistryClosedError();
      if (activeRuns().length >= maxConcurrent) throw new RunInProgressError();
      const controller = new AbortController();
      const run = {
        id: randomUUID(),
        status: 'running',
        controller,
        events: [],
        lastId: 0,
        evictedText: new Map(),
        evictedUpToId: 0,
        subscribers: new Set(),
        final: null,
        timer: setTimeout(() => controller.abort(new RunTimeoutError()), timeoutMs),
      };
      runs.set(run.id, run);
      emit(run, { type: 'run_started', title });
      run.done = execute(run, title);
      return run.id;
    },

    // Snapshot of the backlog and the live subscription happen in one tick, so nothing is missed or doubled.
    subscribe(runId, { lastEventId = 0, onEvent }) {
      const run = runs.get(runId);
      if (!run) return null;
      const backlog = backlogFor(run, lastEventId);
      const finished = Boolean(run.final);
      if (!finished) run.subscribers.add(onEvent);
      return { backlog, finished, unsubscribe: () => run.subscribers.delete(onEvent) };
    },

    // Returns false for an unknown run. Cancelling a finished run is a no-op.
    cancel(runId) {
      const run = runs.get(runId);
      if (!run) return false;
      if (run.status === 'running') run.controller.abort(new RunCancelledError());
      return true;
    },

    activeRunId() {
      return activeRuns()[0]?.id ?? null;
    },

    async shutdown() {
      closing = true;
      const active = activeRuns();
      for (const run of active) run.controller.abort(new ServerShutdownError());
      let timer;
      const limit = new Promise((resolve) => { timer = setTimeout(resolve, shutdownWaitMs); });
      await Promise.race([Promise.all(active.map((r) => r.pipeline)), limit]);
      clearTimeout(timer);
      for (const run of runs.values()) clearTimeout(run.evictTimer);
    },
  };
}

export const runRegistry = createRunRegistry();
