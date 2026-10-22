# Backend

Express 5 (ESM, Node >= 22) API that wraps the Anthropic SDK and streams blog posts over SSE. Human-facing docs and the API contract: [README.md](README.md).

## Layout

```
src/
  server.js              entry: loads config, asserts key, listens; SIGTERM/SIGINT call runRegistry.shutdown() then close the server
  app.js                 createApp(): JSON parsing (10 KB limit), /api/health, router mounting, 404 + error handler
  config.js              dotenv, MODEL, PORT, LENGTH_PRESETS, MAX_TOKENS_CEILING, REQUEST_TIMEOUT_MS, RESEARCH_/WRITER_MAX_TURNS, RESEARCH_/WRITER_MAX_BUDGET_USD, RUN_TIMEOUT_MS, ABORT_GRACE_MS, HEARTBEAT_MS, MAX_CONCURRENT_RUNS, RUN_EVENT_BUFFER_MAX, RUN_RETENTION_MS, SHUTDOWN_WAIT_MS, assertConfig()
  validation/generateSchema.js   zod strictObject for the generate body (TONES, LENGTHS)
  validation/runSchema.js        zod strictObject for POST /api/admin/runs ({title}, trimmed 3-200)
  validation/blogsSchema.js      zod query schema + PAGE_SIZE_MAX (shared pagination schema)
  middleware/requireAdmin.js     Bearer ADMIN_TOKEN check (sha256 + timingSafeEqual) -> 401 UNAUTHORIZED
  middleware/validate.js         validate (body) / validateQuery (res.locals.query) / validateParams (res.locals.params) -> 400 VALIDATION_ERROR
  prompts/blogPost.js            buildBlogPrompt(): system + messages
  prompts/util.js                escapeXml, escapeAngle, tag helpers for untrusted prompt text
  prompts/researcher.js          RESEARCHER_SYSTEM, buildResearchTask() (includes today's date)
  prompts/writer.js              WRITER_SYSTEM, buildWriterTask() (title, notes, sources, tone, length)
  services/claude.js             streamBlogPost(), error mapping, ClaudeServiceError, StreamAbortedError
  services/agents/runAgentQuery.js  runAgentQuery() wraps Agent SDK query() with hardened options, AgentError
  services/agents/definitions.js    AGENTS: researcher (web tools only) and writer (no tools) definitions
  services/agents/normalize.js      createNormalizer(agent) (SDK message -> run events), collectSources()
  services/notifier/                Telegram notifier (planned in B11; pipeline uses a no-op notifier until then)
  services/pipeline.js              runPipeline(): researcher -> writer -> createDraft -> notify, throttled text deltas
  services/runRegistry.js           per-run id, status, AbortController, event buffer with ids + replay, subscribers, concurrency cap, timeout, shutdown()
  routes/generate.js             POST /api/generate (SSE)
  routes/blogs.js                GET /api/blogs, /api/blogs/:slug (createBlogsRouter(repo))
  routes/admin.js                GET /api/admin/session (204); mounts adminBlogs and adminRuns behind requireAdmin
  routes/adminBlogs.js           /api/admin/blogs list, get, publish, unpublish, delete (createAdminBlogsRouter(repo))
  routes/adminRuns.js            /api/admin/runs start, active, cancel, events (SSE with Last-Event-ID replay) (createAdminRunsRouter(registry))
  lib/sse.js                     initSse, sendEvent (optional id), sendComment
  lib/slug.js                    slugify()
  db/blogsRepo.js                createBlogsRepo(db), default blogsRepo (lazy getDb())
  db/schema.js, db/client.js     Drizzle schema (blogs), lazy getDb() on Neon (needs DATABASE_URL only when called)
scripts/migrate.js       npm run db:migrate
scripts/agent-smoke.js   manual agent smoke test; --record <name> writes scrubbed fixture
drizzle/                 generated SQL migrations (committed; npm run db:generate)
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
- On `/api/generate`, client disconnect aborts the upstream stream (`AbortController`); keep that path intact when editing the route.
- Admin runs (`/api/admin/runs`) intentionally keep running after a subscriber disconnects; only cancel, timeout or shutdown abort them.
- Tests mock the SDK (and never need a real key or network). Importing `config.js` must not require a key; the check lives in `assertConfig()`, called from `server.js`.
- Keep comments sparse and about why.

## Before changing SDK code

Check the `claude-api` skill for current model IDs, streaming usage, and SDK behavior before touching `src/services/claude.js` or `DEFAULT_MODEL`.
