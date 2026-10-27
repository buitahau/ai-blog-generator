// Error-code sets for the admin run chat. Codes come from the backend run events
// or are produced by the client itself (api/stream.js, api/runs.js, useAgentRun).
// Shared with the single-shot generator (App.jsx).
export const RETRYABLE_ERRORS = new Set([
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
  'STREAM_INTERRUPTED',
  'NETWORK_ERROR',
  'HTTP_ERROR',
]);
export const BUSY_ERRORS = new Set(['RATE_LIMITED', 'OVERLOADED']);

export const RETRYABLE_RUN_ERRORS = new Set([
  ...RETRYABLE_ERRORS,
  ...BUSY_ERRORS,
  'WRITER_EMPTY',
  'RUN_LOST',
  'AGENT_MAX_TURNS',
  'AGENT_BUDGET_EXCEEDED',
  'RESEARCH_EMPTY',
  'RUN_TIMEOUT',
  'NO_DRAFT',
  'AGENT_TIMEOUT',
  'SERVER_SHUTDOWN',
]);

export const RUN_IN_PROGRESS = 'RUN_IN_PROGRESS';

// No Alert: the route guard redirects on UNAUTHORIZED, and NOT_FOUND is a stale run reset quietly.
export const SILENT_RUN_ERRORS = new Set(['UNAUTHORIZED', 'NOT_FOUND']);

export const TELEGRAM_ERRORS = {
  TELEGRAM_UNAUTHORIZED: 'Telegram bot token was rejected.',
  TELEGRAM_CHAT_NOT_FOUND: 'Telegram chat was not found.',
  TELEGRAM_TIMEOUT: 'Telegram did not respond in time.',
  TELEGRAM_ERROR: 'Telegram returned an error.',
};

// Labels for the "Retrying (...)" line shown while the SDK retries a transient failure.
export const RETRY_LABEL = { RATE_LIMITED: 'rate limit', OVERLOADED: 'overloaded', UPSTREAM_ERROR: 'server error' };
