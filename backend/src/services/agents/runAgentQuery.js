import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MODEL } from '../../config.js';
import { StreamAbortedError } from '../claude.js';

export class AgentError extends Error {
  constructor(code, message, { costUsd, numTurns } = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    // Set only when a result message arrived, so callers can still count the spend of a failed pass.
    if (costUsd !== undefined) this.costUsd = costUsd;
    if (numTurns !== undefined) this.numTurns = numTurns;
  }
}

const MESSAGES = {
  RATE_LIMITED: 'Rate limited. Please retry shortly.',
  OVERLOADED: 'The service is overloaded. Please retry shortly.',
  UPSTREAM_ERROR: 'The upstream service returned an error.',
  AGENT_MAX_TURNS: 'The agent reached its turn limit.',
  AGENT_BUDGET_EXCEEDED: 'The agent reached its budget limit.',
};

const agentError = (code, usage) => new AgentError(code, MESSAGES[code], usage);

// Agents get only their declared tools; everything that touches the host is denied outright.
const DISALLOWED_TOOLS = [
  'Bash', 'BashOutput', 'KillShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Glob', 'Grep', 'Task', 'Agent', 'TodoWrite', 'SlashCommand', 'Skill',
  // MCP resource tools and ToolSearch could reach or discover tools outside the declared set.
  'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool', 'ToolSearch',
];

// Single source of truth for turning an API status / assistant error into an error code.
export function categoryFromApiFailure(status, assistantError) {
  if (typeof status === 'number') {
    if (status === 429) return 'RATE_LIMITED';
    if (status === 529) return 'OVERLOADED';
    return 'UPSTREAM_ERROR';
  }
  if (assistantError === 'rate_limit') return 'RATE_LIMITED';
  if (assistantError === 'overloaded') return 'OVERLOADED';
  return 'UPSTREAM_ERROR';
}

function mapApiFailure(result, lastAssistantError, usage) {
  return agentError(categoryFromApiFailure(result.api_error_status, lastAssistantError), usage);
}

function toError(result, lastAssistantError) {
  const usage = { costUsd: result.total_cost_usd, numTurns: result.num_turns };
  if (result.subtype !== 'success' || result.is_error) {
    // Raw text may be API error output; it stays in the server log.
    console.error('Agent run failed:', result.subtype, result.result ?? result.errors, 'cost:', result.total_cost_usd);
  }
  if (result.subtype === 'error_max_turns') return agentError('AGENT_MAX_TURNS', usage);
  if (result.subtype === 'error_max_budget_usd') return agentError('AGENT_BUDGET_EXCEEDED', usage);
  if (result.subtype !== 'success' || result.is_error) {
    if (result.subtype === 'error_during_execution') return agentError('UPSTREAM_ERROR', usage);
    return mapApiFailure(result, lastAssistantError, usage);
  }
  if (result.stop_reason === 'refusal') return agentError('UPSTREAM_ERROR', usage);
  return null;
}

const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export async function runAgentQuery({
  agentName, agents, prompt, signal, limits, onMessage, mcpServers = {}, extraAllowedTools = [], extraEnv = {},
}) {
  // Fail closed: an uncapped agent run must never start.
  if (!isPositive(limits?.maxTurns) || !isPositive(limits?.maxBudgetUsd)) {
    throw new Error('runAgentQuery requires positive finite limits.maxTurns and limits.maxBudgetUsd.');
  }
  if (extraAllowedTools.some((t) => typeof t !== 'string' || !t.startsWith('mcp__'))) {
    throw new Error('extraAllowedTools may only contain mcp__ tool names.');
  }
  if (!agents?.[agentName]) throw new Error(`Unknown agent: ${agentName}`);
  if (signal?.aborted) throw new StreamAbortedError(signal.reason);

  // MCP names go through allowedTools only; the tools option lists built-ins.
  const tools = (agents[agentName].tools ?? []).filter((t) => !t.startsWith('mcp__'));
  const cwd = await mkdtemp(path.join(tmpdir(), 'blog-run-'));
  const abortController = new AbortController();
  const onAbort = () => abortController.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  let result;
  let lastAssistantError;
  let callbackError;
  let initError;
  try {
    // The abort may have fired while mkdtemp was pending, before the listener existed.
    if (signal?.aborted) throw new StreamAbortedError(signal.reason);
    const stream = query({
      prompt,
      options: {
        agent: agentName,
        agents: { [agentName]: agents[agentName] },
        model: MODEL,
        tools,
        allowedTools: [...tools, ...extraAllowedTools],
        disallowedTools: DISALLOWED_TOOLS,
        permissionMode: 'dontAsk',
        settingSources: [],
        strictMcpConfig: true,
        mcpServers,
        persistSession: false,
        cwd,
        // Allowlist only: the parent env holds DATABASE_URL, ADMIN_TOKEN and TELEGRAM_*.
        env: {
          PATH: process.env.PATH,
          HOME: cwd,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          // Optional gateway; the CLI would otherwise talk to api.anthropic.com.
          ...(process.env.ANTHROPIC_BASE_URL?.trim() && { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL.trim() }),
          // Manual scripts only (e.g. subscription auth in the spike); the server never sets it.
          ...extraEnv,
        },
        maxTurns: limits.maxTurns,
        maxBudgetUsd: limits.maxBudgetUsd,
        includePartialMessages: true,
        abortController,
        stderr: (data) => console.error('[agent stderr]', data),
      },
    });

    for await (const message of stream) {
      if (message.type === 'system' && message.subtype === 'init' && Array.isArray(message.tools)) {
        const expected = new Set([...tools, ...extraAllowedTools]);
        const extras = message.tools.filter((t) => !expected.has(t));
        if (extras.length) {
          console.error('Unexpected agent tools:', extras);
          // initViolation is a security signal; callers must not treat it as a retryable failure.
          initError = agentError('UPSTREAM_ERROR');
          initError.initViolation = true;
          abortController.abort(initError);
          throw initError;
        }
      }
      if (message.type === 'assistant') lastAssistantError = message.error;
      if (message.type === 'result') result = message;
      try {
        await onMessage?.(message);
      } catch (err) {
        callbackError = err;
        throw err;
      }
    }
  } catch (err) {
    // Must precede the abort check: our own abort would otherwise become StreamAbortedError.
    if (initError) throw initError;
    if (signal?.aborted || abortController.signal.aborted) throw new StreamAbortedError(signal?.reason);
    if (err instanceof AgentError || (callbackError && err === callbackError)) throw err;
    // The CLI may exit non-zero after an error result; keep its specific code and cost.
    if (result) {
      const failure = toError(result, lastAssistantError);
      if (failure) throw failure;
    }
    console.error('Agent SDK error:', err);
    throw agentError('UPSTREAM_ERROR');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await rm(cwd, { recursive: true, force: true }).catch((err) => console.error('Temp dir cleanup failed:', err));
  }

  if (signal?.aborted) throw new StreamAbortedError(signal.reason);
  if (!result) {
    console.error('Agent run ended without a result message.');
    throw agentError('UPSTREAM_ERROR');
  }
  const failure = toError(result, lastAssistantError);
  if (failure) throw failure;

  return {
    resultText: result.result,
    subtype: result.subtype,
    numTurns: result.num_turns,
    totalCostUsd: result.total_cost_usd,
    usage: result.usage,
    stopReason: result.stop_reason,
  };
}
