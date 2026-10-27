import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';
import { createAdminRunsRouter } from '../src/routes/adminRuns.js';
import { createRunRegistry } from '../src/services/runRegistry.js';
import { StreamAbortedError } from '../src/services/claude.js';

const TOKEN = 't'.repeat(40);
const auth = { Authorization: `Bearer ${TOKEN}` };

const sseParser = (res, cb) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { data += c; });
  res.on('end', () => cb(null, data));
};

function parseSse(text) {
  return text.split('\n\n').filter((b) => b.trim() && !b.startsWith(':')).map((block) => {
    const frame = {};
    for (const line of block.split('\n')) {
      const i = line.indexOf(': ');
      const key = line.slice(0, i);
      const value = line.slice(i + 2);
      frame[key] = key === 'data' ? JSON.parse(value) : value;
    }
    return frame;
  });
}

// Pipeline that behaves like the real one on abort: it settles by throwing.
const abortable = (signal) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(new StreamAbortedError(signal.reason)), { once: true });
});

const completes = (n = 5) => async ({ emit }) => {
  emit({ type: 'agent_started', agent: 'researcher' });
  for (let i = 0; i < n; i++) emit({ type: 'agent_text_delta', agent: 'researcher', text: `t${i} ` });
  emit({ type: 'blog_saved', blogId: 1, slug: 's', title: 'T', status: 'draft' });
  emit({ type: 'run_completed', blogId: 1, totalCostUsd: 0.1 });
  return { status: 'completed' };
};

let servers;
beforeEach(() => {
  servers = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections(); s.close(r); })));
});

function setup(runPipeline, opts = {}) {
  const registry = createRunRegistry({ runPipeline, repo: {}, ...opts });
  const app = createApp({ adminAuth: requireAdmin(() => TOKEN), runRegistry: registry, blogsRepo: {} });
  return { registry, app };
}

const startRun = (app, title = 'A topic') => request(app).post('/api/admin/runs').set(auth).send({ title });
const getEvents = (app, runId, headers = {}) =>
  request(app).get(`/api/admin/runs/${runId}/events`).set(auth).set(headers).buffer(true).parse(sseParser)
    .then((res) => ({ res, frames: parseSse(res.body) }));

function listen(app) {
  const server = app.listen(0);
  servers.push(server);
  return server.address().port;
}

// Opens a live SSE connection; resolves frames on end, or lets the test destroy it.
function openStream(port, runId) {
  let req;
  const first = new Promise((resolve) => {
    const done = new Promise((finish) => {
      req = http.get({ port, path: `/api/admin/runs/${runId}/events`, headers: auth }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; resolve(); });
        res.on('end', () => finish(parseSse(data)));
        res.on('error', () => finish(parseSse(data)));
      });
      req.on('error', () => {});
    });
    req.done = done;
  });
  return { req, first, done: req.done };
}

describe('POST /api/admin/runs', () => {
  it('requires auth', async () => {
    const { app } = setup(completes());
    await request(app).post('/api/admin/runs').send({ title: 'abc' }).expect(401);
  });

  it.each([{}, { title: 'ab' }, { title: '   ab  ' }, { title: 'x'.repeat(201) }, { title: 'abc', extra: 1 }, { title: 5 }])(
    'rejects invalid body %j',
    async (body) => {
      const { app } = setup(completes());
      const res = await request(app).post('/api/admin/runs').set(auth).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('returns 202 with runId and passes the trimmed title', async () => {
    const pipeline = vi.fn(completes());
    const { app } = setup(pipeline);
    const res = await startRun(app, '  Hello world  ');
    expect(res.status).toBe(202);
    expect(res.body.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(pipeline).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello world', runId: res.body.runId }));
  });

  it('returns 409 for a second run and allows one after the first finishes', async () => {
    const { app } = setup(({ signal }) => abortable(signal));
    const first = await startRun(app);
    const second = await startRun(app);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RUN_IN_PROGRESS');
    await request(app).post(`/api/admin/runs/${first.body.runId}/cancel`).set(auth).expect(202);
    await getEvents(app, first.body.runId);
    expect((await startRun(app)).status).toBe(202);
  });
});

describe('GET /api/admin/runs/active', () => {
  it('reports the running run, then null', async () => {
    const { app } = setup(({ signal }) => abortable(signal));
    expect((await request(app).get('/api/admin/runs/active').set(auth)).body).toEqual({ runId: null });
    const { body } = await startRun(app);
    expect((await request(app).get('/api/admin/runs/active').set(auth)).body).toEqual({ runId: body.runId });
    await request(app).post(`/api/admin/runs/${body.runId}/cancel`).set(auth);
    await getEvents(app, body.runId);
    expect((await request(app).get('/api/admin/runs/active').set(auth)).body).toEqual({ runId: null });
  });
});

describe('GET /api/admin/runs/:runId/events', () => {
  it('returns 404 JSON for an unknown run and 401 without a token', async () => {
    const { app } = setup(completes());
    const res = await request(app).get('/api/admin/runs/nope/events').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await request(app).get('/api/admin/runs/nope/events').expect(401);
  });

  it('streams events with ids through run_completed and ends', async () => {
    const { app } = setup(completes());
    const { body } = await startRun(app);
    const { res, frames } = await getEvents(app, body.runId);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(frames.map((f) => f.event)).toEqual([
      'run_started', 'agent_started', ...Array(5).fill('agent_text_delta'), 'blog_saved', 'run_completed',
    ]);
    frames.forEach((f, i) => {
      expect(f.id).toBe(String(i + 1));
      expect(f.data).toMatchObject({ id: i + 1, runId: body.runId });
    });
    expect(frames[0].data.title).toBe('A topic');
  });

  it('gives two live subscribers identical events', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { app } = setup(async (ctx) => { ctx.emit({ type: 'agent_started', agent: 'researcher' }); await gate; return completes()(ctx); });
    const port = listen(app);
    const { body } = await startRun(app);
    const a = openStream(port, body.runId);
    const b = openStream(port, body.runId);
    await Promise.all([a.first, b.first]);
    release();
    const [fa, fb] = await Promise.all([a.done, b.done]);
    expect(fa.length).toBeGreaterThan(5);
    expect(fa).toEqual(fb);
  });

  it('replays from Last-Event-ID without duplicates', async () => {
    const { app } = setup(completes());
    const { body } = await startRun(app);
    const { frames: all } = await getEvents(app, body.runId);
    const { frames } = await getEvents(app, body.runId, { 'Last-Event-ID': '5' });
    expect(frames.map((f) => f.id)).toEqual(all.slice(5).map((f) => f.id));
    expect(frames[0].id).toBe('6');
    expect(frames.at(-1).event).toBe('run_completed');
    // Past the end of a finished run: nothing to replay and the stream still closes.
    const { frames: none } = await getEvents(app, body.runId, { 'Last-Event-ID': String(all.length) });
    expect(none).toEqual([]);
  });

  it('keeps the run going after a subscriber disconnects', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const seenSignals = [];
    const { app, registry } = setup(async (ctx) => {
      seenSignals.push(ctx.signal);
      ctx.emit({ type: 'agent_started', agent: 'researcher' });
      await gate;
      return completes(1)(ctx);
    });
    const port = listen(app);
    const { body } = await startRun(app);
    const s = openStream(port, body.runId);
    await s.first;
    s.req.destroy();
    await new Promise((r) => setTimeout(r, 30));
    expect(seenSignals[0].aborted).toBe(false);
    expect(registry.activeRunId()).toBe(body.runId);
    release();
    const { frames } = await getEvents(app, body.runId);
    expect(frames.at(-1).event).toBe('run_completed');
  });

  it('cancel aborts the pipeline and ends with run_cancelled, never error', async () => {
    let signalSeen;
    const { app } = setup(async ({ signal }) => { signalSeen = signal; await abortable(signal); });
    const { body } = await startRun(app);
    const cancel = () => request(app).post(`/api/admin/runs/${body.runId}/cancel`).set(auth);
    expect((await cancel()).status).toBe(202);
    const { frames } = await getEvents(app, body.runId);
    expect(signalSeen.aborted).toBe(true);
    expect(frames.at(-1).event).toBe('run_cancelled');
    expect(Object.keys(frames.at(-1).data).sort()).toEqual(['id', 'runId']);
    expect(frames.map((f) => f.event)).not.toContain('error');
    expect((await cancel()).status).toBe(202); // idempotent after finish
    expect((await request(app).post('/api/admin/runs/unknown/cancel').set(auth)).status).toBe(404);
  });

  it('timeout ends with error RUN_TIMEOUT, never run_cancelled', async () => {
    const { app } = setup(({ signal }) => abortable(signal), { timeoutMs: 20 });
    const { body } = await startRun(app);
    const { frames } = await getEvents(app, body.runId);
    expect(frames.at(-1).event).toBe('error');
    expect(frames.at(-1).data.code).toBe('RUN_TIMEOUT');
    expect(frames.map((f) => f.event)).not.toContain('run_cancelled');
  });

  it('finishes an aborted run even if the pipeline ignores the abort', async () => {
    const { app } = setup(() => new Promise(() => {}), { timeoutMs: 10, abortGraceMs: 20 });
    const { body } = await startRun(app);
    const { frames } = await getEvents(app, body.runId);
    expect(frames.at(-1).data.code).toBe('RUN_TIMEOUT');
    expect((await startRun(app)).status).toBe(202);
  });

  it('a late cancel does not override a timeout', async () => {
    const { app, registry } = setup(({ signal }) => abortable(signal), { timeoutMs: 10 });
    const { body } = await startRun(app);
    await new Promise((r) => setTimeout(r, 40));
    registry.cancel(body.runId);
    const { frames } = await getEvents(app, body.runId);
    expect(frames.at(-1).data.code).toBe('RUN_TIMEOUT');
  });

  it('emits INTERNAL_ERROR when the pipeline crashes, and ignores spoofed ids', async () => {
    const { app } = setup(async ({ emit }) => {
      emit({ type: 'agent_started', agent: 'researcher', id: 99, runId: 'evil' });
      throw new Error('boom');
    });
    const { body } = await startRun(app);
    const { frames } = await getEvents(app, body.runId);
    expect(frames[1].data).toMatchObject({ id: 2, runId: body.runId });
    expect(frames.at(-1).data.code).toBe('INTERNAL_ERROR');
  });

  describe('buffer eviction', () => {
    const deltas = (n) => async ({ emit }) => {
      emit({ type: 'agent_started', agent: 'researcher' });
      for (let i = 0; i < n; i++) emit({ type: 'agent_text_delta', agent: 'researcher', text: `r${i};` });
      emit({ type: 'agent_completed', agent: 'researcher', numTurns: 1, costUsd: 0, usage: { inputTokens: 0, outputTokens: 0 } });
      emit({ type: 'agent_started', agent: 'writer' });
      for (let i = 0; i < n; i++) emit({ type: 'agent_text_delta', agent: 'writer', text: `w${i};` });
      emit({ type: 'run_completed', blogId: 1, totalCostUsd: 0 });
    };
    const rebuild = (frames) => {
      const text = {};
      for (const f of frames) {
        // Mirrors a naive client reducer: this is what exposed the snapshot ordering bug.
        if (f.event === 'agent_started') text[f.data.agent] = '';
        if (f.event === 'agent_text_snapshot') text[f.data.agent] = f.data.text;
        if (f.event === 'agent_text_delta') text[f.data.agent] = (text[f.data.agent] ?? '') + f.data.text;
      }
      return text;
    };
    const expected = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i};`).join('');

    it('rebuilds the full text from snapshot plus retained deltas after 3000 deltas', async () => {
      const N = 3000;
      const { app } = setup(deltas(N), { bufferMax: 1000 });
      const { body } = await startRun(app);
      const { frames } = await getEvents(app, body.runId);
      const snapshots = frames.filter((f) => f.event === 'agent_text_snapshot');
      expect(snapshots.length).toBeGreaterThan(0);
      // Snapshots carry no SSE id and follow every retained event with id <= upToId.
      expect(snapshots[0].id).toBeUndefined();
      const upTo = snapshots[0].data.upToId;
      const first = frames.findIndex((f) => f.event === 'agent_text_snapshot');
      expect(frames.slice(0, first).every((f) => Number(f.id) <= upTo)).toBe(true);
      expect(frames.slice(first + snapshots.length).every((f) => Number(f.id) > upTo)).toBe(true);
      expect(snapshots[0].data.upToId).toBeGreaterThan(0);
      expect(frames.length).toBeLessThanOrEqual(1000 + snapshots.length);
      // Structural events are never evicted.
      expect(frames.map((f) => f.event)).toEqual(expect.arrayContaining(
        ['run_started', 'agent_started', 'agent_completed', 'run_completed']));
      expect(rebuild(frames)).toEqual({ researcher: expected(N, 'r'), writer: expected(N, 'w') });
    });

    it('does not snapshot when Last-Event-ID is newer than every evicted delta', async () => {
      const { app } = setup(deltas(300), { bufferMax: 100 });
      const { body } = await startRun(app);
      const { frames: full } = await getEvents(app, body.runId);
      const lastId = Number(full.at(-3).id);
      const { frames } = await getEvents(app, body.runId, { 'Last-Event-ID': String(lastId) });
      expect(frames.map((f) => f.event)).not.toContain('agent_text_snapshot');
      expect(frames.map((f) => Number(f.id))).toEqual(full.filter((f) => Number(f.id) > lastId).map((f) => Number(f.id)));
    });

    it('snapshots when Last-Event-ID is older than the oldest retained delta', async () => {
      const { app } = setup(deltas(300), { bufferMax: 100 });
      const { body } = await startRun(app);
      const { frames } = await getEvents(app, body.runId, { 'Last-Event-ID': '3' });
      expect(frames.map((f) => f.event)).toContain('agent_text_snapshot');
      expect(rebuild(frames)).toEqual({ researcher: expected(300, 'r'), writer: expected(300, 'w') });
    });

    const snapshotsOf = async (pipeline, bufferMax) => {
      const registry = createRunRegistry({ runPipeline: pipeline, repo: {}, bufferMax });
      const runId = registry.start({ title: 'T' });
      await vi.waitFor(() => expect(registry.activeRunId()).toBeNull());
      const { backlog } = registry.subscribe(runId, { onEvent() {} });
      return backlog.filter((e) => e.type === 'agent_text_snapshot');
    };

    it('emits one snapshot per agent spawn with that spawn\'s own text', async () => {
      const snaps = await snapshotsOf(async ({ emit }) => {
        for (const spawn of [1, 2]) {
          emit({ type: 'agent_started', agent: 'researcher', spawn });
          for (let i = 0; i < 6; i++) emit({ type: 'agent_text_delta', agent: 'researcher', spawn, text: `s${spawn}-${i};` });
        }
        emit({ type: 'run_completed', blogId: 1, totalCostUsd: 0 });
      }, 8);
      expect(snaps.map((s) => [s.agent, s.spawn, s.text])).toEqual([
        ['researcher', 1, 's1-0;s1-1;s1-2;s1-3;s1-4;s1-5;'],
        ['researcher', 2, 's2-0;s2-1;'],
      ]);
      expect(new Set(snaps.map((s) => s.upToId)).size).toBe(1);
    });

    it('treats events without spawn as spawn 1', async () => {
      const snaps = await snapshotsOf(async ({ emit }) => {
        emit({ type: 'agent_started', agent: 'writer' });
        emit({ type: 'agent_text_delta', agent: 'writer', text: 'a' });
        emit({ type: 'agent_text_delta', agent: 'writer', spawn: 1, text: 'b' });
        for (let i = 0; i < 6; i++) emit({ type: 'agent_text_delta', agent: 'writer', text: `${i}` });
        emit({ type: 'run_completed', blogId: 1, totalCostUsd: 0 });
      }, 5);
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toMatchObject({ agent: 'writer', spawn: 1 });
      expect(snaps[0].text).toBe('ab0123');
    });
  });
});

describe('registry.shutdown()', () => {
  it('aborts active runs with SERVER_SHUTDOWN, waits for cleanup, then refuses new runs', async () => {
    let cleaned = false;
    const { app, registry } = setup(async ({ signal }) => {
      try { await abortable(signal); } finally {
        await new Promise((r) => setTimeout(r, 20));
        cleaned = true;
      }
    });
    const { body } = await startRun(app);
    await registry.shutdown();
    expect(cleaned).toBe(true);
    const { frames } = await getEvents(app, body.runId);
    expect(frames.at(-1).event).toBe('error');
    expect(frames.at(-1).data.code).toBe('SERVER_SHUTDOWN');
    const again = await startRun(app);
    expect(again.status).toBe(503);
  });

  it('waits for slow cleanup that outlasts the abort grace period', async () => {
    let cleaned = false;
    const { app, registry } = setup(async ({ signal }) => {
      try { await abortable(signal); } finally {
        await new Promise((r) => setTimeout(r, 150));
        cleaned = true;
      }
    }, { abortGraceMs: 20, shutdownWaitMs: 1000 });
    await startRun(app);
    await registry.shutdown();
    expect(cleaned).toBe(true);
  });

  it('stops waiting after the limit when a pipeline never settles', async () => {
    const { app, registry } = setup(() => new Promise(() => {}), { shutdownWaitMs: 30 });
    await startRun(app);
    const t = Date.now();
    await registry.shutdown();
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe('heartbeat', () => {
  it('writes ": ping" comments while a run is live', async () => {
    const registry = createRunRegistry({ runPipeline: ({ signal }) => abortable(signal), repo: {} });
    const app = express().use('/runs', createAdminRunsRouter(registry, { heartbeatMs: 10 }));
    const port = listen(app);
    const runId = registry.start({ title: 'abc' });
    const text = await new Promise((resolve) => {
      http.get({ port, path: `/runs/${runId}/events` }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.includes(': ping')) { resolve(data); res.destroy(); }
        });
      });
    });
    expect(text).toContain(': ping');
    registry.cancel(runId);
    await registry.shutdown();
  });
});
