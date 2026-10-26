import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  PIPELINE_MCP_TIMEOUT_MS,
  RESEARCH_SPAWN_TIMEOUT_MS,
  WRITER_SPAWN_TIMEOUT_MS,
} from '../../config.js';
import { AgentError } from '../agents/runAgentQuery.js';
import {
  checkSpawn, combinedNotes, mergedSources, recordFailure, recordResearch, recordWriter,
  researchDigest, writerDigest,
} from './state.js';

export const PIPELINE_TOOL_NAMES = ['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer'];

// Fixed texts: the model and the UI never see raw SDK or upstream error text.
const MESSAGES = {
  RATE_LIMITED: 'Rate limited. Please retry shortly.',
  OVERLOADED: 'The service is overloaded. Please retry shortly.',
  UPSTREAM_ERROR: 'The upstream service returned an error.',
  AGENT_MAX_TURNS: 'The agent reached its turn limit.',
  AGENT_BUDGET_EXCEEDED: 'The agent reached its budget limit.',
  RESEARCH_EMPTY: 'The researcher returned no notes.',
  WRITER_EMPTY: 'The writer returned no content.',
  AGENT_TIMEOUT: 'The agent timed out.',
};
const failureCode = (code) => (Object.hasOwn(MESSAGES, code) ? code : 'UPSTREAM_ERROR');

const FOCUS_MAX = 150;
const focusSchema = z.string().trim().max(FOCUS_MAX).regex(/^[^\r\n<>\p{Cc}]*$/u);
const researcherArgs = z.strictObject({ focus: focusSchema.optional() });
const writerArgs = z.strictObject({});

const SPAWN_CONFIG = {
  researcher: { action: 'spawn_researcher', timeoutMs: RESEARCH_SPAWN_TIMEOUT_MS, schema: researcherArgs },
  writer: { action: 'spawn_writer', timeoutMs: WRITER_SPAWN_TIMEOUT_MS, schema: writerArgs },
};

const result = (payload, isError = false) => ({
  ...(isError && { isError: true }),
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});
const errorResult = (errorCode) => result({ ok: false, errorCode }, true);

// runSub({agent, spawn, maxBudgetUsd, signal, focus | notes, sources}) resolves to
// {resultText, numTurns, costUsd, usage (raw SDK shape), sources?, fetchedOk?, searchCount?} or throws.
// spawnTimeouts exists for tests only: it overrides the configured per-agent timeouts.
export function createPipelineServer({
  state, signal, send, flush, runSub, onFatal, spawnTimeouts = {},
}) {
  async function handleSpawn(agent, args, extra) {
    const { action, schema } = SPAWN_CONFIG[agent];
    const timeoutMs = spawnTimeouts[agent] ?? SPAWN_CONFIG[agent].timeoutMs;

    const parsed = schema.safeParse(args ?? {});
    const check = parsed.success ? checkSpawn(state, agent) : { ok: false, reason: 'INVALID_INPUT' };
    if (!check.ok) {
      // focus is deliberately not echoed: it is orchestrator-supplied text.
      send({ type: 'orchestrator_action', action, accepted: false, reason: check.reason });
      return errorResult(check.reason);
    }

    // No await between checkSpawn and busy: that is what makes the lock race-free.
    state.busy = true;
    const spawn = state.counts[agent] + 1;
    const focus = agent === 'researcher' && parsed.data.focus ? parsed.data.focus : undefined;
    try {
      send({ type: 'orchestrator_action', action, accepted: true, spawn, ...(focus && { focus }) });
      flush();

      const spawnTimeoutSignal = AbortSignal.timeout(timeoutMs);
      const signals = [spawnTimeoutSignal];
      if (signal) signals.push(signal);
      if (extra?.signal instanceof AbortSignal) signals.push(extra.signal);

      send({ type: 'agent_started', agent, spawn });
      let outcome;
      try {
        outcome = await runSub({
          agent,
          spawn,
          maxBudgetUsd: check.maxBudgetUsd,
          signal: AbortSignal.any(signals),
          // Writer inputs come from state only, never from the orchestrator's args.
          ...(agent === 'researcher'
            ? { focus }
            : { notes: combinedNotes(state), sources: mergedSources(state) }),
        });
      } catch (err) {
        flush();
        return handleFailure(agent, spawn, err, { spawnTimeoutSignal, extra });
      }
      flush();
      if (signal?.aborted) return errorResult('ABORTED');

      send({
        type: 'agent_completed',
        agent,
        spawn,
        numTurns: outcome.numTurns,
        costUsd: outcome.costUsd,
        usage: {
          inputTokens: outcome.usage?.input_tokens ?? 0,
          outputTokens: outcome.usage?.output_tokens ?? 0,
        },
      });
      const text = typeof outcome.resultText === 'string' ? outcome.resultText.trim() : '';
      if (!text) {
        return failSub(agent, spawn, agent === 'researcher' ? 'RESEARCH_EMPTY' : 'WRITER_EMPTY', outcome.costUsd, outcome);
      }
      if (agent === 'researcher') {
        recordResearch(state, {
          spawn, ok: true, notes: text, sources: outcome.sources, fetchedOk: outcome.fetchedOk,
          searchCount: outcome.searchCount, costUsd: outcome.costUsd,
        });
        return result(researchDigest(state, spawn));
      }
      recordWriter(state, { spawn, ok: true, draftMd: text, costUsd: outcome.costUsd });
      return result(writerDigest(state));
    } finally {
      state.busy = false;
    }
  }

  function failSub(agent, spawn, rawCode, costUsd, partial = {}) {
    const code = failureCode(rawCode);
    send({ type: 'agent_failed', agent, spawn, code, message: MESSAGES[code] });
    recordFailure(state, { agent, spawn, code });
    if (agent === 'researcher') {
      recordResearch(state, {
        spawn, ok: false, costUsd, errorCode: code, fetchedOk: partial.fetchedOk, searchCount: partial.searchCount,
      });
      return result(researchDigest(state, spawn), true);
    }
    recordWriter(state, { spawn, ok: false, costUsd, errorCode: code });
    return result(writerDigest(state), true);
  }

  // Order matters: runAgentQuery throws StreamAbortedError for any aborted signal, the spawn timeout included.
  function handleFailure(agent, spawn, err, { spawnTimeoutSignal, extra }) {
    if (signal?.aborted) return errorResult('ABORTED');
    // extra.signal can fire while the run continues (MCP request timeout, one tool call cancelled),
    // so it is a sub-agent failure, not a run abort: agent_started needs its closing event.
    if (spawnTimeoutSignal.aborted || extra?.signal?.aborted) {
      return failSub(agent, spawn, 'AGENT_TIMEOUT', err?.costUsd);
    }
    if (err?.initViolation) return fatal(err);
    if (err instanceof AgentError) return failSub(agent, spawn, err.code, err.costUsd);
    return fatal(err);
  }

  function fatal(err) {
    console.error('Pipeline sub-agent failed unexpectedly:', err);
    state.fatal = err;
    onFatal();
    return errorResult('INTERNAL_ERROR');
  }

  const server = createSdkMcpServer({
    name: 'pipeline',
    alwaysLoad: true,
    timeout: PIPELINE_MCP_TIMEOUT_MS,
    tools: [
      // The MCP layer validates against this schema before the handler runs, so a strict one
      // would hide INVALID_INPUT and the orchestrator_action event. Real validation is in the handler.
      tool(
        'spawn_researcher',
        'Run one research pass. Optional focus (max 150 chars, one line) narrows the pass. Returns counts only.',
        { focus: z.string().optional() },
        (args, extra) => handleSpawn('researcher', args, extra),
      ),
      tool(
        'spawn_writer',
        'Write the post from the collected research. Takes no arguments. Call at most once.',
        {},
        (args, extra) => handleSpawn('writer', args, extra),
      ),
    ],
  });
  return server;
}
