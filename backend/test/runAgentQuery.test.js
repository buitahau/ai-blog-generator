import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: queryMock }));

const { runAgentQuery, AgentError } = await import('../src/services/agents/runAgentQuery.js');
const { StreamAbortedError } = await import('../src/services/claude.js');
const { MODEL } = await import('../src/config.js');

const agents = { researcher: { description: 'd', prompt: 'p', tools: ['WebSearch', 'WebFetch'] } };
const base = { subtype: 'success', is_error: false, result: 'notes', num_turns: 2, total_cost_usd: 0.1, usage: { input_tokens: 1 }, stop_reason: 'end_turn' };

function gen(messages) {
  return (async function* () { for (const m of messages) yield m; })();
}
const run = (extra = {}) => runAgentQuery({ agentName: 'researcher', agents, prompt: 'x', limits: { maxTurns: 3, maxBudgetUsd: 0.5 }, ...extra });
const opts = () => queryMock.mock.calls.at(-1)[0].options;

beforeEach(() => {
  queryMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.DATABASE_URL = 'postgres://secret';
  process.env.ADMIN_TOKEN = 'secret-token';
  process.env.TELEGRAM_BOT_TOKEN = 'tg';
});
afterEach(() => vi.restoreAllMocks());

describe('runAgentQuery options', () => {
  it('passes hardened options and no canUseTool', async () => {
    queryMock.mockReturnValue(gen([{ type: 'result', ...base }]));
    const forwarded = [];
    const res = await run({ onMessage: (m) => forwarded.push(m.type) });
    const o = opts();
    expect(o).toMatchObject({
      agent: 'researcher', agents, model: MODEL,
      tools: ['WebSearch', 'WebFetch'], allowedTools: ['WebSearch', 'WebFetch'],
      permissionMode: 'dontAsk', settingSources: [], strictMcpConfig: true, mcpServers: {},
      persistSession: false, maxTurns: 3, maxBudgetUsd: 0.5, includePartialMessages: true,
    });
    expect(o.disallowedTools).toEqual(expect.arrayContaining(['Bash', 'Read', 'Write', 'Edit']));
    expect('canUseTool' in o).toBe(false);
    expect(Object.keys(o.env).sort()).toEqual(['ANTHROPIC_API_KEY', 'HOME', 'PATH']);
    expect(o.env.HOME).toBe(o.cwd);
    expect(forwarded).toEqual(['result']);
    expect(res).toEqual({ resultText: 'notes', subtype: 'success', numTurns: 2, totalCostUsd: 0.1, usage: { input_tokens: 1 }, stopReason: 'end_turn' });
  });

  it('removes the temp dir on success, error and abort', async () => {
    queryMock.mockReturnValue(gen([{ type: 'result', ...base }]));
    await run();
    expect(existsSync(opts().cwd)).toBe(false);

    queryMock.mockReturnValue(gen([{ type: 'result', ...base, subtype: 'error_max_turns' }]));
    await expect(run()).rejects.toBeInstanceOf(AgentError);
    expect(existsSync(opts().cwd)).toBe(false);

    const ac = new AbortController();
    queryMock.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => { ac.abort('cancel'); throw new Error('aborted'); },
      }),
    }));
    await expect(run({ signal: ac.signal })).rejects.toBeInstanceOf(StreamAbortedError);
    expect(existsSync(opts().cwd)).toBe(false);
  });
});

describe('runAgentQuery errors', () => {
  const fail = async (result, assistantError) => {
    const msgs = [];
    if (assistantError) msgs.push({ type: 'assistant', error: assistantError });
    msgs.push({ type: 'result', ...base, ...result });
    queryMock.mockReturnValue(gen(msgs));
    return run().catch((e) => e);
  };

  it.each([
    ['error_max_turns', 'AGENT_MAX_TURNS'],
    ['error_max_budget_usd', 'AGENT_BUDGET_EXCEEDED'],
    ['error_during_execution', 'UPSTREAM_ERROR'],
  ])('maps %s to %s', async (subtype, code) => {
    const err = await fail({ subtype, is_error: true, errors: ['boom'] });
    expect(err).toBeInstanceOf(AgentError);
    expect(err.code).toBe(code);
  });

  it('maps refusal stop to UPSTREAM_ERROR', async () => {
    expect((await fail({ stop_reason: 'refusal' })).code).toBe('UPSTREAM_ERROR');
  });

  it.each([[429, 'RATE_LIMITED'], [529, 'OVERLOADED'], [500, 'UPSTREAM_ERROR']])(
    'success with is_error and status %i maps to %s without leaking text', async (status, code) => {
      const err = await fail({ is_error: true, api_error_status: status, result: 'API Error: secret-detail' });
      expect(err.code).toBe(code);
      expect(err.message).not.toContain('secret-detail');
      expect(console.error).toHaveBeenCalled();
    });

  it('falls back to the last assistant error category', async () => {
    expect((await fail({ is_error: true, result: 'x' }, 'rate_limit')).code).toBe('RATE_LIMITED');
    expect((await fail({ is_error: true, result: 'x' }, 'overloaded')).code).toBe('OVERLOADED');
    expect((await fail({ is_error: true, result: 'x' }, 'server_error')).code).toBe('UPSTREAM_ERROR');
  });

  it('maps a thrown SDK error to UPSTREAM_ERROR without its message', async () => {
    queryMock.mockReturnValue({
      [Symbol.asyncIterator]: () => ({ next: async () => { throw new Error('raw leak'); } }),
    });
    const err = await run().catch((e) => e);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.message).not.toContain('raw leak');
  });

  it('carries signal.reason on abort', async () => {
    const ac = new AbortController();
    ac.abort('timeout');
    const err = await run({ signal: ac.signal }).catch((e) => e);
    expect(err).toBeInstanceOf(StreamAbortedError);
    expect(err.reason).toBe('timeout');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('runAgentQuery guards', () => {
  it.each([
    [undefined], [{}], [{ maxTurns: 0, maxBudgetUsd: 1 }], [{ maxTurns: 3, maxBudgetUsd: Infinity }], [{ maxTurns: '3', maxBudgetUsd: 1 }],
  ])('rejects invalid limits %j before spawning', async (limits) => {
    await expect(run({ limits })).rejects.toThrow(/limits/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown agent before spawning', async () => {
    await expect(run({ agentName: 'nope' })).rejects.toThrow(/Unknown agent/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not call query() when aborted while the temp dir is being created', async () => {
    const ac = new AbortController();
    const p = run({ signal: ac.signal });
    ac.abort('late');
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(StreamAbortedError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rethrows errors from onMessage unchanged', async () => {
    queryMock.mockReturnValue(gen([{ type: 'result', ...base }]));
    const boom = new Error('cb failed');
    const err = await run({ onMessage: () => { throw boom; } }).catch((e) => e);
    expect(err).toBe(boom);
    expect(existsSync(opts().cwd)).toBe(false);
  });

  it.each(['error_max_turns', 'error_max_budget_usd'])('logs %s with cost', async (subtype) => {
    queryMock.mockReturnValue(gen([{ type: 'result', ...base, subtype, is_error: true, errors: ['e'] }]));
    await run().catch(() => {});
    expect(console.error).toHaveBeenCalledWith('Agent run failed:', subtype, 'notes', 'cost:', 0.1);
  });
});
