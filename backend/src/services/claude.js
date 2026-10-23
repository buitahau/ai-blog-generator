import Anthropic from '@anthropic-ai/sdk';
import { MODEL, MAX_TOKENS_CEILING, REQUEST_TIMEOUT_MS } from '../config.js';

// Created lazily so importing this module never requires a key (tests, tooling).
let client;
function getClient() {
  client ??= new Anthropic({ timeout: REQUEST_TIMEOUT_MS });
  return client;
}

export class ClaudeServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClaudeServiceError';
    this.code = code;
  }
}

// Distinct from ClaudeServiceError so callers can tell a client cancel from an upstream failure.
export class StreamAbortedError extends Error {
  constructor(reason) {
    super('Generation aborted.');
    this.name = 'StreamAbortedError';
    // signal.reason lets callers tell a user cancel from a run timeout.
    this.reason = reason;
  }
}

function mapError(err) {
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    if (err.status === 429) return new ClaudeServiceError('RATE_LIMITED', 'Rate limited. Please retry shortly.');
    if (err.status === 529) return new ClaudeServiceError('OVERLOADED', 'The service is overloaded. Please retry shortly.');
    return new ClaudeServiceError('UPSTREAM_ERROR', 'The upstream service returned an error.');
  }
  if (err instanceof Anthropic.APIError) {
    // Errors sent as SSE events after a 200 response have no status, only a type.
    if (err.type === 'overloaded_error') return new ClaudeServiceError('OVERLOADED', 'The service is overloaded. Please retry shortly.');
    if (err.type === 'rate_limit_error') return new ClaudeServiceError('RATE_LIMITED', 'Rate limited. Please retry shortly.');
    // APIConnectionTimeoutError extends APIConnectionError.
    if (err instanceof Anthropic.APIConnectionError) {
      return new ClaudeServiceError('UPSTREAM_ERROR', 'Could not reach the upstream service.');
    }
    return new ClaudeServiceError('UPSTREAM_ERROR', 'The upstream service returned an error.');
  }
  return new ClaudeServiceError('INTERNAL_ERROR', 'Unexpected server error.');
}

export async function streamBlogPost({ system, messages, maxTokens, signal, onText }) {
  if (signal?.aborted) throw new StreamAbortedError();

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: Number.isInteger(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, MAX_TOKENS_CEILING) : MAX_TOKENS_CEILING,
    system,
    messages,
  });

  const onAbort = () => stream.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  stream.on('text', (delta) => onText?.(delta));

  try {
    const message = await stream.finalMessage();
    return { stopReason: message.stop_reason, usage: message.usage };
  } catch (err) {
    if (signal?.aborted || err instanceof Anthropic.APIUserAbortError) throw new StreamAbortedError();
    // Full error stays server-side; callers only see the mapped, safe one.
    console.error('Claude streaming error:', err);
    throw mapError(err);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
