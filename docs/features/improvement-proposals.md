# Project review: improvement proposals

Status: proposal, for review. Items 1-7 are planned in [platform-hardening](platform-hardening/00-requirement.md). Pick the rest later; none is scheduled.
Source: read-only review by a Fable-model agent on 2026-10-27. Backend (315) and frontend (179) tests passed at review time. Findings were not re-checked by a second reviewer.
Out of scope here: per-agent models, centralized agent spec and the LOG_LEVEL logger, already planned in [platform-hardening](platform-hardening/00-requirement.md) (B01-B13).

Size: S = small, M = medium, L = large.

## High

### 1. `/api/generate` is public, unmetered, and unused by the routed UI
- **Observed:** `backend/src/app.js:53` mounts `generateRouter` with no auth. `backend/src/routes/generate.js:11` has no rate limit. The only consumer is `frontend/src/App.jsx`, which `frontend/CLAUDE.md:13` says is "not routed" (`AppRoutes.jsx` never renders it). No `cors`, `helmet`, `express-rate-limit` or `trust proxy` anywhere in `backend/`.
- **Why it matters:** anyone who finds the URL can run 4096-token completions on the API key, unbounded.
- **Proposed fix:** either mount `/api/generate` behind `requireAdmin`, or delete it together with the dead `App.jsx`, `BlogForm`, `BlogOutput`, `useBlogGeneration` and `api/generate.js`. Either way add `express-rate-limit` (per IP on `/api/*`, stricter on `/api/admin/session` and run start) and `app.set('trust proxy', 1)` for deployment behind a proxy.
- **Size:** S (gate) / M (remove dead path and update docs).

### 2. A finished draft is lost when the DB insert fails
- **Observed:** `backend/src/services/pipeline.js:269-276` saves the draft only after the orchestrator finishes. A rejection falls to the catch at `:299-306` and becomes `fail('INTERNAL_ERROR')`, discarding the Markdown. `backend/src/db/blogsRepo.js:30-45` retries slug collisions only 5 times (`-2`..`-5`) then throws, so the sixth run with the same title always hits this path.
- **Why it matters:** the most expensive artefact of a run is dropped for a cheap, recoverable error.
- **Proposed fix:**
  - (a) on the last slug attempt use a `${base}-${runId.slice(0,8)}` suffix;
  - (b) retry the insert once with backoff on non-unique errors;
  - (c) keep `state.draftMd` on the run record so an admin endpoint (`GET /api/admin/runs/:id/draft`) or the final `error` payload can recover it.
- **Size:** S for (a)+(b), M with (c).

## Medium

### 3. No CI
- **Observed:** no `.github/` in the tree. `backend` and `frontend` each have `lint` and `test` scripts that nothing runs on push.
- **Proposed fix:** one workflow with a matrix over `backend` / `frontend`: `npm ci && npm run lint && npm test`, plus `npm run build` for the frontend and `npm audit --audit-level=high`. Optionally a root `package.json` with `workspaces` so `npm test` at the root runs both.
- **Size:** S.

### 4. Researcher retains every SDK message in memory just to collect sources
- **Observed:** `pipeline.js:134,153` pushes every message, including per-token `stream_event`s (`includePartialMessages: true`, `runAgentQuery.js:125`), into an array read only by `collectSources(messages)` at `:171`, which looks only at `type === 'user'` (`normalize.js:176`).
- **Why it matters:** a 12-turn research pass with WebFetch output accumulates megabytes per spawn for no reason.
- **Proposed fix:** push only `message.type === 'user'`, or call `collectSources` incrementally per message.
- **Size:** S.

### 5. Aborted-but-stuck runs escape the concurrency cap
- **Observed:** `backend/src/services/runRegistry.js:114-129` finishes a run `abortGraceMs` (5 s) after abort even if the pipeline promise is still pending. `activeRuns()` (`:60`) then lets `start()` admit a new run while the old SDK subprocess may still be billing. The code comment says this is intentional so a stuck run cannot block the server.
- **Proposed fix:** track `settling` runs (pipeline not yet resolved) and either block `start()` with a distinct 409 reason, or log a loud warning plus a counter. Also remove the `gaveUp` abort listener on normal completion (`:119`; harmless but untidy).
- **Size:** S.

### 6. Telegram via a stdio MCP child process (design choice; flag, don't force)
- **Observed:** `backend/src/services/notifier/telegramMcp.js:71-83` spawns a Node process per notification, pins `telegram-chat-bot-mcp@0.1.16` because 0.1.17 breaks `npm ci` on Linux/macOS (`backend/README.md:225`), must set `LOG_ENABLE_CONSOLE=false` so the server's logger does not corrupt the JSON-RPC channel (`:226`), and redacts stderr. About 150 lines plus two dependencies.
- **Alternative:** a single `fetch` to `https://api.telegram.org/bot<token>/sendMessage` with `AbortSignal.timeout` keeps the same `sent/failed/skipped` contract in about 25 lines, with no subprocess, no pin and no stdout footgun.
- **Uncertain:** whether MCP was a deliberate requirement (task b11 is titled "via the Bot API MCP server"). If so, keep it.
- **Size:** M.

### 7. Docs drift
- **Observed:** `frontend/CLAUDE.md:12` says admin pages "are placeholders until later tasks", but `AdminLoginPage` and `AdminGeneratePage` are complete. `:13` documents `App.jsx` as live but unrouted (see item 1). `backend/README.md` has no deployment section: the backend does not serve `frontend/dist` and has no CORS, so same-origin hosting is required but undocumented.
- **Proposed fix:** update the two lines. Add a "Deploy" section (serve `dist/` via `express.static` with an SPA fallback, or put both behind one reverse proxy).
- **Size:** S.

### 8. Test gaps
- **Observed (from file listing):**
  - no test for `backend/src/server.js` (SIGTERM -> `runRegistry.shutdown()` -> `server.close` -> forced exit at `:43`);
  - no dedicated frontend tests for `pages/AdminLoginPage.jsx` (including the `safeNext` open-redirect guard at `:7-12`), `components/agent/RunMessage.jsx`, `ToolCallItem.jsx`, `layouts/*`, `api/admin.js`, `api/adminBlogs.js`, `api/blogs.js`, `api/http.js`. Some are exercised indirectly through page tests. `api/stream.js` is covered via `generate.test.js` / `runs.test.js`.
- **Proposed fix:** highest value first: a unit test for `safeNext` and the 401-clears-token path in `api/admin.js`. A `server.js` test can import it with mocked `app.listen` and `runRegistry`.
- **Size:** M.

## Low

### 9. Remote images in generated/published Markdown
- **Observed:** `frontend/src/components/MarkdownView.jsx:47` uses rehype-sanitize's default schema, which allows `<img>` with http(s) `src`. No caller passes `urlTransform`. The writer prompt (`backend/src/prompts/writer.js`) does not forbid images.
- **Why it matters:** a researcher-fetched page can seed tracking pixels or mixed-content images into a public post.
- **Proposed fix:** pass a schema with `img` removed (or https-only), and add "no images" to the writer rules.
- **Size:** S.

### 10. Public slug route has no param validation or caching
- **Observed:** `backend/src/routes/blogs.js:39` passes `req.params.slug` straight to the DB. No `Cache-Control` / `ETag` on `GET /api/blogs*`.
- **Proposed fix:** `validateParams` with `z.string().max(80).regex(/^[a-z0-9-]+$/)`. Add `Cache-Control: public, max-age=60` on public reads.
- **Size:** S.

### 11. Admin auth model
- **Observed:** a single static bearer equal to the env var, kept in `sessionStorage` (`frontend/src/api/auth.js:19`), with no expiry or rotation. `requireAdmin.js` itself is correct (sha256 + `timingSafeEqual`). No `helmet` / CSP headers.
- **Note:** fine for one operator. If anyone else gets access, move to an HttpOnly session cookie issued after token exchange, with `SameSite=Strict`.
- **Size:** M (sessions) / S (helmet).

### 12. Three copies of the error-message table
- **Observed:** `pipeline.js:24-35`, `runAgentQuery.js:19-25` and `orchestrator/tools.js:17-26` each define overlapping `MESSAGES`. `pipeline.js:19-21` and `telegramMcp.js` both list the Telegram codes. platform-hardening B04/B05 centralizes tool names and models but not these.
- **Proposed fix:** one `backend/src/services/errors.js` exporting `MESSAGES`, `DIGEST_ERROR_CODES`, `NOTIFY_ERROR_CODES`.
- **Size:** S.

### 13. Developer ergonomics
- **Observed:** backend ESLint is `js.recommended` only (`backend/eslint.config.js`). No Prettier or other formatter in either package. No `engines` in `frontend/package.json`. No root scripts to start both servers.
- **Proposed fix:** add Prettier (or `eslint-plugin-stylistic`) with a `format:check` step in CI. Add a root `package.json` with `concurrently` for `dev`.
- **Size:** S.

## Verified as fine (no action)

- SSE write-after-end guard (`lib/sse.js:15-22`), client-disconnect abort on `/api/generate` (`generate.js:20-23`), replay/snapshot logic and final-event fencing in `runRegistry.js`, and run-registry memory (bounded: at most 5000 events of at most 4 KB per retained run, concurrency 1, 30 min retention).
- Prompt-injection handling: all untrusted text is XML-escaped and wrapped (`prompts/util.js`), the writer has no tools, the orchestrator sees only numeric digests with an allow-listed error code (`orchestrator/state.js:19-29`), spawn args are schema-checked and `focus` is never echoed on rejection (`tools.js:56-60`).
- Agent sandboxing: env allowlist, temp `cwd` / `HOME`, `DISALLOWED_TOOLS`, init-tools assertion treated as a security violation (`runAgentQuery.js:29-35, 132-142`).
- Open-redirect guard on login `next` (`AdminLoginPage.jsx:7-12`).

## Suggested pick order

1. Items 1 and 2 (cost exposure and lost work).
2. Items 3 and 4 (cheap, remove ongoing risk).
3. The rest by appetite.
