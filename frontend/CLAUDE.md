# Frontend

React 18 + Ant Design 5 (Vite, ESM) UI that streams blog posts from the backend over SSE. Human-facing docs: [README.md](README.md). Backend contract: [../backend/README.md](../backend/README.md).

## Layout

```
src/
  main.jsx                       entry: BrowserRouter + <AppRoutes />
  AppRoutes.jsx                  route table: / , /blogs/:slug, /admin/login, /admin/generate, /admin/blogs, * (404)
  layouts/                       PublicLayout (header + Outlet), AdminLayout (Sider Menu: Generate, Blogs, Logout)
  pages/                         route pages (BlogListPage at /, BlogDetailPage at /blogs/:slug; AdminBlogsPage at /admin/blogs; others are placeholders until later tasks)
  App.jsx                        old form page (form + output + error Alerts, retry); not routed, tests still run
  api/stream.js                  streamSse(): generic SSE client (error normalising, quiet abort, final events, SSE id, optional admin auth + 401 clear)
  api/generate.js                streamGenerate(): thin wrapper over streamSse for POST /api/generate
  api/runs.js                    startRun/getActiveRun/cancelRun (adminRequest), subscribeRun (streamSse with Last-Event-ID)
  api/blogs.js                   listBlogs(), getBlog(): GET /api/blogs, normalised { code, message, details? } rejections
  api/http.js                    safeJson(), readHttpError(): shared by generate.js and blogs.js
  api/auth.js                    sessionStorage token (get/set/clear/subscribeToken), checkToken(): GET /api/admin/session
  api/adminBlogs.js              listAdminBlogs/getAdminBlog/publishBlog/unpublishBlog/deleteBlog via adminRequest
  api/admin.js                   adminRequest(): Bearer header; on 401 clears token, rejects {code:'UNAUTHORIZED'} (no navigation)
  api/sse.js                     createSseParser(): pure SSE frame parser
  hooks/useBlogGeneration.js     state machine (idle/streaming/done/error/cancelled), batched deltas, cancel
  hooks/useAgentRun.js           admin run state (reducer over run events), rAF-batched deltas, Last-Event-ID reconnect (3x), reattach via getActiveRun (mount probe silent, direct `reattach()` reports failures; NOT_FOUND before the first event = idle, after = RUN_LOST), start/cancel; unmount only unsubscribes. Run state shape below
  components/agent/              RunMessage (steps + panels + alerts), AgentPanel (researcher/writer instance), OrchestratorPanel (decisions timeline + orchestrator text), useAgentBox (shared box style + pin-to-bottom), ToolCallItem
  components/RequireAdmin.jsx    route guard: no token -> /admin/login?next=<path>; reacts to token clears
  components/BlogForm.jsx        antd Form (topic, tone, length, audience, keywords)
  components/BlogOutput.jsx      copy + status Alerts around MarkdownView
  components/MarkdownView.jsx    shared sanitized Markdown rendering (react-markdown + rehype-sanitize)
  constants/options.js           TONE_OPTIONS, LENGTH_OPTIONS, DEFAULTS, LIMITS, PAGE_MAX (mirror the backend schemas)
  constants/errors.js            error-code sets (RETRYABLE_ERRORS, BUSY_ERRORS, RETRYABLE_RUN_ERRORS, SILENT_RUN_ERRORS, TELEGRAM_ERRORS, RETRY_LABEL, RUN_IN_PROGRESS)
  test-setup.js                  vitest setup
```

Tests sit next to the code as `*.test.js(x)`. Routing uses `react-router-dom` v6; deep links work through Vite's SPA fallback.

## Run state (useAgentRun)

`runReducer` state: `runId`, `title`, `status` (`idle | starting | running | reconnecting | done | cancelled | error`), `steps`, `instances`, `order`, `decisions`, `blog`, `notification`, `error`, `totalCostUsd`, `cancelling`, plus `history` (finished runs, kept across `begin`/`idle`).

- `instances`: map keyed `${agent}:${spawn}` (`instanceKey(agent, spawn)`; a missing spawn means 1, and the orchestrator is always `orchestrator:1`). Each: `status` (`idle | running | completed | failed | cancelled`), `text`, `tools`, `heartbeat`, `retrying` (`{ category, attempt }`), `usage`, `numTurns`, `costUsd`, `error` (`{ code, message? }`). Only `agent_started` creates an instance; events for unknown keys are ignored. A replayed `agent_started` never resets an existing instance.
- `order`: instance keys in start order. `RunMessage` renders the orchestrator through `OrchestratorPanel` and every other key through `AgentPanel` (title gets "(pass N)" when spawn > 1), so a re-run researcher shows as a second panel.
- `decisions`: one entry per `orchestrator_action`: `{ action, accepted, spawn, focus, reason }`. Rejected ones show the reason (`LIMIT_REACHED`, `BUDGET_EXHAUSTED`, `SPAWN_IN_PROGRESS`, `INVALID_INPUT`).
- `steps`: `plan | research | write | save | notify`, each `pending | active | done | failed | skipped`. `plan`/`research`/`write` are derived from the instances after every event (never set directly): any running = `active`, else any completed = `done`, else all failed/cancelled = `failed`, no instance but orchestrator done = `skipped` (research/write only). `plan` is also `failed` when the final error comes from the orchestrator (e.g. `NO_DRAFT`). `save` is set by `blog_saved`, `notify` by `notification` (`sent` = done, `failed` = failed, else skipped).
- `error`: `{ code, message, agent? }` from a run `error` event, or `{ code, message }` for client failures (start error, `RUN_LOST`, transport). An `error` event marks the named instance (the orchestrator, or a sub-agent with `spawn`) `failed` with its `error`, unless already completed; every other open instance becomes `failed` without an `error` (a sub-agent error without `spawn` cannot name its instance). A failed cancel or direct reattach (`soft_error`) sets `error` but leaves `status` unchanged, so Retry (which checks `status === 'error'`) does not show. `run_cancelled` and `run_completed` close still-running instances as `cancelled`, so a cancelled run shows `failed` steps for work that did not finish.
- `text_batch` (rAF-batched deltas) is keyed by instance key.

Error sets in `constants/errors.js`: `RETRYABLE_RUN_ERRORS` (Retry button in `RunMessage` when status is `error`; composed of `RETRYABLE_ERRORS` + `BUSY_ERRORS` + run-specific codes such as `RUN_LOST`, `NO_DRAFT`, `RUN_TIMEOUT`; `INTERNAL_ERROR` is among the retryable ones; see the file for the exact list), `SILENT_RUN_ERRORS` (no Alert), `TELEGRAM_ERRORS`, and `RETRY_LABEL` (category to text for the "Retrying (...)" line in both panels: `RATE_LIMITED`, `OVERLOADED`, `UPSTREAM_ERROR`). A failed instance shows `error.message` in its panel.

## Commands

Run from `frontend/`:

```
npm run dev      # vite dev server on http://localhost:5173
npm run build    # vite build -> dist/
npm run preview  # serve the built bundle
npm test         # vitest run (jsdom)
npm run lint     # eslint .
```

## Rules

- No `@anthropic-ai/sdk` and no API keys in the front-end. The browser only talks to our backend. `grep -ri anthropic src package.json` must return nothing.
- API calls live only in `src/api/`. Components and hooks call `streamGenerate`, `listBlogs`, `getBlog`, the `api/adminBlogs.js` functions and the `api/runs.js` functions (`startRun`/`getActiveRun`/`cancelRun`/`subscribeRun`), the admin ones going through `adminRequest`; they never use `fetch` directly. `listBlogs`/`getBlog` reject with `{ code, message, details? }` or an `AbortError` on cancel. Shared HTTP helpers live in `api/http.js`.
- The Vite dev proxy (`vite.config.js`) forwards `/api` to `http://localhost:3001` and sends `Accept-Encoding: identity` so SSE chunks are not buffered. Use relative URLs (`/api/generate`) only.
- Prefer antd components and theme tokens (`theme.useToken()`) over custom CSS.
- Markdown rendering stays sanitized: `react-markdown` with `rehype-sanitize`; never add `rehype-raw` or `dangerouslySetInnerHTML`.
- Errors are shown through antd `message` / `Alert`. `streamGenerate` reports errors as `{ code, message, details? }` via `onError`. Codes handled in `App.jsx`:
  - `VALIDATION_ERROR`: `message.error` plus per-field errors in the form (from `details`).
  - `RATE_LIMITED`, `OVERLOADED`: warning Alert, no retry button.
  - `UPSTREAM_ERROR`, `INTERNAL_ERROR`: error Alert with Retry.
  - `STREAM_INTERRUPTED`, `NETWORK_ERROR`, `HTTP_ERROR`: error Alert with Retry. These three are produced by the client itself in `api/stream.js` (stream cut off, fetch failed, non-OK response with no `error.code` in the body, including the Vite proxy's 502 when the backend is down; in dev that shows up as `HTTP_ERROR`, not `NETWORK_ERROR`).
  - `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` and any other code: plain error Alert, no retry.
- Abort is a cancel: `streamGenerate` resolves quietly without `onError`. Keep that path intact; the hook ignores callbacks from superseded requests.
- `constants/options.js` mirrors `backend/src/validation/generateSchema.js`; change both together.
- Tests mock `fetch`; they never need the backend or a key.
- Function components + hooks. Keep comments sparse and about why.
