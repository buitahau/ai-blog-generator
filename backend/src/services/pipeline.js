import { DEFAULT_LENGTH, DEFAULT_TONE, RESEARCH_MAX_BUDGET_USD, RESEARCH_MAX_TURNS, WRITER_MAX_BUDGET_USD, WRITER_MAX_TURNS } from '../config.js';
import { buildResearchTask } from '../prompts/researcher.js';
import { buildWriterTask } from '../prompts/writer.js';
import { AGENTS } from './agents/definitions.js';
import { collectSources, createNormalizer } from './agents/normalize.js';
import { AgentError, runAgentQuery } from './agents/runAgentQuery.js';
import { StreamAbortedError } from './claude.js';

const FLUSH_MS = 100;
const FLUSH_BYTES = 1024;
const EXCERPT_MAX = 200;
const TITLE_MAX = 200;
const NOTIFY_STATUSES = new Set(['sent', 'failed', 'skipped']);
const NOTIFY_ERROR_CODES = new Set([
  'TELEGRAM_UNAUTHORIZED', 'TELEGRAM_CHAT_NOT_FOUND', 'TELEGRAM_TIMEOUT', 'TELEGRAM_ERROR',
]);

const MESSAGES = {
  RESEARCH_EMPTY: 'The researcher returned no notes.',
  WRITER_EMPTY: 'The writer returned no content.',
  INTERNAL_ERROR: 'The run failed unexpectedly.',
};

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

// Coalesces text deltas per agent so a fast stream does not flood the SSE channel.
function createThrottledEmitter(emit) {
  let buffer = '';
  let agent;
  let timer = null;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    emit({ type: 'agent_text_delta', agent, text });
  };

  return {
    flush,
    send(event) {
      if (event.type !== 'agent_text_delta') {
        flush();
        emit(event);
        return;
      }
      if (agent !== event.agent || Buffer.byteLength(buffer) + Buffer.byteLength(event.text) > FLUSH_BYTES) flush();
      agent = event.agent;
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
  let totalCostUsd = 0;

  async function runAgent(agentName, prompt, limits) {
    send({ type: 'agent_started', agent: agentName });
    const normalize = createNormalizer(agentName);
    const messages = [];
    let outcome;
    try {
      outcome = await runAgentQuery({
        agentName,
        agents: AGENTS,
        prompt,
        signal,
        limits,
        onMessage: (message) => {
          messages.push(message);
          for (const event of normalize(message)) send(event);
        },
      });
    } finally {
      throttle.flush();
      for (const event of normalize.flush()) send(event);
    }
    totalCostUsd += outcome.totalCostUsd ?? 0;
    send({
      type: 'agent_completed',
      agent: agentName,
      numTurns: outcome.numTurns,
      costUsd: outcome.totalCostUsd,
      usage: { inputTokens: outcome.usage?.input_tokens ?? 0, outputTokens: outcome.usage?.output_tokens ?? 0 },
    });
    return { outcome, messages };
  }

  const fail = (code, agent, message = MESSAGES[code]) => {
    throttle.flush();
    emit({ type: 'error', ...(agent && { agent }), code, message });
    return { status: 'failed', code };
  };

  let currentAgent;
  try {
    currentAgent = 'researcher';
    const research = await runAgent(
      'researcher',
      buildResearchTask({ title }),
      { maxTurns: RESEARCH_MAX_TURNS, maxBudgetUsd: RESEARCH_MAX_BUDGET_USD },
    );
    const notes = research.outcome.resultText?.trim();
    if (!notes) return fail('RESEARCH_EMPTY', 'researcher');
    const sources = collectSources(research.messages);

    currentAgent = 'writer';
    const writing = await runAgent(
      'writer',
      buildWriterTask({ title, notes, sources, tone: DEFAULT_TONE, length: DEFAULT_LENGTH }),
      { maxTurns: WRITER_MAX_TURNS, maxBudgetUsd: WRITER_MAX_BUDGET_USD },
    );
    const contentMd = writing.outcome.resultText?.trim();
    if (!contentMd) return fail('WRITER_EMPTY', 'writer');

    currentAgent = undefined;
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
    if (err instanceof AgentError) return fail(err.code, currentAgent, err.message);
    console.error('Pipeline failed:', err);
    return fail('INTERNAL_ERROR', currentAgent);
  }
}
