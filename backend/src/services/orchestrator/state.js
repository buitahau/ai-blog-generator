import {
  MAX_RESEARCH_SPAWNS,
  MAX_WRITER_SPAWNS,
  MIN_SPAWN_BUDGET_USD,
  NOTES_MAX_CHARS,
  ORCHESTRATOR_MAX_BUDGET_USD,
  RESEARCH_MAX_BUDGET_USD,
  RUN_MAX_BUDGET_USD,
  WRITER_MAX_BUDGET_USD,
} from '../../config.js';
import { mergeSources } from '../agents/normalize.js';

const AGENT_CAPS = {
  researcher: { max: MAX_RESEARCH_SPAWNS, budget: RESEARCH_MAX_BUDGET_USD },
  writer: { max: MAX_WRITER_SPAWNS, budget: WRITER_MAX_BUDGET_USD },
};

// Allowlist, not a pattern: a free-form uppercase code could smuggle instructions to the orchestrator.
const DIGEST_ERROR_CODES = new Set([
  'RATE_LIMITED',
  'OVERLOADED',
  'UPSTREAM_ERROR',
  'AGENT_MAX_TURNS',
  'AGENT_BUDGET_EXCEEDED',
  'RESEARCH_EMPTY',
  'WRITER_EMPTY',
  'AGENT_TIMEOUT',
]);
const safeCode = (c) => (DIGEST_ERROR_CODES.has(c) ? c : 'UPSTREAM_ERROR');

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const count = (v) => Math.floor(num(v));
const roundUsd = (v) => Math.floor(v * 100) / 100;

export function createRunState(title) {
  return {
    title,
    research: [],
    draftMd: '',
    writerSpawned: false,
    counts: { researcher: 0, writer: 0 },
    spentUsd: 0,
    busy: false,
    lastFailure: null,
    fatal: false,
    orchestratorCostUsd: 0,
  };
}

function budgetLeft(state) {
  return RUN_MAX_BUDGET_USD - ORCHESTRATOR_MAX_BUDGET_USD - state.spentUsd;
}

function remaining(state) {
  return {
    researcher: Math.max(0, MAX_RESEARCH_SPAWNS - state.counts.researcher),
    writer: Math.max(0, MAX_WRITER_SPAWNS - state.counts.writer),
  };
}

export function checkSpawn(state, agent) {
  const caps = AGENT_CAPS[agent];
  if (!caps) return { ok: false, reason: 'INVALID_INPUT' };
  if (state.busy) return { ok: false, reason: 'SPAWN_IN_PROGRESS' };
  if (state.counts[agent] >= caps.max) return { ok: false, reason: 'LIMIT_REACHED' };
  const left = budgetLeft(state);
  if (left < MIN_SPAWN_BUDGET_USD) return { ok: false, reason: 'BUDGET_EXHAUSTED' };
  return { ok: true, maxBudgetUsd: Math.min(caps.budget, left) };
}

// The spawn limit relies on the busy lock held by the caller between checkSpawn and record*.
function recordCommon(state, agent, { ok, costUsd, errorCode }) {
  state.counts[agent] += 1;
  state.spentUsd += num(costUsd);
  return ok ? {} : { errorCode: safeCode(errorCode) };
}

export function recordResearch(state, { spawn, ok, notes, sources, fetchedOk, searchCount, costUsd, errorCode }) {
  const err = recordCommon(state, 'researcher', { ok, costUsd, errorCode });
  state.research.push({
    spawn,
    ok: Boolean(ok),
    notes: ok && typeof notes === 'string' ? notes : '',
    sources: ok && Array.isArray(sources) ? sources : [],
    fetchedOk: count(fetchedOk),
    searchCount: count(searchCount),
    costUsd: num(costUsd),
    ...err,
  });
}

export function recordWriter(state, { spawn, ok, draftMd, costUsd, errorCode }) {
  const err = recordCommon(state, 'writer', { ok, costUsd, errorCode });
  state.lastWriter = { spawn, ok: Boolean(ok), ...err };
  if (ok && typeof draftMd === 'string' && draftMd) {
    state.draftMd = draftMd;
    state.writerSpawned = true;
  }
}

export function recordFailure(state, { agent, spawn, code }) {
  state.lastFailure = { agent, spawn, code: safeCode(code) };
}

export function researchDigest(state, spawn) {
  const entry = state.research.find((r) => r.spawn === spawn);
  return {
    agent: 'researcher',
    spawn,
    ok: Boolean(entry?.ok),
    ...(entry?.errorCode ? { errorCode: entry.errorCode } : {}),
    notesChars: entry?.notes.length ?? 0,
    sourceCount: entry?.sources.length ?? 0,
    fetchedOk: entry?.fetchedOk ?? 0,
    searchCount: entry?.searchCount ?? 0,
    remaining: remaining(state),
    budgetRemainingUsd: roundUsd(Math.max(0, budgetLeft(state))),
  };
}

export function writerDigest(state) {
  const w = state.lastWriter;
  const draft = state.draftMd;
  return {
    agent: 'writer',
    spawn: w?.spawn ?? 1,
    ok: Boolean(w?.ok),
    ...(w?.errorCode ? { errorCode: w.errorCode } : {}),
    draftChars: draft.length,
    hasH1: /^#[ \t]+\S/m.test(draft),
  };
}

export function combinedNotes(state) {
  return state.research
    .filter((r) => r.ok && r.notes)
    .map((r) => `## Research pass ${r.spawn}\n\n${r.notes}`)
    .join('\n\n')
    .slice(0, NOTES_MAX_CHARS);
}

export function mergedSources(state) {
  return mergeSources(state.research.filter((r) => r.ok).map((r) => r.sources));
}
