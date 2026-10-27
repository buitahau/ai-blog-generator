import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { runMock, captured } = vi.hoisted(() => ({ runMock: vi.fn(), captured: { tools: {} } }));
vi.mock('../src/services/agents/runAgentQuery.js', async (orig) => ({ ...(await orig()), runAgentQuery: runMock }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  tool: (name, description, schema, handler) => ({ name, handler }),
  createSdkMcpServer: (options) => {
    for (const t of options.tools) captured.tools[t.name] = t;
    return { type: 'sdk', name: options.name };
  },
}));

const { runPipeline, parseTitle, makeExcerpt } = await import('../src/services/pipeline.js');
const { AgentError } = await import('../src/services/agents/runAgentQuery.js');
const { StreamAbortedError } = await import('../src/services/claude.js');

const outcome = (resultText, cost = 0.1) => ({
  resultText, numTurns: 2, totalCostUsd: cost, usage: { input_tokens: 5, output_tokens: 7 },
});
const POST = '# My *Great* Post\n\nFirst [para](https://x.io) with **bold**.\n\n## Section\n\nMore.';
const searchMsg = (url = 'https://src.io/a') => ({
  type: 'user',
  tool_use_result: { results: [{ content: [{ title: 'T', url }] }] },
});
const delta = (text) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

// Scripted orchestrator: runs the steps in order, each one a call of a captured tool handler.
const call = (name, args = {}) => captured.tools[name].handler(args, {});
const research = (args) => () => call('spawn_researcher', args);
const write = () => call('spawn_writer');

let events, emit, repo, notifier;
function script(steps, { cost = 0.05, then } = {}) {
  runMock.mockImplementation(async ({ agentName }) => {
    if (agentName === 'orchestrator') {
      for (const step of steps) await step();
      if (then) throw then;
      return outcome('done', cost);
    }
    throw new Error(`unscripted ${agentName}`);
  });
}
// Sub-agent responses are queued per agent; the orchestrator is scripted above.
function subs({ researcher = [], writer = [] }) {
  const queues = { researcher: [...researcher], writer: [...writer] };
  const orchestrator = runMock.getMockImplementation();
  runMock.mockImplementation(async (opts) => {
    if (opts.agentName === 'orchestrator') return orchestrator(opts);
    const next = queues[opts.agentName].shift();
    return typeof next === 'function' ? next(opts) : next;
  });
}

beforeEach(() => {
  runMock.mockReset();
  captured.tools = {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
  events = [];
  emit = (e) => events.push(e);
  repo = { createDraft: vi.fn(async (d) => ({ id: 7, slug: 'my-great-post', title: d.title })) };
  notifier = { notify: vi.fn(async () => ({ status: 'sent' })) };
});
afterEach(() => vi.restoreAllMocks());

const types = () => events.map((e) => e.type);
const run = (extra = {}) => runPipeline({ runId: 'r1', title: 'Topic', emit, repo, notifier, ...extra });
const researchOk = (url) => async ({ onMessage }) => { await onMessage(searchMsg(url)); return outcome('notes', 0.1); };
const writerOk = async () => outcome(POST, 0.2);

describe('runPipeline', () => {
  it('happy path: ordered events, sources saved, total cost', async () => {
    script([research(), write]);
    subs({ researcher: [researchOk()], writer: [writerOk] });
    const res = await run();
    const flow = events.filter((e) => e.type !== 'agent_text_delta').map((e) => [e.type, e.agent ?? e.action]);
    expect(flow).toEqual([
      ['agent_started', 'orchestrator'],
      ['orchestrator_action', 'spawn_researcher'],
      ['agent_started', 'researcher'],
      ['agent_completed', 'researcher'],
      ['orchestrator_action', 'spawn_writer'],
      ['agent_started', 'writer'],
      ['agent_completed', 'writer'],
      ['agent_completed', 'orchestrator'],
      ['blog_saved', undefined],
      ['notification', undefined],
      ['run_completed', undefined],
    ]);
    expect(events[0]).toEqual({ type: 'agent_started', agent: 'orchestrator', spawn: 1 });
    expect(events.find((e) => e.type === 'agent_completed' && e.agent === 'researcher')).toMatchObject({ spawn: 1, costUsd: 0.1 });
    expect(repo.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: 'My Great Post',
      excerpt: 'First para with bold.',
      topic: 'Topic',
      runId: 'r1',
      sources: [{ title: 'T', url: 'https://src.io/a' }],
    }));
    expect(events.at(-1).blogId).toBe(7);
    expect(events.at(-1).totalCostUsd).toBeCloseTo(0.35);
    expect(events.at(-3)).toEqual({ type: 'blog_saved', blogId: 7, slug: 'my-great-post', title: 'My Great Post', status: 'draft' });
    expect(res.status).toBe('completed');
  });

  it('orchestrator runs with the pipeline server and both tool names', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    await run();
    const orch = runMock.mock.calls.find(([o]) => o.agentName === 'orchestrator')[0];
    expect(orch.mcpServers).toEqual({ pipeline: { type: 'sdk', name: 'pipeline' } });
    expect(orch.extraAllowedTools).toEqual(['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer']);
  });

  it('research twice, then the writer merges sources', async () => {
    script([research(), research({ focus: 'more' }), write]);
    subs({ researcher: [researchOk('https://a.io/1'), researchOk('https://b.io/2')], writer: [writerOk] });
    await run();
    expect(repo.createDraft.mock.calls[0][0].sources.map((s) => s.url)).toEqual(['https://a.io/1', 'https://b.io/2']);
    const started = events.filter((e) => e.type === 'agent_started' && e.agent === 'researcher');
    expect(started.map((e) => e.spawn)).toEqual([1, 2]);
    const writerPrompt = runMock.mock.calls.find(([o]) => o.agentName === 'writer')[0].prompt;
    expect(writerPrompt).toContain('Research pass 1');
    expect(writerPrompt).toContain('Research pass 2');
  });

  it('writer only: draft saved with no sources', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    const res = await run();
    expect(res.status).toBe('completed');
    expect(repo.createDraft).toHaveBeenCalledWith(expect.objectContaining({ sources: [] }));
  });

  it('orchestrator ends with no calls: NO_DRAFT', async () => {
    script([]);
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', agent: 'orchestrator', code: 'NO_DRAFT' });
    expect(types()).toContain('agent_completed');
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('writer fails: final error names the writer and its spawn', async () => {
    script([research(), write]);
    subs({ researcher: [researchOk()], writer: [async () => outcome('  ')] });
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', agent: 'writer', spawn: 1, code: 'WRITER_EMPTY' });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('research failure then no writer: final error carries the researcher failure', async () => {
    script([research()]);
    subs({ researcher: [async () => { throw new AgentError('AGENT_MAX_TURNS', 'm', { costUsd: 0.3 }); }] });
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', agent: 'researcher', spawn: 1, code: 'AGENT_MAX_TURNS' });
  });

  it('orchestrator AGENT_MAX_TURNS after the writer succeeded: draft saved', async () => {
    script([write], { then: new AgentError('AGENT_MAX_TURNS', 'm', { costUsd: 0.1 }) });
    subs({ writer: [writerOk] });
    const res = await run();
    expect(res.status).toBe('completed');
    expect(repo.createDraft).toHaveBeenCalledTimes(1);
    expect(types().at(-1)).toBe('run_completed');
  });

  it('orchestrator AgentError with no draft beats an earlier researcher failure', async () => {
    script([research()], { then: new AgentError('AGENT_BUDGET_EXCEEDED', 'b') });
    subs({ researcher: [async () => { throw new AgentError('UPSTREAM_ERROR', 'u'); }] });
    await run();
    const last = events.at(-1);
    expect(last).toEqual({ type: 'error', agent: 'orchestrator', code: 'AGENT_BUDGET_EXCEEDED', message: 'The agent reached its budget limit.' });
    const failedIdx = events.findIndex((e) => e.type === 'agent_failed' && e.agent === 'orchestrator');
    expect(failedIdx).toBeGreaterThan(-1);
    expect(failedIdx).toBe(events.length - 2);
  });

  it('abort during the nested researcher rethrows and saves nothing', async () => {
    const ac = new AbortController();
    const reason = new Error('cancel');
    script([research()]);
    subs({ researcher: [async () => { ac.abort(reason); throw new StreamAbortedError(ac.signal.reason); }] });
    // The orchestrator query aborts too once the run signal fires.
    const orchestrator = runMock.getMockImplementation();
    runMock.mockImplementation(async (opts) => {
      if (opts.agentName !== 'orchestrator') return orchestrator(opts);
      await orchestrator(opts);
      expect(opts.signal.aborted).toBe(true);
      throw new StreamAbortedError(ac.signal.reason);
    });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ name: 'StreamAbortedError', reason });
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(types()).not.toContain('error');
  });

  it('fatal path: a non-AgentError throw ends with INTERNAL_ERROR, not an abort', async () => {
    script([research()]);
    subs({ researcher: [async () => { throw new TypeError('bug'); }] });
    const orchestrator = runMock.getMockImplementation();
    runMock.mockImplementation(async (opts) => {
      if (opts.agentName !== 'orchestrator') return orchestrator(opts);
      // Mirrors the SDK wrapper: the internal abort surfaces as StreamAbortedError.
      await orchestrator(opts);
      throw new StreamAbortedError(opts.signal.reason);
    });
    const res = await run();
    expect(res.status).toBe('failed');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'INTERNAL_ERROR' });
    expect(events.at(-2)).toMatchObject({ type: 'agent_failed', agent: 'orchestrator', spawn: 1, code: 'INTERNAL_ERROR' });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('internal abort reaches the orchestrator signal on fatal', async () => {
    let orchSignal;
    runMock.mockImplementation(async (opts) => {
      if (opts.agentName === 'orchestrator') {
        orchSignal = opts.signal;
        await call('spawn_researcher');
        throw new StreamAbortedError(opts.signal.reason);
      }
      throw new TypeError('bug');
    });
    await run();
    expect(orchSignal.aborted).toBe(true);
  });

  it('a failed spawn cost is included in totalCostUsd', async () => {
    script([research(), write], { cost: 0.05 });
    subs({
      researcher: [async () => { throw new AgentError('AGENT_MAX_TURNS', 'm', { costUsd: 0.4 }); }],
      writer: [writerOk],
    });
    await run();
    expect(events.at(-1).totalCostUsd).toBeCloseTo(0.4 + 0.2 + 0.05);
  });

  it('notifier failure still completes the run', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    notifier.notify.mockRejectedValue(Object.assign(new Error('x'), { code: 'TELEGRAM_TIMEOUT' }));
    await run();
    expect(types().slice(-2)).toEqual(['notification', 'run_completed']);
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' });
  });

  it('default notifier reports skipped', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    await runPipeline({ runId: 'r1', title: 'Topic', emit, repo });
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'skipped' });
  });

  it('abort after blog_saved keeps the draft and skips notify', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    const ac = new AbortController();
    const reason = new Error('cancel');
    emit = (e) => { events.push(e); if (e.type === 'blog_saved') ac.abort(reason); };
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ reason });
    expect(repo.createDraft).toHaveBeenCalledTimes(1);
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(types()).not.toContain('run_completed');
  });

  it('repo failure emits a generic error', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    repo.createDraft.mockRejectedValue(new Error('db secret'));
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(events)).not.toContain('db secret');
    expect(types()).toContain('agent_completed');
    expect(types()).not.toContain('agent_failed');
  });

  it('passes an already-aborted signal to the orchestrator', async () => {
    let aborted;
    runMock.mockImplementation(async (opts) => {
      aborted = opts.signal.aborted;
      return outcome('done');
    });
    const ac = new AbortController();
    ac.abort(new Error('early'));
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ name: 'StreamAbortedError' });
    expect(aborted).toBe(true);
  });

  it('an orchestrator init violation reports INTERNAL_ERROR on agent_failed and error', async () => {
    const err = new AgentError('INIT_VIOLATION', 'bad init');
    err.initViolation = true;
    script([], { then: err });
    await run();
    expect(events.find((e) => e.type === 'agent_failed')).toMatchObject({ agent: 'orchestrator', code: 'INTERNAL_ERROR' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'INTERNAL_ERROR' });
  });

  it('abort plus a non-agent failure yields a single abort, not INTERNAL_ERROR', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    const ac = new AbortController();
    const reason = new Error('timeout');
    repo.createDraft.mockImplementation(async () => { ac.abort(reason); throw new Error('db'); });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ name: 'StreamAbortedError', reason });
    expect(types()).not.toContain('error');
  });

  it('abort while notify is pending rejects promptly and passes the signal', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    const ac = new AbortController();
    const reason = new Error('cancel');
    notifier.notify.mockImplementation(() => new Promise(() => {}));
    const p = run({ signal: ac.signal });
    await vi.waitFor(() => expect(notifier.notify).toHaveBeenCalled());
    expect(notifier.notify.mock.calls[0][1]).toEqual({ signal: ac.signal });
    ac.abort(reason);
    await expect(p).rejects.toMatchObject({ name: 'StreamAbortedError', reason });
    expect(types()).not.toContain('notification');
  });

  it('abort after the writer returns but before createDraft saves nothing', async () => {
    const ac = new AbortController();
    const reason = new Error('cancel');
    script([write]);
    subs({ writer: [async () => { ac.abort(reason); return outcome(POST); }] });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ reason });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('invalid notifier results become a failed TELEGRAM_ERROR', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    notifier.notify.mockResolvedValue({ status: 'weird', errorCode: 'X' });
    await run();
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed', errorCode: 'TELEGRAM_ERROR' });
  });

  it('drops unknown notifier error codes', async () => {
    script([write]);
    subs({ writer: [writerOk] });
    notifier.notify.mockResolvedValue({ status: 'failed', errorCode: 'SECRET' });
    await run();
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed' });
  });

  describe('delta throttling', () => {
    it('throttles 1000 deltas into at most 2 events and flushes before agent_completed', async () => {
      script([research(), write]);
      subs({
        researcher: [async ({ onMessage }) => { for (let i = 0; i < 1000; i++) await onMessage(delta('ab')); return outcome('notes'); }],
        writer: [writerOk],
      });
      await run();
      const deltas = events.filter((e) => e.type === 'agent_text_delta');
      expect(deltas.length).toBeLessThanOrEqual(2);
      expect(deltas.map((d) => d.text).join('')).toBe('ab'.repeat(1000));
      expect(deltas.every((d) => d.agent === 'researcher' && d.spawn === 1)).toBe(true);
      const completed = events.findIndex((e) => e.type === 'agent_completed' && e.agent === 'researcher');
      expect(events.indexOf(deltas.at(-1))).toBeLessThan(completed);
    });

    it('flushes when the spawn changes for the same agent', async () => {
      script([research(), research(), write]);
      subs({
        researcher: [
          async ({ onMessage }) => { await onMessage(delta('a')); return outcome('n1'); },
          async ({ onMessage }) => { await onMessage(delta('b')); return outcome('n2'); },
        ],
        writer: [writerOk],
      });
      await run();
      const d = events.filter((e) => e.type === 'agent_text_delta');
      expect(d.map((e) => [e.agent, e.spawn, e.text])).toEqual([['researcher', 1, 'a'], ['researcher', 2, 'b']]);
    });

    it('never emits a delta event above 1 KB', async () => {
      script([research(), write]);
      subs({
        researcher: [async ({ onMessage }) => {
          await onMessage(delta('a'.repeat(1000)));
          await onMessage(delta('b'.repeat(100)));
          return outcome('notes');
        }],
        writer: [writerOk],
      });
      await run();
      const d = events.filter((e) => e.type === 'agent_text_delta');
      expect(d.map((e) => e.text.length)).toEqual([1000, 100]);
    });
  });

  it('emits NO_RESULT for tool calls left open when the agent aborts', async () => {
    const ac = new AbortController();
    const toolUse = {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'WebSearch', input: { query: 'q' } }] },
    };
    script([research()]);
    subs({ researcher: [async ({ onMessage }) => {
      await onMessage(toolUse);
      ac.abort(new Error('cancel'));
      throw new StreamAbortedError(ac.signal.reason);
    }] });
    const orchestrator = runMock.getMockImplementation();
    runMock.mockImplementation(async (opts) => {
      if (opts.agentName !== 'orchestrator') return orchestrator(opts);
      await orchestrator(opts);
      expect(opts.signal.aborted).toBe(true);
      throw new StreamAbortedError(ac.signal.reason);
    });
    await expect(run({ signal: ac.signal })).rejects.toBeInstanceOf(StreamAbortedError);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', toolUseId: 'tu1', ok: false, errorCode: 'NO_RESULT', spawn: 1 }));
  });
});

describe('helpers', () => {
  it('parseTitle falls back when there is no H1', () => {
    expect(parseTitle('## no h1\ntext', 'Fallback')).toBe('Fallback');
    expect(parseTitle('# Hello ##\n', 'F')).toBe('Hello');
  });
  it('parseTitle keeps a trailing # in the word, strips markdown, ignores fences', () => {
    expect(parseTitle('# Learning C#\n', 'F')).toBe('Learning C#');
    expect(parseTitle('# Why [Rust](https://r.io) wins\n', 'F')).toBe('Why Rust wins');
    expect(parseTitle('# My *Great* Post\n', 'F')).toBe('My Great Post');
    expect(parseTitle('```sh\n# comment\n```\ntext', 'F')).toBe('F');
    expect(parseTitle('```sh\n# comment\n```\n# Real', 'F')).toBe('Real');
  });
  it('makeExcerpt keeps snake_case and lone asterisks', () => {
    expect(makeExcerpt('use my_var_name and 2 * 3')).toBe('use my_var_name and 2 * 3');
  });
  it('makeExcerpt caps at 200 characters and skips headings', () => {
    expect(makeExcerpt(`# T\n\n${'a'.repeat(300)}`)).toHaveLength(200);
    expect(makeExcerpt('# T')).toBe('');
  });
});
