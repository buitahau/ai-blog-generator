import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { cancelRun, getActiveRun, startRun, subscribeRun } from '../api/runs.js';
import { useAgentRun } from './useAgentRun.js';

vi.mock('../api/runs.js', () => ({
  startRun: vi.fn(),
  getActiveRun: vi.fn(),
  cancelRun: vi.fn(),
  subscribeRun: vi.fn(),
}));

// Each subscribeRun call is captured so tests can drive its callbacks.
let subs;
beforeEach(() => {
  subs = [];
  startRun.mockResolvedValue({ runId: 'r1' });
  getActiveRun.mockResolvedValue({ runId: null });
  cancelRun.mockResolvedValue(undefined);
  subscribeRun.mockImplementation((runId, opts) => {
    subs.push({ runId, ...opts });
    return Promise.resolve();
  });
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

const flushPromises = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const tick = (ms = 20) => act(() => vi.advanceTimersByTime(ms));
const send = (sub, id, event, data) => act(() => sub.onEvent({ event, data, id: String(id) }));

async function started() {
  const hook = renderHook(() => useAgentRun());
  await flushPromises();
  await act(() => hook.result.current.start('My title'));
  return hook;
}

describe('useAgentRun', () => {
  it('turns an event sequence into state', async () => {
    const { result } = await started();
    expect(startRun).toHaveBeenCalledWith('My title');
    expect(subs[0].runId).toBe('r1');
    expect(subs[0].lastEventId).toBeUndefined();
    const s = subs[0];

    send(s, 1, 'run_started', { runId: 'r1', title: 'My title' });
    send(s, 2, 'agent_started', { agent: 'researcher' });
    send(s, 3, 'agent_text_delta', { agent: 'researcher', text: 'notes ' });
    send(s, 4, 'tool_call', { agent: 'researcher', toolUseId: 't1', name: 'WebSearch', input: { q: 'x' } });
    send(s, 5, 'agent_heartbeat', { agent: 'researcher', toolName: 'WebSearch', elapsedSec: 15 });
    send(s, 6, 'tool_result', { agent: 'researcher', toolUseId: 't1', name: 'WebSearch', ok: true, summary: '3 results' });
    send(s, 7, 'agent_completed', { agent: 'researcher', numTurns: 2, costUsd: 0.1, usage: { inputTokens: 1, outputTokens: 2 } });
    send(s, 8, 'agent_started', { agent: 'writer' });
    send(s, 9, 'agent_text_delta', { agent: 'writer', text: '# Post' });
    send(s, 10, 'agent_completed', { agent: 'writer', numTurns: 1, costUsd: 0.2, usage: { inputTokens: 3, outputTokens: 4 } });
    send(s, 11, 'blog_saved', { blogId: 'b1', slug: 'my-title', title: 'My title', status: 'draft' });
    send(s, 12, 'notification', { channel: 'telegram', status: 'sent' });
    send(s, 13, 'run_completed', { blogId: 'b1', totalCostUsd: 0.3 });
    tick();

    const r = result.current;
    expect(r.status).toBe('done');
    expect(r.runId).toBe('r1');
    expect(r.title).toBe('My title');
    expect(r.steps).toEqual({ research: 'done', write: 'done', save: 'done', notify: 'done' });
    expect(r.instances['researcher:1'].text).toBe('notes ');
    expect(r.instances['researcher:1'].usage).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(r.instances['researcher:1'].costUsd).toBe(0.1);
    expect(r.instances['researcher:1'].heartbeat).toBeNull();
    expect(r.instances['writer:1'].text).toBe('# Post');
    expect(r.blog.slug).toBe('my-title');
    expect(r.notification.status).toBe('sent');
    expect(r.totalCostUsd).toBe(0.3);
    expect(r.history).toEqual([expect.objectContaining({ runId: 'r1', status: 'done', totalCostUsd: 0.3 })]);
  });

  it('attaches tool_result to its toolUseId', async () => {
    const { result } = await started();
    const s = subs[0];
    send(s, 0, 'agent_started', { agent: 'researcher' });
    send(s, 1, 'tool_call', { agent: 'researcher', toolUseId: 'a', name: 'WebSearch', input: {} });
    send(s, 2, 'tool_call', { agent: 'researcher', toolUseId: 'b', name: 'WebFetch', input: {} });
    send(s, 3, 'tool_result', { agent: 'researcher', toolUseId: 'b', name: 'WebFetch', ok: false, errorCode: 'FETCH_FAILED' });
    const [a, b] = result.current.instances['researcher:1'].tools;
    expect(a).toMatchObject({ toolUseId: 'a', status: 'running' });
    expect(b).toMatchObject({ toolUseId: 'b', status: 'error', ok: false, errorCode: 'FETCH_FAILED', input: {} });
  });

  it('batches deltas to at most one state update per frame', async () => {
    let renders = 0;
    const hook = renderHook(() => {
      renders += 1;
      return useAgentRun();
    });
    await flushPromises();
    await act(() => hook.result.current.start('t'));
    const s = subs[0];
    send(s, 0, 'agent_started', { agent: 'writer' });
    const before = renders;
    act(() => {
      for (let i = 0; i < 100; i += 1) s.onEvent({ event: 'agent_text_delta', data: { agent: 'writer', text: 'a' }, id: String(i + 1) });
    });
    expect(hook.result.current.instances['writer:1'].text).toBe('');
    expect(renders).toBe(before);
    tick();
    expect(hook.result.current.instances['writer:1'].text).toHaveLength(100);
    expect(renders).toBe(before + 1);
  });

  it('keeps text order relative to structural events', async () => {
    const { result } = await started();
    const s = subs[0];
    send(s, 0, 'agent_started', { agent: 'writer' });
    act(() => s.onEvent({ event: 'agent_text_delta', data: { agent: 'writer', text: 'abc' }, id: '1' }));
    send(s, 2, 'agent_completed', { agent: 'writer', costUsd: 0, usage: null });
    expect(result.current.instances['writer:1'].text).toBe('abc');
    expect(result.current.instances['writer:1'].status).toBe('completed');
  });

  it('replay starting with a snapshot then deltas gives the full text without duplication', async () => {
    getActiveRun.mockResolvedValue({ runId: 'r9' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    const s = subs[0];
    // the backend sends snapshots without an SSE id
    act(() => s.onEvent({ event: 'agent_started', data: { agent: 'writer', spawn: 1 }, id: '2' }));
    act(() => s.onEvent({ event: 'agent_text_snapshot', data: { agent: 'writer', spawn: 1, text: 'Hello ', upToId: 40 } }));
    act(() => {
      s.onEvent({ event: 'agent_text_delta', data: { agent: 'writer', text: 'wor' }, id: '41' });
      s.onEvent({ event: 'agent_text_delta', data: { agent: 'writer', text: 'ld' }, id: '42' });
    });
    tick();
    expect(result.current.instances['writer:1'].text).toBe('Hello world');
  });

  it('reconnects with the last event id, up to 3 times with backoff', async () => {
    const { result } = await started();
    send(subs[0], 1, 'run_started', { title: 'My title' });
    send(subs[0], 2, 'agent_started', { agent: 'researcher' });

    act(() => subs[0].onError({ code: 'STREAM_INTERRUPTED', message: 'x', lastEventId: '2' }));
    expect(result.current.status).toBe('reconnecting');
    tick(499);
    expect(subs).toHaveLength(1);
    tick(1);
    expect(subs).toHaveLength(2);
    expect(subs[1].lastEventId).toBe('2');

    // a duplicated event from the server is ignored, a new one resumes the run
    send(subs[1], 2, 'agent_started', { agent: 'researcher' });
    send(subs[1], 3, 'agent_text_delta', { agent: 'researcher', text: 'x' });
    tick();
    expect(result.current.status).toBe('running');

    // 3 failed reconnects in a row (no event in between): 500, 1000, 2000ms
    act(() => subs[1].onError({ code: 'NETWORK_ERROR', message: 'x', lastEventId: '3' }));
    tick(500);
    expect(subs[2].lastEventId).toBe('3');
    act(() => subs[2].onError({ code: 'NETWORK_ERROR', message: 'x', lastEventId: '3' }));
    tick(1000);
    expect(subs).toHaveLength(4);
    act(() => subs[3].onError({ code: 'NETWORK_ERROR', message: 'x', lastEventId: '3' }));
    tick(2000);
    expect(subs).toHaveLength(5);
    act(() => subs[4].onError({ code: 'NETWORK_ERROR', message: 'gone', lastEventId: '3' }));
    expect(result.current.status).toBe('error');
    expect(result.current.error.code).toBe('NETWORK_ERROR');
    tick(10000);
    expect(subs).toHaveLength(5);
  });

  it('resets the reconnect budget once events flow again', async () => {
    const { result } = await started();
    send(subs[0], 1, 'run_started', { title: 'My title' });
    // five interruptions, each followed by a new event: never exhausts the budget
    for (let i = 0; i < 5; i += 1) {
      act(() => subs[i].onError({ code: 'STREAM_INTERRUPTED', message: 'x' }));
      tick(500); // delay stays at the first backoff step
      expect(subs).toHaveLength(i + 2);
      send(subs[i + 1], i + 2, 'agent_started', { agent: 'researcher' });
      expect(result.current.status).toBe('running');
    }
  });

  it('gives RUN_LOST when the run disappears during a reconnect', async () => {
    const { result } = await started();
    send(subs[0], 1, 'run_started', { title: 'My title' });
    act(() => subs[0].onError({ code: 'STREAM_INTERRUPTED', message: 'x' }));
    tick(500);
    act(() => subs[1].onError({ code: 'NOT_FOUND', message: 'nope' }));
    expect(result.current.status).toBe('error');
    expect(result.current.error.code).toBe('RUN_LOST');
  });

  it('reattached run that streamed events then disappears ends in RUN_LOST', async () => {
    getActiveRun.mockResolvedValue({ runId: 'r5' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    send(subs[0], 1, 'run_started', { title: 'My title' });
    act(() => subs[0].onError({ code: 'STREAM_INTERRUPTED', message: 'x' }));
    tick(500);
    act(() => subs[1].onError({ code: 'NOT_FOUND', message: 'nope' }));
    expect(result.current.status).toBe('error');
    expect(result.current.error.code).toBe('RUN_LOST');
  });

  it('reattach 404 before any event (even after a reconnect) ends in idle', async () => {
    getActiveRun.mockResolvedValue({ runId: 'r5' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    act(() => subs[0].onError({ code: 'STREAM_INTERRUPTED', message: 'x' }));
    tick(500);
    act(() => subs[1].onError({ code: 'NOT_FOUND', message: 'nope' }));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('direct reattach() surfaces a getActiveRun failure; the mount probe stays silent', async () => {
    getActiveRun.mockRejectedValue({ code: 'HTTP_ERROR', message: 'boom' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    expect(result.current.error).toBeNull();
    await act(() => result.current.reattach());
    expect(result.current.error.code).toBe('HTTP_ERROR');
  });

  it('cancel during starting cancels once the run id is known', async () => {
    let resolveStart;
    startRun.mockReturnValue(new Promise((r) => { resolveStart = r; }));
    const hook = renderHook(() => useAgentRun());
    await flushPromises();
    let p;
    act(() => { p = hook.result.current.start('t'); });
    expect(hook.result.current.status).toBe('starting');
    await act(() => hook.result.current.cancel());
    expect(hook.result.current.cancelling).toBe(true);
    expect(cancelRun).not.toHaveBeenCalled();
    await act(async () => { resolveStart({ runId: 'r1' }); await p; });
    expect(cancelRun).toHaveBeenCalledWith('r1');
  });

  it('cancel during starting that fails surfaces an error and clears cancelling', async () => {
    let resolveStart;
    startRun.mockReturnValue(new Promise((r) => { resolveStart = r; }));
    cancelRun.mockRejectedValue({ code: 'HTTP_ERROR', message: 'nope' });
    const hook = renderHook(() => useAgentRun());
    await flushPromises();
    let p;
    act(() => { p = hook.result.current.start('t'); });
    await act(() => hook.result.current.cancel());
    await act(async () => { resolveStart({ runId: 'r1' }); await p; });
    await flushPromises();
    expect(hook.result.current.cancelling).toBe(false);
    expect(hook.result.current.error).toEqual({ code: 'HTTP_ERROR', message: 'nope' });
    expect(hook.result.current.status).toBe('running');
  });

  it('reset() unsubscribes and returns to idle, keeping history', async () => {
    const { result } = await started();
    send(subs[0], 1, 'run_completed', { totalCostUsd: 0 });
    expect(result.current.history).toHaveLength(1);
    act(() => result.current.reset());
    expect(subs[0].signal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.runId).toBeNull();
    expect(result.current.history).toHaveLength(1);
  });

  it('reattach() after a 409 attaches to the run already going', async () => {
    startRun.mockRejectedValue({ code: 'RUN_IN_PROGRESS', message: 'busy' });
    const hook = renderHook(() => useAgentRun());
    await flushPromises();
    await act(() => hook.result.current.start('t'));
    expect(hook.result.current.error.code).toBe('RUN_IN_PROGRESS');
    getActiveRun.mockResolvedValue({ runId: 'live' });
    await act(() => hook.result.current.reattach());
    expect(hook.result.current.status).toBe('running');
    expect(hook.result.current.runId).toBe('live');
    expect(hook.result.current.error).toBeNull();
    expect(subs.at(-1).runId).toBe('live');
  });

  it('surfaces a 409 from start as an error', async () => {
    startRun.mockRejectedValue({ code: 'RUN_IN_PROGRESS', message: 'busy' });
    const hook = renderHook(() => useAgentRun());
    await flushPromises();
    await act(() => hook.result.current.start('t'));
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.error).toEqual({ code: 'RUN_IN_PROGRESS', message: 'busy' });
    expect(subscribeRun).not.toHaveBeenCalled();
  });

  it('does not reconnect on UNAUTHORIZED and reports it', async () => {
    const { result } = await started();
    act(() => subs[0].onError({ code: 'UNAUTHORIZED', message: 'no' }));
    tick(10000);
    expect(subs).toHaveLength(1);
    expect(result.current.error.code).toBe('UNAUTHORIZED');
  });

  it('unmount unsubscribes without cancelling the run', async () => {
    const { unmount } = await started();
    const signal = subs[0].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(cancelRun).not.toHaveBeenCalled();
  });

  it('cancel calls cancelRun and finishes on run_cancelled', async () => {
    const { result } = await started();
    send(subs[0], 1, 'run_started', { title: 'My title' });
    await act(() => result.current.cancel());
    expect(cancelRun).toHaveBeenCalledWith('r1');
    expect(result.current.cancelling).toBe(true);
    send(subs[0], 2, 'run_cancelled', {});
    expect(result.current.status).toBe('cancelled');
    expect(result.current.cancelling).toBe(false);
  });

  it('records a failed agent and a server error event', async () => {
    const { result } = await started();
    send(subs[0], 1, 'agent_started', { agent: 'researcher' });
    send(subs[0], 2, 'agent_status', { agent: 'researcher', state: 'retrying', category: 'rate_limit', attempt: 1 });
    expect(result.current.instances['researcher:1'].retrying).toEqual({ category: 'rate_limit', attempt: 1 });
    send(subs[0], 3, 'agent_status', { agent: 'researcher', state: 'failed', category: 'rate_limit' });
    expect(result.current.instances['researcher:1'].status).toBe('failed');
    send(subs[0], 4, 'error', { agent: 'researcher', spawn: 1, code: 'RUN_TIMEOUT', message: 'timed out' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatchObject({ code: 'RUN_TIMEOUT' });
    expect(result.current.steps.research).toBe('failed');
  });

  it('tracks two researcher spawns as separate instances in order; no spawn maps to :1', async () => {
    const { result } = await started();
    const s = subs[0];
    send(s, 1, 'agent_started', { agent: 'orchestrator', spawn: 1 });
    send(s, 2, 'agent_started', { agent: 'researcher' });
    send(s, 3, 'agent_text_delta', { agent: 'researcher', spawn: 1, text: 'a' });
    send(s, 4, 'agent_completed', { agent: 'researcher', spawn: 1, costUsd: 0, usage: null });
    send(s, 5, 'agent_started', { agent: 'researcher', spawn: 2 });
    send(s, 6, 'agent_text_delta', { agent: 'researcher', spawn: 2, text: 'b' });
    tick();
    const r = result.current;
    expect(r.order).toEqual(['orchestrator:1', 'researcher:1', 'researcher:2']);
    expect(r.instances['researcher:1']).toMatchObject({ text: 'a', status: 'completed' });
    expect(r.instances['researcher:2']).toMatchObject({ text: 'b', status: 'running' });
  });

  it('a snapshot replaces only its own instance and agent_started never resets text', async () => {
    const { result } = await started();
    const s = subs[0];
    send(s, 1, 'agent_started', { agent: 'researcher', spawn: 1 });
    send(s, 2, 'agent_started', { agent: 'researcher', spawn: 2 });
    send(s, 3, 'agent_text_delta', { agent: 'researcher', spawn: 1, text: 'one' });
    send(s, 4, 'agent_text_delta', { agent: 'researcher', spawn: 2, text: 'two' });
    send(s, 5, 'agent_text_snapshot', { agent: 'researcher', spawn: 2, text: 'TWO', upToId: 4 });
    expect(result.current.instances['researcher:1'].text).toBe('one');
    expect(result.current.instances['researcher:2'].text).toBe('TWO');
    send(s, 6, 'agent_started', { agent: 'researcher', spawn: 2 });
    expect(result.current.instances['researcher:2'].text).toBe('TWO');
    expect(result.current.order).toEqual(['researcher:1', 'researcher:2']);
  });

  it('ignores events for unknown instances', async () => {
    const { result } = await started();
    const s = subs[0];
    send(s, 1, 'agent_text_delta', { agent: 'researcher', spawn: 1, text: 'x' });
    send(s, 2, 'tool_call', { agent: 'writer', spawn: 1, toolUseId: 't', name: 'n', input: {} });
    send(s, 3, 'agent_text_snapshot', { agent: 'researcher', spawn: 2, text: 'y', upToId: 1 });
    send(s, 4, 'agent_completed', { agent: 'writer', spawn: 1, costUsd: 0, usage: null });
    tick();
    expect(result.current.instances).toEqual({});
    expect(result.current.order).toEqual([]);
  });

  it('final error marks its spawn failed; without spawn no instance is patched', async () => {
    const a = await started();
    send(subs[0], 1, 'agent_started', { agent: 'researcher', spawn: 1 });
    send(subs[0], 2, 'agent_started', { agent: 'researcher', spawn: 2 });
    send(subs[0], 3, 'error', { agent: 'researcher', spawn: 2, code: 'RESEARCH_EMPTY', message: 'm' });
    expect(a.result.current.instances['researcher:1'].status).toBe('running');
    expect(a.result.current.instances['researcher:2'].status).toBe('failed');
    a.unmount();

    const b = await started();
    const s = subs[subs.length - 1];
    send(s, 1, 'agent_started', { agent: 'researcher', spawn: 1 });
    send(s, 2, 'error', { agent: 'researcher', code: 'RESEARCH_EMPTY', message: 'm' });
    expect(b.result.current.instances['researcher:1'].status).toBe('running');
    expect(b.result.current.order).toEqual(['researcher:1']);
    expect(b.result.current.status).toBe('error');
  });

  it('agent_status failed updates the instance but not the step', async () => {
    const { result } = await started();
    send(subs[0], 1, 'agent_started', { agent: 'researcher', spawn: 1 });
    send(subs[0], 2, 'agent_status', { agent: 'researcher', spawn: 1, state: 'failed', category: 'x' });
    expect(result.current.instances['researcher:1'].status).toBe('failed');
    expect(result.current.steps.research).toBe('active');
  });

  it('reattaches to the active run on mount and replays full state', async () => {
    getActiveRun.mockResolvedValue({ runId: 'r7' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    expect(subs[0].runId).toBe('r7');
    expect(subs[0].lastEventId).toBeUndefined();
    expect(result.current.status).toBe('running');
    send(subs[0], 1, 'run_started', { title: 'Replayed' });
    send(subs[0], 2, 'agent_started', { agent: 'researcher' });
    expect(result.current.title).toBe('Replayed');
    expect(result.current.steps.research).toBe('active');
  });

  it('ends in idle, not error, when the reattached run is gone (404)', async () => {
    getActiveRun.mockResolvedValue({ runId: 'stale' });
    const { result } = renderHook(() => useAgentRun());
    await flushPromises();
    act(() => subs[0].onError({ code: 'NOT_FOUND', message: 'nope' }));
    expect(result.current.status).toBe('idle');
    expect(result.current.runId).toBeNull();
    expect(result.current.error).toBeNull();
    tick(10000);
    expect(subs).toHaveLength(1);
  });

  it('ignores events from a superseded subscription', async () => {
    const { result } = await started();
    const old = subs[0];
    startRun.mockResolvedValue({ runId: 'r2' });
    await act(() => result.current.start('second'));
    expect(old.signal.aborted).toBe(true);
    send(old, 1, 'run_started', { title: 'stale' });
    send(subs[1], 1, 'run_started', { title: 'second' });
    expect(result.current.title).toBe('second');
  });
});
