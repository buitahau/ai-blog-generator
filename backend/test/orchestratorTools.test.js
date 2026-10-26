import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ tools: {}, options: null }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  tool: (name, description, schema, handler) => ({ name, description, schema, handler }),
  createSdkMcpServer: (options) => {
    captured.options = options;
    for (const t of options.tools) captured.tools[t.name] = t;
    return { type: 'sdk', name: options.name };
  },
}));

const { createPipelineServer, PIPELINE_TOOL_NAMES } = await import('../src/services/orchestrator/tools.js');
const { createRunState } = await import('../src/services/orchestrator/state.js');
const { AgentError } = await import('../src/services/agents/runAgentQuery.js');
const { StreamAbortedError } = await import('../src/services/claude.js');
const { PIPELINE_MCP_TIMEOUT_MS } = await import('../src/config.js');

const okResearch = (extra = {}) => ({
  resultText: 'research notes', numTurns: 3, costUsd: 0.4, usage: { input_tokens: 1, output_tokens: 2 },
  sources: [{ url: 'https://e.com/a', title: 'A' }], fetchedOk: 2, searchCount: 3, ...extra,
});
const okWriter = (extra = {}) => ({ resultText: '# Title\n\nBody', numTurns: 1, costUsd: 0.2, usage: {}, ...extra });

function setup(runSub, opts = {}) {
  const state = createRunState('T');
  const events = [];
  const runSignal = opts.signal ?? new AbortController().signal;
  const onFatal = vi.fn();
  createPipelineServer({
    state, signal: runSignal, send: (e) => events.push(e), flush: vi.fn(), runSub, onFatal,
    spawnTimeouts: opts.spawnTimeouts,
  });
  const call = (name, args = {}, extra = {}) => captured.tools[name].handler(args, extra);
  const parse = (res) => JSON.parse(res.content[0].text);
  return { state, events, onFatal, call, parse };
}

beforeEach(() => {
  captured.tools = {};
  captured.options = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('createPipelineServer', () => {
  it('registers the pipeline server with a loose schema', () => {
    setup(vi.fn());
    expect(captured.options).toMatchObject({ name: 'pipeline', alwaysLoad: true, timeout: PIPELINE_MCP_TIMEOUT_MS });
    expect(PIPELINE_TOOL_NAMES).toEqual(['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer']);
    expect(Object.keys(captured.tools)).toEqual(['spawn_researcher', 'spawn_writer']);
    expect(captured.tools.spawn_writer.schema).toEqual({});
  });

  it('runs a researcher and returns only the digest', async () => {
    const runSub = vi.fn().mockResolvedValue(okResearch());
    const { call, parse, events, state } = setup(runSub);
    const res = await call('spawn_researcher', { focus: '  recent news  ' });
    expect(res.isError).toBeUndefined();
    expect(parse(res)).toMatchObject({ agent: 'researcher', spawn: 1, ok: true, sourceCount: 1 });
    expect(JSON.stringify(res)).not.toContain('research notes');
    expect(runSub.mock.calls[0][0]).toMatchObject({ agent: 'researcher', spawn: 1, focus: 'recent news' });
    expect(events.map((e) => e.type)).toEqual(['orchestrator_action', 'agent_started', 'agent_completed']);
    expect(events[0]).toEqual({ type: 'orchestrator_action', action: 'spawn_researcher', accepted: true, spawn: 1, focus: 'recent news' });
    expect(events[2]).toMatchObject({ usage: { inputTokens: 1, outputTokens: 2 } });
    expect(state.busy).toBe(false);
    expect(state.counts.researcher).toBe(1);
    expect(state.spentUsd).toBeCloseTo(0.4);
  });

  it('feeds the writer notes and sources from state, ignoring args', async () => {
    const runSub = vi.fn()
      .mockResolvedValueOnce(okResearch())
      .mockResolvedValueOnce(okWriter());
    const { call, parse, state } = setup(runSub);
    await call('spawn_researcher');
    const res = await call('spawn_writer', { notes: 'INJECTED', sources: [{ url: 'https://evil' }] });
    // Extra keys are invalid for a strict writer schema, so the sub-agent must not run.
    expect(parse(res).errorCode).toBe('INVALID_INPUT');
    expect(runSub).toHaveBeenCalledTimes(1);

    const ok = await call('spawn_writer', {});
    expect(parse(ok)).toMatchObject({ agent: 'writer', ok: true, hasH1: true });
    const arg = runSub.mock.calls[1][0];
    expect(arg.notes).toContain('research notes');
    expect(arg.notes).not.toContain('INJECTED');
    expect(arg.sources).toEqual([{ url: 'https://e.com/a', title: 'A' }]);
    expect(state.draftMd).toBe('# Title\n\nBody');
  });

  it('handles an AgentError: agent_failed, cost counted, isError digest', async () => {
    const runSub = vi.fn().mockRejectedValue(new AgentError('RATE_LIMITED', 'raw upstream text', { costUsd: 0.3 }));
    const { call, parse, events, state, onFatal } = setup(runSub);
    const res = await call('spawn_researcher');
    expect(res.isError).toBe(true);
    expect(parse(res)).toMatchObject({ ok: false, errorCode: 'RATE_LIMITED' });
    expect(events.at(-1)).toEqual({
      type: 'agent_failed', agent: 'researcher', spawn: 1, code: 'RATE_LIMITED', message: 'Rate limited. Please retry shortly.',
    });
    expect(state.spentUsd).toBeCloseTo(0.3);
    expect(state.lastFailure).toEqual({ agent: 'researcher', spawn: 1, code: 'RATE_LIMITED' });
    expect(state.fatal).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
    expect(state.busy).toBe(false);
  });

  it('maps a spawn timeout to AGENT_TIMEOUT and does not treat it as fatal', async () => {
    const runSub = vi.fn(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new StreamAbortedError(signal.reason)), { once: true });
    }));
    const { call, parse, events, state, onFatal } = setup(runSub, { spawnTimeouts: { researcher: 20 } });
    const res = await call('spawn_researcher');
    expect(res.isError).toBe(true);
    expect(parse(res).errorCode).toBe('AGENT_TIMEOUT');
    expect(events.at(-1)).toMatchObject({ type: 'agent_failed', code: 'AGENT_TIMEOUT' });
    expect(state.fatal).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('returns ABORTED and emits nothing after the run signal aborts', async () => {
    const ac = new AbortController();
    const runSub = vi.fn(async ({ signal }) => {
      ac.abort();
      throw new StreamAbortedError(signal.reason);
    });
    const { call, parse, events, onFatal } = setup(runSub, { signal: ac.signal });
    const res = await call('spawn_researcher');
    expect(res.isError).toBe(true);
    expect(parse(res).errorCode).toBe('ABORTED');
    expect(events.map((e) => e.type)).toEqual(['orchestrator_action', 'agent_started']);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('treats extra.signal as an AGENT_TIMEOUT sub-agent failure, not a run abort', async () => {
    const extraAc = new AbortController();
    const runSub = vi.fn(async ({ signal }) => {
      extraAc.abort();
      throw new StreamAbortedError(signal.reason);
    });
    const { call, parse, events, state, onFatal } = setup(runSub);
    const res = await call('spawn_researcher', {}, { signal: extraAc.signal });
    expect(res.isError).toBe(true);
    expect(parse(res).errorCode).toBe('AGENT_TIMEOUT');
    expect(events.at(-1)).toMatchObject({ type: 'agent_failed', agent: 'researcher', spawn: 1, code: 'AGENT_TIMEOUT' });
    expect(state.lastFailure).toEqual({ agent: 'researcher', spawn: 1, code: 'AGENT_TIMEOUT' });
    expect(state.counts.researcher).toBe(1);
    expect(state.fatal).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('rejects a concurrent second call with SPAWN_IN_PROGRESS', async () => {
    let release;
    const runSub = vi.fn(() => new Promise((resolve) => { release = () => resolve(okResearch()); }));
    const { call, parse, events } = setup(runSub);
    const first = call('spawn_researcher');
    const second = await call('spawn_researcher');
    expect(second.isError).toBe(true);
    expect(parse(second).errorCode).toBe('SPAWN_IN_PROGRESS');
    expect(events).toContainEqual({ type: 'orchestrator_action', action: 'spawn_researcher', accepted: false, reason: 'SPAWN_IN_PROGRESS' });
    expect(runSub).toHaveBeenCalledTimes(1);
    release();
    expect((await first).isError).toBeUndefined();
  });

  it.each([
    ['a newline', 'a\nb'],
    ['a control character', 'a\u0007b'],
    ['an angle bracket', '<b>x'],
    ['too long', 'x'.repeat(151)],
    ['a non-string', 42],
  ])('refuses focus with %s without echoing it', async (_label, focus) => {
    const runSub = vi.fn();
    const { call, parse, events, state } = setup(runSub);
    const res = await call('spawn_researcher', { focus });
    expect(res.isError).toBe(true);
    expect(parse(res)).toEqual({ ok: false, errorCode: 'INVALID_INPUT' });
    expect(events).toEqual([{ type: 'orchestrator_action', action: 'spawn_researcher', accepted: false, reason: 'INVALID_INPUT' }]);
    expect(runSub).not.toHaveBeenCalled();
    expect(state.busy).toBe(false);
  });

  it('refuses extra keys on spawn_researcher', async () => {
    const { call, parse } = setup(vi.fn());
    expect(parse(await call('spawn_researcher', { focus: 'ok', other: 1 })).errorCode).toBe('INVALID_INPUT');
  });

  it('refuses a third research pass with LIMIT_REACHED', async () => {
    const runSub = vi.fn().mockResolvedValue(okResearch());
    const { call, parse, events } = setup(runSub);
    await call('spawn_researcher');
    await call('spawn_researcher');
    const res = await call('spawn_researcher');
    expect(parse(res).errorCode).toBe('LIMIT_REACHED');
    expect(events.at(-1)).toEqual({ type: 'orchestrator_action', action: 'spawn_researcher', accepted: false, reason: 'LIMIT_REACHED' });
    expect(runSub).toHaveBeenCalledTimes(2);
  });

  it('refuses when the budget is exhausted', async () => {
    const { call, parse, state } = setup(vi.fn());
    state.spentUsd = 2.6;
    expect(parse(await call('spawn_writer')).errorCode).toBe('BUDGET_EXHAUSTED');
  });

  it('treats an init violation as fatal and calls onFatal', async () => {
    const err = new AgentError('UPSTREAM_ERROR', 'x');
    err.initViolation = true;
    const { call, parse, events, state, onFatal } = setup(vi.fn().mockRejectedValue(err));
    const res = await call('spawn_researcher');
    expect(res.isError).toBe(true);
    expect(parse(res).errorCode).toBe('INTERNAL_ERROR');
    expect(state.fatal).toBe(err);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === 'agent_failed')).toBe(false);
    expect(state.busy).toBe(false);
  });

  it('treats a non-AgentError throw as fatal', async () => {
    const err = new TypeError('bug');
    const { call, state, onFatal } = setup(vi.fn().mockRejectedValue(err));
    await call('spawn_writer');
    expect(state.fatal).toBe(err);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('emits agent_completed then agent_failed for an empty result', async () => {
    const { call, parse, events, state } = setup(vi.fn().mockResolvedValue(okResearch({ resultText: '  ' })));
    const res = await call('spawn_researcher');
    expect(res.isError).toBe(true);
    expect(parse(res)).toMatchObject({ ok: false, errorCode: 'RESEARCH_EMPTY' });
    expect(events.slice(-2).map((e) => e.type)).toEqual(['agent_completed', 'agent_failed']);
    expect(state.spentUsd).toBeCloseTo(0.4);
    expect(state.lastFailure.code).toBe('RESEARCH_EMPTY');
  });

  it('reports WRITER_EMPTY for an empty writer result', async () => {
    const { call, parse, state } = setup(vi.fn().mockResolvedValue(okWriter({ resultText: '' })));
    const res = await call('spawn_writer');
    expect(parse(res)).toMatchObject({ agent: 'writer', ok: false, errorCode: 'WRITER_EMPTY' });
    expect(state.draftMd).toBe('');
  });
});
