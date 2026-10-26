import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNormalizer, collectSources, mergeSources } from '../src/services/agents/normalize.js';

// Hand-written fixture; see test/fixtures/agent/README.md.
const load = (name) => readFileSync(new URL(`./fixtures/agent/${name}`, import.meta.url), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const runAll = (messages, agent = 'researcher') => {
  const n = createNormalizer(agent);
  return [...messages.flatMap((m) => n(m)), ...n.flush()];
};

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createNormalizer with fixture', () => {
  const messages = load('handwritten-research.jsonl');
  const events = runAll(messages);

  it('produces the expected events', () => {
    expect(events).toMatchInlineSnapshot(`
      [
        {
          "agent": "researcher",
          "spawn": 1,
          "text": "Searching",
          "type": "agent_text_delta",
        },
        {
          "agent": "researcher",
          "input": {
            "query": "rust async",
          },
          "name": "WebSearch",
          "spawn": 1,
          "toolUseId": "tu1",
          "type": "tool_call",
        },
        {
          "agent": "researcher",
          "elapsedSec": 15,
          "spawn": 1,
          "toolName": "WebSearch",
          "type": "agent_heartbeat",
        },
        {
          "agent": "researcher",
          "name": "WebSearch",
          "ok": true,
          "results": [
            {
              "snippet": "Intro",
              "title": "Async Rust",
              "url": "https://example.com/a",
            },
            {
              "title": "Dup",
              "url": "https://example.com/a",
            },
            {
              "title": "Tokio",
              "url": "https://example.com/b",
            },
          ],
          "spawn": 1,
          "summary": "3 results",
          "toolUseId": "tu1",
          "type": "tool_result",
        },
        {
          "agent": "researcher",
          "input": {
            "url": "https://example.com/b",
          },
          "name": "WebFetch",
          "spawn": 1,
          "toolUseId": "tu2",
          "type": "tool_call",
        },
        {
          "agent": "researcher",
          "name": "WebFetch",
          "ok": true,
          "spawn": 1,
          "summary": "Fetched https://example.com/b (HTTP 200, 2048 bytes)",
          "toolUseId": "tu2",
          "type": "tool_result",
        },
        {
          "agent": "researcher",
          "input": {
            "url": "https://bad.example/",
          },
          "name": "WebFetch",
          "spawn": 1,
          "toolUseId": "tu3",
          "type": "tool_call",
        },
        {
          "agent": "researcher",
          "errorCode": "TOOL_ERROR",
          "name": "WebFetch",
          "ok": false,
          "spawn": 1,
          "toolUseId": "tu3",
          "type": "tool_result",
        },
      ]
    `);
  });

  it('pairs every tool_call with exactly one tool_result', () => {
    const calls = events.filter((e) => e.type === 'tool_call').map((e) => e.toolUseId);
    const results = events.filter((e) => e.type === 'tool_result').map((e) => e.toolUseId);
    expect(results.sort()).toEqual(calls.sort());
  });

  it('keeps every event under 4 KB and leaks no raw error text', () => {
    for (const e of events) expect(Buffer.byteLength(JSON.stringify(e))).toBeLessThanOrEqual(4000);
    expect(JSON.stringify(events)).not.toContain('secret upstream error');
  });

  it('collects deduplicated sources', () => {
    expect(collectSources(messages)).toEqual([
      { title: 'Async Rust', url: 'https://example.com/a' },
      { title: 'Tokio', url: 'https://example.com/b' },
    ]);
  });
});

describe('createNormalizer hand-made cases', () => {
  it('reports a WebFetch HTTP 4xx/5xx as a failed result', () => {
    const n = createNormalizer('researcher');
    n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'f', name: 'WebFetch', input: { url: 'https://gone.test' } }] } });
    const [ev] = n({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'f' }] },
      tool_use_result: { code: 404, bytes: 0, url: 'https://gone.test' },
    });
    expect(ev).toMatchObject({ ok: false, errorCode: 'HTTP_ERROR', summary: 'Fetched https://gone.test (HTTP 404, 0 bytes)' });
  });

  it('prefers error_status over the error string on api_retry', () => {
    const n = createNormalizer('writer');
    expect(n({ type: 'system', subtype: 'api_retry', attempt: 1, error: 'unknown', error_status: 529 })[0].category).toBe('OVERLOADED');
  });

  it('maps api_retry and terminal assistant errors', () => {
    const n = createNormalizer('writer');
    expect(n({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 5, error: 'rate_limit', error_status: 429 }))
      .toEqual([{ type: 'agent_status', agent: 'writer', spawn: 1, state: 'retrying', category: 'RATE_LIMITED', attempt: 2 }]);
    expect(n({ type: 'assistant', error: 'overloaded', message: { content: [] } }))
      .toEqual([{ type: 'agent_status', agent: 'writer', spawn: 1, state: 'failed', category: 'OVERLOADED' }]);
    expect(n({ type: 'assistant', error: 'server_error', message: { content: [] } })[0].category).toBe('UPSTREAM_ERROR');
  });

  it('maps tool_progress to a heartbeat', () => {
    const n = createNormalizer('researcher');
    expect(n({ type: 'tool_progress', tool_name: 'WebFetch', elapsed_time_seconds: 29.6 }))
      .toEqual([{ type: 'agent_heartbeat', agent: 'researcher', spawn: 1, toolName: 'WebFetch', elapsedSec: 30 }]);
  });

  it('ignores init, unknown types, other tools and nested subagent text', () => {
    const n = createNormalizer('researcher');
    expect(n({ type: 'system', subtype: 'init' })).toEqual([]);
    expect(n({ type: 'mystery' })).toEqual([]);
    expect(n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } })).toEqual([]);
    expect(n({ type: 'stream_event', parent_tool_use_id: 't', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } } })).toEqual([]);
    expect(n({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'input_json_delta' } } })).toEqual([]);
    expect(n.flush()).toEqual([]);
  });

  it('never throws on malformed messages', () => {
    const n = createNormalizer('researcher');
    const bad = [null, undefined, 5, 'x', [], {}, { type: 'assistant' }, { type: 'assistant', message: { content: 'x' } },
      { type: 'assistant', message: { content: [null, 1, { type: 'tool_use' }] } },
      { type: 'user', message: null }, { type: 'user', message: { content: [{ type: 'tool_result' }] } },
      { type: 'stream_event' }, { type: 'tool_progress' }, { type: 'system' }, { type: 'system', subtype: 'api_retry' }];
    for (const m of bad) expect(() => n(m)).not.toThrow();
    expect(() => collectSources([null, { type: 'user', tool_use_result: { results: 'x' } }, { type: 'user', tool_use_result: { results: [null, { content: 5 }] } }])).not.toThrow();
    expect(collectSources(null)).toEqual([]);
  });

  it('handles a malformed tool_use_result as ok with no results, and one result per call', () => {
    const n = createNormalizer('researcher');
    n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'WebSearch', input: { query: 'q' } }] } });
    const user = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] }, tool_use_result: 'garbage' };
    expect(n(user)).toEqual([{ type: 'tool_result', agent: 'researcher', spawn: 1, toolUseId: 'a', name: 'WebSearch', ok: true, results: [], summary: '0 results' }]);
    expect(n(user)).toEqual([]);
  });

  it('stamps the spawn index on every event, defaulting to 1', () => {
    const n = createNormalizer('researcher', { spawn: 3 });
    const call = n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'WebFetch', input: {} }] } });
    const beat = n({ type: 'tool_progress', tool_name: 'WebFetch', elapsed_time_seconds: 1 });
    expect([...call, ...beat, ...n.flush()].map((e) => e.spawn)).toEqual([3, 3, 3]);
    const [d] = createNormalizer('writer')({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } } });
    expect(d.spawn).toBe(1);
  });

  it('flush closes unanswered calls with ok:false', () => {
    const n = createNormalizer('researcher');
    n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'WebFetch', input: { url: 'https://x.test', prompt: 'drop me' } }] } });
    expect(n.flush()).toEqual([{ type: 'tool_result', agent: 'researcher', spawn: 1, toolUseId: 'a', name: 'WebFetch', ok: false, errorCode: 'NO_RESULT' }]);
    expect(n.flush()).toEqual([]);
  });

  it('caps results at 10, snippets at 200 chars and event size at 4 KB', () => {
    const n = createNormalizer('researcher');
    n({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'WebSearch', input: { query: 'q' } }] } });
    const hits = Array.from({ length: 30 }, (_, i) => ({ title: 'T'.repeat(500), url: `https://e.test/${'p'.repeat(400)}${i}`, snippet: 's'.repeat(1000) }));
    const [ev] = n({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] }, tool_use_result: { results: [{ content: hits }] } });
    expect(ev.results.length).toBeGreaterThan(0);
    expect(ev.results.length).toBeLessThanOrEqual(10);
    for (const r of ev.results) expect(r.snippet.length).toBeLessThanOrEqual(200);
    expect(Buffer.byteLength(JSON.stringify(ev))).toBeLessThanOrEqual(4000);
  });

  it('truncates oversized text deltas', () => {
    const n = createNormalizer('writer');
    const [ev] = n({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x'.repeat(10000) } } });
    expect(Buffer.byteLength(JSON.stringify(ev))).toBeLessThanOrEqual(4000);
  });
});

describe('collectSources', () => {
  it('caps at 20 and skips failed fetches and non-http urls', () => {
    const hits = Array.from({ length: 40 }, (_, i) => ({ title: `t${i}`, url: `https://e.test/${i}` }));
    const msgs = [
      { type: 'user', tool_use_result: { results: [{ content: [...hits, { title: 'js', url: 'javascript:alert(1)' }] }] } },
      { type: 'user', tool_use_result: { code: 404, url: 'https://gone.test' } },
    ];
    const out = collectSources(msgs);
    expect(out).toHaveLength(20);
    expect(out.some((s) => s.url.startsWith('javascript'))).toBe(false);
  });

  it('includes successful WebFetch urls once', () => {
    const f = { type: 'user', tool_use_result: { code: 200, bytes: 1, url: 'https://f.test/x' } };
    expect(collectSources([f, f])).toEqual([{ title: 'https://f.test/x', url: 'https://f.test/x' }]);
  });
});

describe('mergeSources', () => {
  const a = { title: 'A', url: 'https://e.test/a' };
  const b = { title: 'B', url: 'https://e.test/b' };
  const c = { title: 'C', url: 'https://e.test/c' };

  it('dedupes by url keeping order and the first title', () => {
    expect(mergeSources([[a, b], [{ ...b, title: 'other' }, c]])).toEqual([a, b, c]);
  });

  it('caps at 20', () => {
    const list = Array.from({ length: 25 }, (_, i) => ({ title: `t${i}`, url: `https://e.test/${i}` }));
    expect(mergeSources([list.slice(0, 10), list.slice(10)])).toEqual(list.slice(0, 20));
  });

  it('ignores non-array inputs', () => {
    expect(mergeSources(null)).toEqual([]);
    expect(mergeSources([null, 'x', { a: 1 }, [a]])).toEqual([a]);
  });
});
