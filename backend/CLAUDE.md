# Backend

Express 5 (ESM, Node >= 22) API that wraps the Anthropic SDK and streams blog posts over SSE. Human-facing docs and the API contract: [README.md](README.md).

## Layout

```
src/
  server.js              entry: loads config, asserts key, listens
  app.js                 createApp(): JSON parsing (10 KB limit), /api/health, router mounting, 404 + error handler
  config.js              dotenv, MODEL, PORT, LENGTH_PRESETS, MAX_TOKENS_CEILING, REQUEST_TIMEOUT_MS, assertConfig()
  validation/generateSchema.js   zod strictObject for the generate body (TONES, LENGTHS)
  middleware/validate.js         schema -> 400 VALIDATION_ERROR with details
  prompts/blogPost.js            buildBlogPrompt(): system + messages
  services/claude.js             streamBlogPost(), error mapping, ClaudeServiceError, StreamAbortedError
  routes/generate.js             POST /api/generate (SSE)
  lib/sse.js                     initSse, sendEvent, sendComment
test/                    vitest + supertest
```

## Commands

Run from `backend/`:

```
npm run dev     # node --watch src/server.js
npm start       # node src/server.js
npm test        # vitest run
npm run lint    # eslint .
```

## Rules

- `ANTHROPIC_API_KEY` lives only in `backend/.env` (gitignored). `.env.example` holds placeholders only. Never log or return the key.
- The model ID lives only in `src/config.js` (`DEFAULT_MODEL`, overridable via `ANTHROPIC_MODEL`). Import `MODEL`; never write a model string elsewhere.
- Prompts stay in `src/prompts/`. Route handlers only call the builders.
- The client can never set `max_tokens` or `model`. `max_tokens` comes from `LENGTH_PRESETS[length]` and is clamped to `MAX_TOKENS_CEILING` in the service. The schema is `strictObject`, so extra fields are rejected.
- SDK errors are logged with `console.error` and mapped to a safe `{ code, message }`; raw SDK messages are never sent to the client.
- Validate every request body in `validation/` and cap input sizes.
- Client disconnect aborts the upstream stream (`AbortController`); keep that path intact when editing the route.
- Tests mock the SDK (and never need a real key or network). Importing `config.js` must not require a key; the check lives in `assertConfig()`, called from `server.js`.
- Keep comments sparse and about why.

## Before changing SDK code

Check the `claude-api` skill for current model IDs, streaming usage, and SDK behavior before touching `src/services/claude.js` or `DEFAULT_MODEL`.
