import {
  DEFAULT_LENGTH, DEFAULT_TONE, ORCHESTRATOR_MAX_BUDGET_USD, ORCHESTRATOR_MAX_TURNS, RESEARCH_MAX_TURNS, WRITER_MAX_TURNS,
} from '../config.js';
import { buildOrchestratorTask } from '../prompts/orchestrator.js';
import { buildResearchTask } from '../prompts/researcher.js';
import { buildWriterTask } from '../prompts/writer.js';
import { AGENTS } from './agents/definitions.js';
import { collectSources, createNormalizer } from './agents/normalize.js';
import { AgentError, runAgentQuery } from './agents/runAgentQuery.js';
import { StreamAbortedError } from './claude.js';
import { createRunState, mergedSources } from './orchestrator/state.js';
import { createPipelineServer, PIPELINE_TOOL_NAMES } from './orchestrator/tools.js';

const FLUSH_MS = 100;
const FLUSH_BYTES = 1024;
const EXCERPT_MAX = 200;
const TITLE_MAX = 200;
const NOTIFY_STATUSES = new Set(['sent', 'failed', 'skipped']);
const NOTIFY_ERROR_CODES = new Set([
  'TELEGRAM_UNAUTHORIZED', 'TELEGRAM_CHAT_NOT_FOUND', 'TELEGRAM_TIMEOUT', 'TELEGRAM_ERROR',
]);

// Fixed texts for final errors: raw SDK text never reaches the client.
const MESSAGES = {
  RATE_LIMITED: 'Rate limited. Please retry shortly.',
  OVERLOADED: 'The service is overloaded. Please retry shortly.',
  UPSTREAM_ERROR: 'The upstream service returned an error.',
  AGENT_MAX_TURNS: 'The agent reached its turn limit.',
  AGENT_BUDGET_EXCEEDED: 'The agent reached its budget limit.',
  AGENT_TIMEOUT: 'The agent timed out.',
  RESEARCH_EMPTY: 'The researcher returned no notes.',
  WRITER_EMPTY: 'The writer returned no content.',
  NO_DRAFT: 'The run ended without a draft.',
  INTERNAL_ERROR: 'The run failed unexpectedly.',
};
const messageFor = (code) => MESSAGES[code] ?? MESSAGES.UPSTREAM_ERROR;

export const noopNotifier = { notify: async () => ({ status: 'skipped' }) };

export function parseTitle(markdown, fallback) {
  // Fenced code can contain "# comment" lines that are not the post title.
  const unfenced = markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, '');
  const match = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m.exec(unfenced);
  const title = match ? stripMarkdown(match[1]).slice(0, TITLE_MAX) : '';
  return title || fallback;
}

function stripMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![\w*])\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*(?![\w*])/g, '$1')
    .replace(/(?<!\w)_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?!\w)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeExcerpt(markdown) {
  const blocks = markdown.split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    // Headings, rules, fences, tables and lists are not prose paragraphs.
    if (!trimmed || /^(#|```|~~~|---|\*\*\*|\||[-*+] |\d+\. )/.test(trimmed)) continue;
    const text = stripMarkdown(trimmed.replace(/^>\s?/gm, ''));
    if (text) return text.slice(0, EXCERPT_MAX);
  }
  return '';
}

// Coalesces text deltas per agent instance so a fast stream does not flood the SSE channel.
function createThrottledEmitter(emit) {
  let buffer = '';
  let key;
  let agent;
  let spawn;
  let timer = null;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    emit({ type: 'agent_text_delta', agent, spawn, text });
  };

  return {
    flush,
    send(event) {
      if (event.type !== 'agent_text_delta') {
        flush();
        emit(event);
        return;
      }
      const eventKey = `${event.agent}:${event.spawn}`;
      if (key !== eventKey || Buffer.byteLength(buffer) + Buffer.byteLength(event.text) > FLUSH_BYTES) flush();
      key = eventKey;
      agent = event.agent;
      spawn = event.spawn;
      buffer += event.text;
      if (Buffer.byteLength(buffer) >= FLUSH_BYTES) flush();
      else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    },
  };
}

// Rejects as soon as the signal aborts so a slow notifier cannot hold up cancel or shutdown.
function raceAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new StreamAbortedError(signal.reason));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function runPipeline({ title, signal, emit, repo, notifier = noopNotifier, runId }) {
  const throttle = createThrottledEmitter(emit);
  const send = throttle.send;
  const state = createRunState(title);
  let totalCostUsd = 0;

  // Runs one nested sub-agent. The tool handler emits started/completed/failed and orchestrator_action.
  async function runSub({ agent, spawn, maxBudgetUsd, signal: subSignal, focus, notes, sources }) {
    const isResearcher = agent === 'researcher';
    const prompt = isResearcher
      ? buildResearchTask({ title, focus })
      : buildWriterTask({ title, notes, sources, tone: DEFAULT_TONE, length: DEFAULT_LENGTH });
    const normalize = createNormalizer(agent, { spawn });
    const messages = [];
    let fetchedOk = 0;
    let searchCount = 0;
    const emitAll = (events) => {
      for (const event of events) {
        if (event.type === 'tool_call' && event.name === 'WebSearch') searchCount += 1;
        if (event.type === 'tool_result' && event.name === 'WebFetch' && event.ok) fetchedOk += 1;
        send(event);
      }
    };
    let outcome;
    try {
      outcome = await runAgentQuery({
        agentName: agent,
        agents: AGENTS,
        prompt,
        signal: subSignal,
        limits: { maxTurns: isResearcher ? RESEARCH_MAX_TURNS : WRITER_MAX_TURNS, maxBudgetUsd },
        onMessage: (message) => {
          messages.push(message);
          emitAll(normalize(message));
        },
      });
    } catch (err) {
      // Failed passes still cost money.
      totalCostUsd += err?.costUsd ?? 0;
      throw err;
    } finally {
      throttle.flush();
      emitAll(normalize.flush());
    }
    totalCostUsd += outcome.totalCostUsd ?? 0;
    return {
      resultText: outcome.resultText,
      numTurns: outcome.numTurns,
      costUsd: outcome.totalCostUsd,
      usage: outcome.usage,
      ...(isResearcher && { sources: collectSources(messages), fetchedOk, searchCount }),
    };
  }

  const fail = (code, agent, message = messageFor(code), spawn) => {
    throttle.flush();
    emit({ type: 'error', ...(agent && { agent }), ...(spawn !== undefined && { spawn }), code, message });
    return { status: 'failed', code };
  };

  // Aborted by the run signal or, on a handler bug, by onFatal.
  const orchestratorAbort = new AbortController();
  const onRunAbort = () => orchestratorAbort.abort(signal.reason);
  signal?.addEventListener('abort', onRunAbort, { once: true });
  if (signal?.aborted) orchestratorAbort.abort(signal.reason);

  // F02 only closes the plan step on agent_failed {orchestrator}, so send it before a generic final error.
  let orchestratorOpen = false;
  const failInternal = () => {
    orchestratorOpen = false;
    send({
      type: 'agent_failed', agent: 'orchestrator', spawn: 1,
      code: 'INTERNAL_ERROR', message: MESSAGES.INTERNAL_ERROR,
    });
    return fail('INTERNAL_ERROR');
  };

  try {
    const server = createPipelineServer({
      state, signal, send, flush: throttle.flush, runSub, onFatal: () => orchestratorAbort.abort(),
    });

    orchestratorOpen = true;
    send({ type: 'agent_started', agent: 'orchestrator', spawn: 1 });
    const normalize = createNormalizer('orchestrator', { spawn: 1 });
    let orchestratorError;
    let orchestratorCost = 0;
    let orchestratorOutcome;
    try {
      orchestratorOutcome = await runAgentQuery({
        agentName: 'orchestrator',
        agents: AGENTS,
        prompt: buildOrchestratorTask({ title }),
        signal: orchestratorAbort.signal,
        limits: { maxTurns: ORCHESTRATOR_MAX_TURNS, maxBudgetUsd: ORCHESTRATOR_MAX_BUDGET_USD },
        mcpServers: { pipeline: server },
        extraAllowedTools: PIPELINE_TOOL_NAMES,
        onMessage: (message) => { for (const event of normalize(message)) send(event); },
      });
      orchestratorCost = orchestratorOutcome.totalCostUsd ?? 0;
    } catch (err) {
      orchestratorError = err;
      orchestratorCost = err?.costUsd ?? 0;
    } finally {
      throttle.flush();
      for (const event of normalize.flush()) send(event);
    }
    totalCostUsd += orchestratorCost;
    state.orchestratorCostUsd = orchestratorCost;

    // fatal first: our own abort makes the orchestrator query throw StreamAbortedError.
    if (state.fatal) return failInternal();
    if (signal?.aborted) throw orchestratorError instanceof StreamAbortedError ? orchestratorError : new StreamAbortedError(signal.reason);
    if (orchestratorError && !(orchestratorError instanceof AgentError)) throw orchestratorError;
    if (orchestratorError?.initViolation) return failInternal();

    orchestratorOpen = false;
    if (orchestratorError) {
      send({
        type: 'agent_failed', agent: 'orchestrator', spawn: 1,
        code: orchestratorError.code, message: messageFor(orchestratorError.code),
      });
    } else {
      send({
        type: 'agent_completed',
        agent: 'orchestrator',
        spawn: 1,
        numTurns: orchestratorOutcome.numTurns,
        costUsd: orchestratorOutcome.totalCostUsd,
        usage: {
          inputTokens: orchestratorOutcome.usage?.input_tokens ?? 0,
          outputTokens: orchestratorOutcome.usage?.output_tokens ?? 0,
        },
      });
    }

    const contentMd = state.draftMd.trim();
    if (!contentMd) {
      if (orchestratorError) return fail(orchestratorError.code, 'orchestrator');
      if (state.lastFailure) {
        const { agent, code, spawn } = state.lastFailure;
        return fail(code, agent, undefined, spawn);
      }
      return fail('NO_DRAFT', 'orchestrator');
    }

    const sources = mergedSources(state);
    if (signal?.aborted) throw new StreamAbortedError(signal.reason);
    const blog = await repo.createDraft({
      title: parseTitle(contentMd, title),
      excerpt: makeExcerpt(contentMd),
      contentMd,
      topic: title,
      sources,
      runId,
    });
    emit({ type: 'blog_saved', blogId: blog.id, slug: blog.slug, title: blog.title, status: 'draft' });

    if (signal?.aborted) throw new StreamAbortedError(signal.reason);
    let notification;
    try {
      const res = await raceAbort(Promise.resolve(notifier.notify(blog, { signal })), signal);
      if (NOTIFY_STATUSES.has(res?.status)) {
        notification = { status: res.status };
        if (NOTIFY_ERROR_CODES.has(res.errorCode)) notification.errorCode = res.errorCode;
      } else {
        notification = { status: 'failed', errorCode: 'TELEGRAM_ERROR' };
      }
    } catch (err) {
      if (err instanceof StreamAbortedError) throw err;
      console.error('Notification failed:', err?.code ?? err?.name);
      notification = { status: 'failed', errorCode: NOTIFY_ERROR_CODES.has(err?.code) ? err.code : 'TELEGRAM_ERROR' };
    }
    if (signal?.aborted) throw new StreamAbortedError(signal.reason);
    emit({ type: 'notification', channel: 'telegram', ...notification });

    emit({ type: 'run_completed', blogId: blog.id, totalCostUsd });
    return { status: 'completed', blogId: blog.id, totalCostUsd };
  } catch (err) {
    throttle.flush();
    // An abort owns the final event (run_cancelled / RUN_TIMEOUT), so never emit a second one.
    if (signal?.aborted) throw err instanceof StreamAbortedError ? err : new StreamAbortedError(signal.reason);
    if (err instanceof StreamAbortedError) throw err;
    console.error('Pipeline failed:', err);
    // Don't close the plan step twice, or close one that never opened.
    return orchestratorOpen ? failInternal() : fail('INTERNAL_ERROR');
  } finally {
    signal?.removeEventListener('abort', onRunAbort);
  }
}
