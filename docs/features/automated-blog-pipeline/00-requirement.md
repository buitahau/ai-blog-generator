# Automated blog pipeline

## Summary

An admin types a title into a chat. A background run on the server researches the topic with a researcher agent (Agent SDK built-in WebSearch/WebFetch), then a writer agent turns the notes into Markdown. The backend saves the result as a draft in Neon Postgres via Drizzle and sends a Telegram notification via MCP. Everything streams to the chat over SSE with event ids, so the run continues if the admin leaves the page and the chat reattaches.

The admin reviews drafts on a second page (preview, publish, unpublish, delete). The public site lists published posts at `/` and shows each post at `/blogs/:slug`.

Constraints:

- The existing `POST /api/generate` and its `@anthropic-ai/sdk` code stay untouched.
- The model ID stays in the single `MODEL` constant in `backend/src/config.js`.
- Repo layout: `frontend/` (React + Vite + antd), `backend/` (Express 5, `@anthropic-ai/sdk`, zod, SSE at `POST /api/generate`).

## Goals

- Turn an admin-typed title into a saved, reviewable draft with live visibility into the agents' work.
- Publish reviewed drafts to a public blog list and detail pages.
- Notify the admin when a draft is ready.

## Decisions

1. **SDK: two sequential `query()` calls with the `agent` option.** Uses `@anthropic-ai/claude-agent-sdk`. Each agent runs as its own `query()` call using the SDK `agent` option, so order is fixed in code and main-thread text streaming works (`includePartialMessages`). Rejected: one orchestrator spawning subagents via the Agent tool (order only prompt-enforced, subagent text not streamed).
2. **Notification: Telegram via MCP server `telegram-chat-bot-mcp` (ice3x2), pinned at exactly `0.1.16`.** 0.1.17 is rejected: it lists `@rollup/rollup-win32-x64-msvc` as a normal dependency, so `npm ci` fails with EBADPLATFORM on Linux and macOS. 0.1.16 exposes the same `send_telegram_text {text}` tool over stdio and calls Bot API `sendMessage`. The server runs over stdio, exposes the tool `send_telegram_text {text}`, and calls the Bot API `sendMessage`. The chat id is fixed by env `TELEGRAM_CHAT_ID`. The backend acts as a direct MCP client (`StdioClientTransport`, binary resolved from `node_modules` via `createRequire`, not `npx`) and calls only the allowlisted tool. The MCP server is NOT attached to agents (`mcpServers: {}`).
   - Fallback server: `@null-topology/telegram-bot-mcp-server` (env `TELEGRAM_BOT_API_TOKEN`, tool `send-message {chatId,text}`, about 50 tools including destructive ones such as `delete-message`, `kick-chat-member`, `leave-chat`). Acceptable only because the backend allowlists a single tool; not a smaller surface than `telegram-api-mcp`. Emergency contingency (needs user approval, because it drops MCP): call `https://api.telegram.org/bot<token>/sendMessage` with `fetch` behind the same `notify()` interface.
   - Rejected: `chaindead/telegram-mcp` (`tg_send` only saves a draft via `MessagesSaveDraft` and uses a full user session).
   - Rejected: `telegram-api-mcp` (185 tools including delete, ban, and Stars).
   - Notification goes to one private chat (assumption). A group also works with a negative chat id.
3. **DB: Neon Postgres + Drizzle.** Uses `drizzle-orm/neon-http` with `@neondatabase/serverless`, `drizzle-kit` for migrations. Tests use PGlite (`@electric-sql/pglite`) applying the same migrations. Route tests mock the repo.
4. **Runs survive leaving the page.** Server-side background run with an event buffer, `Last-Event-ID` replay, and `GET /api/admin/runs/active` for reattach.

## Functional requirements

- **Public site**
  - Paginated list of published posts at `/`.
  - Detail page at `/blogs/:slug`.
- **Admin page 1: chat (`/admin/generate`)**
  - The admin types a title. A background run starts on the server:
    1. Researcher agent (Agent SDK built-in WebSearch/WebFetch).
    2. Writer agent turns the notes into Markdown.
  - Both agents are separate `query()` calls run sequentially, each using the SDK `agent` option.
  - The backend then saves a draft to Neon Postgres via Drizzle, then sends a Telegram notification via MCP.
  - Everything streams to the chat via SSE with event ids for reconnect and replay.
  - The run continues if the admin leaves the page, and the chat reattaches.
- **Admin page 2: blogs (`/admin/blogs`)**
  - Review drafts, preview, publish, unpublish, delete.
- **Admin access**
  - A single `ADMIN_TOKEN` from env, sent as `Authorization: Bearer`.
  - Compared with sha256 digests and `crypto.timingSafeEqual`.
  - No cookies, sessions, or rate limiting.

## Non-functional requirements

- **Security and secrets**
  - Secrets live only in `backend/.env` (gitignored): `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ADMIN_TOKEN` (>= 32 chars), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
  - `.env.example` is committed with placeholder values.
  - Agent subprocess env is allowlisted (`PATH`, `HOME` = temp dir, `ANTHROPIC_API_KEY`). It never contains `DATABASE_URL`, `ADMIN_TOKEN`, or `TELEGRAM_*`.
  - Repo-root `.mcp.json` holds a plaintext GitHub token (gitignored). Agents must not load it. Recommend rotating the token if it was ever shared.
- **Agent hardening**
  - `tools` limits the tool set: researcher `['WebSearch','WebFetch']`, writer `[]`.
  - `allowedTools` is the same as `tools`.
  - `disallowedTools` lists file and shell tools.
  - `permissionMode: 'dontAsk'` (denies anything not pre-approved). No `canUseTool`: it would never run, because `allowedTools` pre-approves the allowed tools and `dontAsk` denies the rest.
  - `settingSources: []`, `strictMcpConfig: true`, `mcpServers: {}`, `persistSession: false`.
  - Fresh empty temp cwd per run, deleted afterwards.
- **Cost**
  - `maxTurns`: researcher 12, writer 2.
  - `maxBudgetUsd`: researcher 1.00, writer 0.50. The client-side estimate may overshoot.
  - `RUN_TIMEOUT_MS`: 10 minutes.
  - One run at a time.
- **Prompt injection**
  - Research notes go into the writer prompt inside `<research_notes>` as untrusted data.
  - The writer has no tools.
  - Publishing is manual.
- **Responsiveness (the UI must not hang)**
  - SSE heartbeat every 15 s, plus forwarded `tool_progress` heartbeats.
  - Events are <= ~4 KB.
  - Tool results are trimmed: <= 10 items, 200-char snippets, never page bodies.
  - The front-end batches deltas per animation frame.
  - Plain `pre-wrap` text while streaming, Markdown when done.
  - Panels scroll with a max height; tool output is collapsed.
- **Testing**
  - vitest. No network.
  - `query()` is mocked as an async generator of recorded SDK messages.
  - PGlite for the DB.
  - MCP client and fetch are mocked.
- **Conventions (from CLAUDE.md)**
  - API key only in the backend.
  - Prompts in `backend/src/prompts`.
  - zod validation.
  - antd UI.
  - Sanitized Markdown (no `rehype-raw`, no `dangerouslySetInnerHTML`).
  - API calls in `src/api`.
  - Function components and hooks.

## Configuration

"Env" = read from `process.env` in `config.js`. "Const" = code constant in `config.js`, not env-overridable (so a stray env value cannot raise the budget).

| Key | Env/Const | Required | Default | Owner task |
|-----|-----------|----------|---------|------------|
| `DATABASE_URL` | Env | yes (assertConfig) | - | B01 |
| `ADMIN_TOKEN` | Env | yes, >= 32 chars | - | B04 |
| `RESEARCH_MAX_TURNS` / `WRITER_MAX_TURNS` | Const | - | 12 / 2 | B06 |
| `RESEARCH_MAX_BUDGET_USD` / `WRITER_MAX_BUDGET_USD` | Const | - | 1.00 / 0.50 | B06 |
| `RUN_TIMEOUT_MS` | Const | - | 600000 | B06 (used by B10) |
| `MAX_CONCURRENT_RUNS` | Const | - | 1 | B10 |
| `RUN_EVENT_BUFFER_MAX` | Const | - | 5000 | B10 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Env | no (missing means skipped) | - | B11 |
| `TELEGRAM_NOTIFY_TIMEOUT_MS` | Env | no | 15000 | B11 |
| `ADMIN_BASE_URL` | Env | no | http://localhost:5173 | B11 |

B01, B04, B06, B10 and B11 each edit `config.js`, `.env.example` and the README. Merge in task order and rebase; append, don't reorder.

## Assumptions

- Chat is single-shot: each message starts a new run. History is kept only for the browser session.
- Admin input is the title only (3-200 characters). The writer uses the default tone and length.
- Output language follows the title language.
- Slugs strip diacritics, including `đ`.
- Management is list, filter, preview, publish, unpublish, delete. No editing.
- Sources are collected by our code from WebSearch/WebFetch results and stored as jsonb (max 20, deduplicated).
- One active run at a time: `MAX_CONCURRENT_RUNS=1`, otherwise `409 RUN_IN_PROGRESS`.
- The backend host is a long-lived Node server that can spawn child processes and has a writable temp dir. No serverless.
- Telegram notification goes to one private chat. A group also works with a negative chat id.

### Existing code to reuse

- `backend/src/lib/sse.js`: add an optional `id` field.
- `backend/src/routes/generate.js`: heartbeat and close pattern.
- `backend/src/prompts/blogPost.js`: `escapeXml` and `tag` move to `prompts/util.js`.
- `backend/src/middleware/validate.js`, `backend/src/config.js`.
- `backend/src/services/claude.js`: stays as is.
- `frontend/src/api/sse.js`, `frontend/src/api/generate.js`.
- `frontend/src/hooks/useBlogGeneration.js`: rAF batching.
- `frontend/src/components/BlogOutput.jsx`: extract `MarkdownView`.

## Tasks

Task IDs are per side. Backend tasks are B01-B11 and front-end tasks are F01-F08.

| # | Task | Side | Size | Depends on |
|---|------|------|------|------------|
| B01 | [Add Neon + Drizzle schema, client and migrations](b01-neon-drizzle-schema-migrations.md) | backend | M | - |
| B02 | [Implement blogs repository and slug helper](b02-blogs-repository-slug-helper.md) | backend | M | B01 |
| B03 | [Expose public blogs read API](b03-public-blogs-read-api.md) | backend | S | B02 |
| B04 | [Add admin token auth middleware](b04-admin-token-auth-middleware.md) | backend | S | - |
| B05 | [Expose admin blogs management API](b05-admin-blogs-management-api.md) | backend | S | B02, B04 |
| B06 | [Add Agent SDK runner with hardened options](b06-agent-sdk-runner-hardened-options.md) | backend | M | - |
| B07 | [Normalize SDK messages into compact run events](b07-normalize-sdk-messages-run-events.md) | backend | M | B06 |
| B08 | [Define researcher and writer agents and prompts](b08-researcher-writer-agents-prompts.md) | backend | S | - |
| B09 | [Implement fixed-order research -> write -> save-draft pipeline](b09-fixed-order-research-write-save-pipeline.md) | backend | M | B02, B06, B07, B08 |
| B10 | [Add run registry and admin run SSE endpoints](b10-run-registry-admin-run-sse-endpoints.md) | backend | M | B04, B09 |
| B11 | [Send admin Telegram notification via the Bot API MCP server](b11-telegram-notification-bot-api-mcp.md) | backend | M | B09 |
| F01 | [Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md) | front-end | M | - |
| F02 | [Build public blog list page with pagination](f02-public-blog-list-page-pagination.md) | front-end | S | F01 |
| F03 | [Build public blog detail page](f03-public-blog-detail-page.md) | front-end | S | F01 |
| F04 | [Add admin token login and route guard](f04-admin-token-login-route-guard.md) | front-end | S | F01 |
| F05 | [Build admin blogs management page](f05-admin-blogs-management-page.md) | front-end | M | F01, F04 |
| F06 | [Make SSE client generic and add runs API](f06-generic-sse-client-runs-api.md) | front-end | M | F04 |
| F07 | [Implement useAgentRun hook](f07-use-agent-run-hook.md) | front-end | M | F06 |
| F08 | [Build admin chat page with live agent activity](f08-admin-chat-page-live-agent-activity.md) | front-end | M | F01, F04, F07 |

## Risks

- **Agent SDK runs a subprocess per `query()` call.**
  - Each subprocess uses hundreds of MB and needs the bundled binary, child-process permission, and a temp dir.
  - Pin the SDK version, keep fixture tests.
  - Message shapes may drift.
- **Budget overshoot.** The client-side cost estimate may overshoot `maxBudgetUsd`.
- **Prompt injection from web content.** Mitigations: untrusted-data delimiting in the writer prompt, the writer has no tools, publishing is manual.
- **Neon.**
  - `neon-http` has no interactive transactions, so slug uniqueness uses insert-and-retry on `23505`.
  - Cold starts.
  - PGlite behaves differently from Neon in places.
- **Single-instance in-memory run registry.** An active run is lost on restart. Supports one backend instance only.
- **Admin token exposure.**
  - The Bearer token in `sessionStorage` is exposed to XSS. Mitigated by sanitized Markdown.
  - No rate limiting, so the token must be long and random.
- **`telegram-chat-bot-mcp` maintenance.**
  - Single maintainer, low star count.
  - Pin the exact version, use a lockfile, review diffs before any upgrade. The notifier interface allows a swap.
  - The 0.1.16 logger writes to stdout, which is the MCP JSON-RPC channel, so `LOG_ENABLE_CONSOLE=false` is required for correctness. Server stderr is piped and passed through the `/bot\d+:[\w-]+/` redactor. Never set `DEBUG_MCP` (it prints the first 10 characters of the token). Do not upgrade to 0.1.17 (Windows-only dependency).
- **Bot cannot message the admin until the admin sends `/start` to the bot.**
- **Leaked bot token.** Revoke it in @BotFather.
- Agent SDK success results can carry `is_error: true` with API error text in `result`; B06 maps these so that text never reaches the writer or the DB.

## Out of scope

- Post editing.
- Multi-turn or revision chat.
- Saved run history.
- Multiple admins or roles.
- Scheduled publishing.
- SEO and SSR.
- Images.
- Categories and tags.
- Search.
- Re-running a single agent.
- Removing `/api/generate`.
- Orchestrator-driven subagent spawning.
