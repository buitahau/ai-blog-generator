import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MODEL } from '../../config.js';
import { StreamAbortedError } from '../claude.js';

export class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
  }
}

const MESSAGES = {
  RATE_LIMITED: 'Rate limited. Please retry shortly.',
  OVERLOADED: 'The service is overloaded. Please retry shortly.',
  UPSTREAM_ERROR: 'The upstream service returned an error.',
  AGENT_MAX_TURNS: 'The agent reached its turn limit.',
  AGENT_BUDGET_EXCEEDED: 'The agent reached its budget limit.',
};

const agentError = (code) => new AgentError(code, MESSAGES[code]);

// Agents get only their declared tools; everything that touches the host is denied outright.
const DISALLOWED_TOOLS = [
  'Bash', 'BashOutput', 'KillShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Glob', 'Grep', 'Task', 'Agent', 'TodoWrite', 'SlashCommand', 'Skill',
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

function mapApiFailure(result, lastAssistantError) {
  return agentError(categoryFromApiFailure(result.api_error_status, lastAssistantError));
}

function toError(result, lastAssistantError) {
  if (result.subtype !== 'success' || result.is_error) {
    // Raw text may be API error output; it stays in the server log.
    console.error('Agent run failed:', result.subtype, result.result ?? result.errors, 'cost:', result.total_cost_usd);
  }
  if (result.subtype === 'error_max_turns') return agentError('AGENT_MAX_TURNS');
  if (result.subtype === 'error_max_budget_usd') return agentError('AGENT_BUDGET_EXCEEDED');
  if (result.subtype !== 'success' || result.is_error) {
    if (result.subtype === 'error_during_execution') return agentError('UPSTREAM_ERROR');
    return mapApiFailure(result, lastAssistantError);
  }
  if (result.stop_reason === 'refusal') return agentError('UPSTREAM_ERROR');
  return null;
}

const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export async function runAgentQuery({ agentName, agents, prompt, signal, limits, onMessage }) {
  // Fail closed: an uncapped agent run must never start.
  if (!isPositive(limits?.maxTurns) || !isPositive(limits?.maxBudgetUsd)) {
    throw new Error('runAgentQuery requires positive finite limits.maxTurns and limits.maxBudgetUsd.');
  }
  if (!agents?.[agentName]) throw new Error(`Unknown agent: ${agentName}`);
  if (signal?.aborted) throw new StreamAbortedError(signal.reason);

  const tools = agents[agentName].tools ?? [];
  const cwd = await mkdtemp(path.join(tmpdir(), 'blog-run-'));
  const abortController = new AbortController();
  const onAbort = () => abortController.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  let result;
  let lastAssistantError;
  let callbackError;
  try {
    // The abort may have fired while mkdtemp was pending, before the listener existed.
    if (signal?.aborted) throw new StreamAbortedError(signal.reason);
    const stream = query({
      prompt,
      options: {
        agent: agentName,
        agents,
        model: MODEL,
        tools,
        allowedTools: tools,
        disallowedTools: DISALLOWED_TOOLS,
        permissionMode: 'dontAsk',
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: {},
        persistSession: false,
        cwd,
        // Allowlist only: the parent env holds DATABASE_URL, ADMIN_TOKEN and TELEGRAM_*.
        env: { PATH: process.env.PATH, HOME: cwd, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
        maxTurns: limits.maxTurns,
        maxBudgetUsd: limits.maxBudgetUsd,
        includePartialMessages: true,
        abortController,
        stderr: (data) => console.error('[agent stderr]', data),
      },
    });

    for await (const message of stream) {
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
    if (signal?.aborted || abortController.signal.aborted) throw new StreamAbortedError(signal?.reason);
    if (err instanceof AgentError || (callbackError && err === callbackError)) throw err;
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
