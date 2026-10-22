import 'dotenv/config';

// Only place a model ID may appear; override per environment with ANTHROPIC_MODEL.
const DEFAULT_MODEL = 'claude-opus-5-5';

export const MODEL = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
export const PORT = Number(process.env.PORT) || 3001;

// Hard cap on max_tokens for any request, regardless of preset.
export const MAX_TOKENS_CEILING = 4096;

export const LENGTH_PRESETS = Object.freeze({
  short: { words: 400, maxTokens: 1024 },
  medium: { words: 800, maxTokens: 2048 },
  long: { words: 1500, maxTokens: 4096 },
});

export const REQUEST_TIMEOUT_MS = 60_000;

export const ADMIN_TOKEN_MIN_LENGTH = 32;

// Called at startup rather than on import so tests can import this module without a key.
export function assertConfig(env = process.env) {
  if (!env.ANTHROPIC_API_KEY || !env.ANTHROPIC_API_KEY.trim()) {
    throw new Error('Config error: missing ANTHROPIC_API_KEY. Set it in backend/.env (see .env.example).');
  }
  if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
    throw new Error('Config error: missing DATABASE_URL. Set it in backend/.env (see .env.example).');
  }
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < ADMIN_TOKEN_MIN_LENGTH) {
    throw new Error(`Config error: ADMIN_TOKEN must be at least ${ADMIN_TOKEN_MIN_LENGTH} characters. Set it in backend/.env (see .env.example).`);
  }
}

// Agent run limits; the client-side budget estimate may overshoot slightly.
export const DEFAULT_TONE = 'professional';
export const DEFAULT_LENGTH = 'medium';
export const RESEARCH_MAX_TURNS = 12;
export const RESEARCH_MAX_BUDGET_USD = 1.0;
export const WRITER_MAX_TURNS = 2;
export const WRITER_MAX_BUDGET_USD = 0.5;
export const RUN_TIMEOUT_MS = 10 * 60_000;

// Run registry limits (B10).
export const MAX_CONCURRENT_RUNS = 1;
export const RUN_EVENT_BUFFER_MAX = 5000;
export const RUN_RETENTION_MS = 30 * 60_000;
export const SHUTDOWN_WAIT_MS = 10_000;
// How long an aborted run may take to settle before the registry finishes it anyway.
export const ABORT_GRACE_MS = 5000;
export const HEARTBEAT_MS = 15_000;

// Telegram notification (B11); default per attempt. services/notifier/index.js lets TELEGRAM_NOTIFY_TIMEOUT_MS override it.
// The Telegram server timeout is derived from it (minus 3 s) so a delivered message is never retried.
export const TELEGRAM_NOTIFY_TIMEOUT_MS = 15_000;
