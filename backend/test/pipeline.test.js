import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));
vi.mock('../src/services/agents/runAgentQuery.js', async (orig) => ({ ...(await orig()), runAgentQuery: runMock }));

const { runPipeline, parseTitle, makeExcerpt } = await import('../src/services/pipeline.js');
const { AgentError } = await import('../src/services/agents/runAgentQuery.js');
const { StreamAbortedError } = await import('../src/services/claude.js');

const outcome = (resultText, cost = 0.1) => ({
  resultText, numTurns: 2, totalCostUsd: cost, usage: { input_tokens: 5, output_tokens: 7 },
});
const POST = '# My *Great* Post\n\nFirst [para](https://x.io) with **bold**.\n\n## Section\n\nMore.';
const searchMsg = {
  type: 'user',
  tool_use_result: { results: [{ content: [{ title: 'T', url: 'https://src.io/a' }] }] },
};

let events, emit, repo, notifier;
beforeEach(() => {
  runMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  events = [];
  emit = (e) => events.push(e);
  repo = { createDraft: vi.fn(async (d) => ({ id: 7, slug: 'my-great-post', title: d.title })) };
  notifier = { notify: vi.fn(async () => ({ status: 'sent' })) };
});
afterEach(() => vi.restoreAllMocks());

const types = () => events.map((e) => e.type);
const run = (extra = {}) => runPipeline({ runId: 'r1', title: 'Topic', emit, repo, notifier, ...extra });

function happy() {
  runMock
    .mockImplementationOnce(async ({ onMessage }) => { await onMessage(searchMsg); return outcome('notes'); })
    .mockImplementationOnce(async () => outcome(POST, 0.2));
}

describe('runPipeline', () => {
  it('happy path: ordered events, sources saved, total cost', async () => {
    happy();
    const res = await run();
    expect(types()).toEqual([
      'agent_started', 'agent_completed', 'agent_started', 'agent_completed',
      'blog_saved', 'notification', 'run_completed',
    ]);
    expect(events[0].agent).toBe('researcher');
    expect(events[1]).toMatchObject({ agent: 'researcher', numTurns: 2, costUsd: 0.1, usage: { inputTokens: 5, outputTokens: 7 } });
    expect(repo.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: 'My Great Post',
      excerpt: 'First para with bold.',
      topic: 'Topic',
      runId: 'r1',
      sources: [{ title: 'T', url: 'https://src.io/a' }],
    }));
    expect(events.at(-1).blogId).toBe(7);
    expect(events.at(-1).totalCostUsd).toBeCloseTo(0.3);
    expect(events.at(-3)).toEqual({ type: 'blog_saved', blogId: 7, slug: 'my-great-post', title: 'My Great Post', status: 'draft' });
    expect(res.status).toBe('completed');
    expect(types()).not.toContain('run_started');
  });

  it('writer starts only after the researcher finished', async () => {
    const order = [];
    runMock.mockImplementation(async ({ agentName }) => {
      order.push(`start:${agentName}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${agentName}`);
      return outcome(agentName === 'writer' ? POST : 'notes');
    });
    await run();
    expect(order).toEqual(['start:researcher', 'end:researcher', 'start:writer', 'end:writer']);
  });

  it('empty notes fail with RESEARCH_EMPTY', async () => {
    runMock.mockResolvedValueOnce(outcome('  '));
    await run();
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'error', agent: 'researcher', code: 'RESEARCH_EMPTY' });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('researcher budget error: no writer, no draft', async () => {
    runMock.mockRejectedValueOnce(new AgentError('AGENT_BUDGET_EXCEEDED', 'budget'));
    await run();
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: 'error', agent: 'researcher', code: 'AGENT_BUDGET_EXCEEDED', message: 'budget' });
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(types()).not.toContain('run_completed');
  });

  it('writer error attributes the writer', async () => {
    runMock.mockResolvedValueOnce(outcome('notes')).mockRejectedValueOnce(new AgentError('AGENT_MAX_TURNS', 'm'));
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', agent: 'writer', code: 'AGENT_MAX_TURNS' });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('abort during the writer saves nothing and rethrows with the reason', async () => {
    const ac = new AbortController();
    const reason = new Error('cancel');
    runMock.mockResolvedValueOnce(outcome('notes')).mockImplementationOnce(async () => {
      ac.abort(reason);
      throw new StreamAbortedError(ac.signal.reason);
    });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ name: 'StreamAbortedError', reason });
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(types()).not.toContain('error');
    expect(types()).not.toContain('run_cancelled');
  });

  it('notifier failure still completes the run', async () => {
    happy();
    notifier.notify.mockRejectedValue(Object.assign(new Error('x'), { code: 'TELEGRAM_TIMEOUT' }));
    await run();
    expect(types().slice(-2)).toEqual(['notification', 'run_completed']);
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' });
  });

  it('default notifier reports skipped', async () => {
    happy();
    await runPipeline({ runId: 'r1', title: 'Topic', emit, repo });
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'skipped' });
  });

  it('abort after blog_saved keeps the draft and skips notify', async () => {
    happy();
    const ac = new AbortController();
    const reason = new Error('cancel');
    emit = (e) => { events.push(e); if (e.type === 'blog_saved') ac.abort(reason); };
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ reason });
    expect(repo.createDraft).toHaveBeenCalledTimes(1);
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(types()).toContain('blog_saved');
    expect(types()).not.toContain('run_completed');
  });

  it('repo failure emits a generic error', async () => {
    happy();
    repo.createDraft.mockRejectedValue(new Error('db secret'));
    await run();
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(events)).not.toContain('db secret');
  });

  it('throttles 1000 deltas into at most 2 events and flushes before agent_completed', async () => {
    const delta = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ab' } } };
    runMock
      .mockImplementationOnce(async ({ onMessage }) => {
        for (let i = 0; i < 1000; i++) await onMessage(delta);
        return outcome('notes');
      })
      .mockResolvedValueOnce(outcome(POST));
    await run();
    const deltas = events.filter((e) => e.type === 'agent_text_delta');
    expect(deltas.length).toBeLessThanOrEqual(2);
    expect(deltas.map((d) => d.text).join('')).toBe('ab'.repeat(1000));
    expect(events.indexOf(deltas.at(-1))).toBeLessThan(types().indexOf('agent_completed'));
  });

  it('abort while notify is pending rejects promptly and passes the signal', async () => {
    happy();
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

  it('abort plus a non-agent failure yields a single abort, not INTERNAL_ERROR', async () => {
    happy();
    const ac = new AbortController();
    const reason = new Error('timeout');
    repo.createDraft.mockImplementation(async () => { ac.abort(reason); throw new Error('db'); });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ name: 'StreamAbortedError', reason });
    expect(types()).not.toContain('error');
  });

  it('abort after the writer returns but before createDraft saves nothing', async () => {
    const ac = new AbortController();
    const reason = new Error('cancel');
    runMock.mockResolvedValueOnce(outcome('notes')).mockImplementationOnce(async () => {
      ac.abort(reason);
      return outcome(POST);
    });
    await expect(run({ signal: ac.signal })).rejects.toMatchObject({ reason });
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('invalid notifier results become a failed TELEGRAM_ERROR', async () => {
    happy();
    notifier.notify.mockResolvedValue({ status: 'weird', errorCode: 'X' });
    await run();
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed', errorCode: 'TELEGRAM_ERROR' });
  });

  it('drops unknown notifier error codes', async () => {
    happy();
    notifier.notify.mockResolvedValue({ status: 'failed', errorCode: 'SECRET' });
    await run();
    expect(events.at(-2)).toEqual({ type: 'notification', channel: 'telegram', status: 'failed' });
  });

  it('emits NO_RESULT for tool calls left open when the agent aborts', async () => {
    const ac = new AbortController();
    const toolUse = {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'WebSearch', input: { query: 'q' } }] },
    };
    runMock.mockImplementationOnce(async ({ onMessage }) => {
      await onMessage(toolUse);
      ac.abort(new Error('cancel'));
      throw new StreamAbortedError(ac.signal.reason);
    });
    await expect(run({ signal: ac.signal })).rejects.toBeInstanceOf(StreamAbortedError);
    expect(events.at(-1)).toMatchObject({ type: 'tool_result', toolUseId: 'tu1', ok: false, errorCode: 'NO_RESULT' });
  });

  describe('delta throttling', () => {
    const delta = (text) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

    it('flushes buffered text after 100 ms', async () => {
      vi.useFakeTimers();
      try {
        let release;
        runMock.mockImplementationOnce(async ({ onMessage }) => {
          await onMessage(delta('hi'));
          await new Promise((r) => { release = r; });
          return outcome('notes');
        });
        const p = run();
        await vi.advanceTimersByTimeAsync(50);
        expect(events.filter((e) => e.type === 'agent_text_delta')).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(60);
        expect(events.filter((e) => e.type === 'agent_text_delta')).toEqual([{ type: 'agent_text_delta', agent: 'researcher', text: 'hi' }]);
        runMock.mockResolvedValueOnce(outcome(POST));
        release();
        await p;
      } finally {
        vi.useRealTimers();
      }
    });

    it('flushes when the agent changes', async () => {
      runMock
        .mockImplementationOnce(async ({ onMessage }) => { await onMessage(delta('a')); return outcome('notes'); })
        .mockImplementationOnce(async ({ onMessage }) => { await onMessage(delta('b')); return outcome(POST); });
      await run();
      const d = events.filter((e) => e.type === 'agent_text_delta');
      expect(d.map((e) => [e.agent, e.text])).toEqual([['researcher', 'a'], ['writer', 'b']]);
      expect(events.indexOf(d[0])).toBeLessThan(types().indexOf('agent_completed'));
    });

    it('never emits a delta event above 1 KB', async () => {
      runMock
        .mockImplementationOnce(async ({ onMessage }) => {
          await onMessage(delta('a'.repeat(1000)));
          await onMessage(delta('b'.repeat(100)));
          return outcome('notes');
        })
        .mockResolvedValueOnce(outcome(POST));
      await run();
      const d = events.filter((e) => e.type === 'agent_text_delta');
      expect(d.map((e) => e.text.length)).toEqual([1000, 100]);
    });
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
