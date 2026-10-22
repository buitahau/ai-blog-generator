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

// Called at startup rather than on import so tests can import this module without a key.
export function assertConfig(env = process.env) {
  if (!env.ANTHROPIC_API_KEY || !env.ANTHROPIC_API_KEY.trim()) {
    throw new Error('Config error: missing ANTHROPIC_API_KEY. Set it in backend/.env (see .env.example).');
  }
  if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
    throw new Error('Config error: missing DATABASE_URL. Set it in backend/.env (see .env.example).');
  }
}
