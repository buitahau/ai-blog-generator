# Blog Generator backend

Node.js API that generates blog posts with Claude. It validates the request, builds the prompt server-side, calls the Anthropic SDK, and streams the Markdown result to the browser as Server-Sent Events. The API key never leaves this service.

## Prerequisites

- Node.js 22 or newer
- An Anthropic API key

## Setup

```
cd backend
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY, DATABASE_URL and ADMIN_TOKEN
npm run dev
```

The server listens on `http://localhost:3001` by default and exits with an error if `ANTHROPIC_API_KEY` or `DATABASE_URL` is missing, or `ADMIN_TOKEN` is shorter than 32 characters.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | none | Anthropic API key. Keep it in `backend/.env` only. |
| `PORT` | no | `3001` | HTTP port. |
| `DATABASE_URL` | yes | none | Neon Postgres connection string. Used by the server and `db:migrate` (`db:generate` does not connect). |
| `ADMIN_TOKEN` | yes | none | Bearer token for `/api/admin/*`, at least 32 characters. Generate one with `openssl rand -hex 32`. Never log or commit it. |
| `ANTHROPIC_MODEL` | no | default in `src/config.js` | Overrides the model ID. Leave empty to use the default. |
| `TELEGRAM_BOT_TOKEN` | no | none | Bot token from @BotFather. With `TELEGRAM_CHAT_ID`, enables the draft-ready notification; if either is missing the notification is `skipped`. |
| `TELEGRAM_CHAT_ID` | no | none | Chat id of the admin (or group) that started the bot. |
| `TELEGRAM_NOTIFY_TIMEOUT_MS` | no | `15000` | Per-attempt timeout for sending the notification. The Telegram server's own HTTP timeout is set to this minus 3 s (at least 1 s), so it always answers first and a delivered message is never retried. |
| `ADMIN_BASE_URL` | no | none | Base URL of the admin UI, used for the link in the message (`<ADMIN_BASE_URL>/admin/blogs?highlight=<id>`). |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with file watching. |
| `npm start` | Start without watching. |
| `npm test` | Run the test suite (SDK is mocked, no key needed). |
| `npm run lint` | Run ESLint. |
| `npm run db:generate` | Generate a SQL migration in `drizzle/` from `src/db/schema.js`. Commit the output. |
| `npm run db:migrate` | Apply `drizzle/` migrations to the database at `DATABASE_URL` (a Neon branch). |

## API

All errors outside the SSE stream use this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path": "topic", "message": "..." }] } }
```

`details` is present only for validation errors.

### `GET /api/health`

Returns `200` with `{ "status": "ok" }`.

### `POST /api/generate`

Request: `Content-Type: application/json`, body up to 10 KB.

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `topic` | string | yes | trimmed, 3 to 200 characters |
| `tone` | string | no | `professional` (default), `casual`, `friendly`, `persuasive`, `technical` |
| `length` | string | no | `short` (about 400 words), `medium` (default, about 800), `long` (about 1500) |
| `audience` | string | no | trimmed, up to 100 characters; blank is treated as not provided |
| `keywords` | string[] | no | up to 10 items, each trimmed, 1 to 40 characters |

Unknown fields (including `model` and `max_tokens`) are rejected. The token limit is fixed by `length` on the server (1024, 2048, or 4096) and never exceeds 4096.

Pre-stream errors (JSON, not SSE):

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid or unknown fields (see `details`) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 4xx | `BAD_REQUEST` | Other malformed request (body-parser failures not listed here) |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type is not JSON, or unsupported charset/encoding |
| 404 | `NOT_FOUND` | Unknown route |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

On success the response is `200` with `Content-Type: text/event-stream`. Events:

| Event | Data | Notes |
| --- | --- | --- |
| `start` | `{}` | Stream opened. |
| `delta` | `{ "text": "..." }` | Next chunk of Markdown. |
| `done` | `{ "stopReason": "end_turn" \| "max_tokens", "usage": { "inputTokens": n, "outputTokens": n } }` | Final event on success. `max_tokens` means the post was cut off. |
| `error` | `{ "code": "...", "message": "..." }` | Final event on failure after the stream started. |

In-stream error codes: `RATE_LIMITED`, `OVERLOADED`, `UPSTREAM_ERROR` (also used when the model declines the request), `INTERNAL_ERROR`. Messages are safe, generic text; upstream details are only logged on the server.

A `: ping` comment is sent every 15 seconds as a heartbeat. Closing the connection cancels the upstream request. If the upstream doesn't start responding within 60 seconds (`REQUEST_TIMEOUT_MS`, per attempt; the SDK retries up to twice), the stream ends with an `UPSTREAM_ERROR` event. Generation itself has no overall time limit.

### `GET /api/blogs`

Public list of published blogs, newest first. Drafts are never returned. Requires `DATABASE_URL`.

| Query | Type | Rules |
| --- | --- | --- |
| `page` | integer | 1 or more, default 1 |
| `pageSize` | integer | 1 to 50, default 10 |

Unknown query params are rejected. `200`:

```json
{ "items": [{ "id": 1, "slug": "my-post", "title": "...", "excerpt": "...", "publishedAt": "2026-01-01T00:00:00.000Z" }], "total": 1, "page": 1, "pageSize": 10 }
```

Invalid query: `400 VALIDATION_ERROR` with `details`.

### `GET /api/blogs/:slug`

`200` `{ "id", "slug", "title", "contentMd", "sources": [{ "title", "url" }], "publishedAt" }`. A draft or unknown slug returns `404 NOT_FOUND`. Database failures return `500 INTERNAL_ERROR` with no internal details.

### `GET /api/admin/session`

Requires `Authorization: Bearer <ADMIN_TOKEN>`. Valid token: `204` with no body. Missing header, wrong scheme, wrong token, or an unset `ADMIN_TOKEN`: `401` `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`.

### Admin blogs: `/api/admin/blogs`

All routes require `Authorization: Bearer <ADMIN_TOKEN>` (`401 UNAUTHORIZED` otherwise). `:id` must be a positive integer; anything else (`abc`, `0`, `-1`, `1.5`) returns `400 VALIDATION_ERROR`. An unknown id returns `404 NOT_FOUND`.

| Route | Result |
| --- | --- |
| `GET /api/admin/blogs?status=draft\|published&page&pageSize` | `200` `{ "items": [{ "id", "slug", "title", "excerpt", "status", "createdAt", "publishedAt" }], "total", "page", "pageSize" }`, newest first. `page` and `pageSize` follow the public list rules (`pageSize` max 50); `status` is optional; unknown params are rejected. |
| `GET /api/admin/blogs/:id` | `200` full record: the list fields plus `contentMd`, `sources`, `topic`, `runId`, `updatedAt`. |
| `POST /api/admin/blogs/:id/publish` | `200` updated record. Idempotent; the first `publishedAt` is kept. The post then appears in `GET /api/blogs`. |
| `POST /api/admin/blogs/:id/unpublish` | `200` updated record. Idempotent. The post disappears from `GET /api/blogs`. |
| `DELETE /api/admin/blogs/:id` | `204`. |

### Admin runs: `/api/admin/runs`

All routes require `Authorization: Bearer <ADMIN_TOKEN>`. A run is driven by an orchestrator agent: it decides which sub-agents to spawn (up to 2 researcher passes and 1 writer pass), the server saves the writer's output as a draft and notifies. It runs on the server independent of any connection: a subscriber disconnecting does not stop it. Only cancel, the 15 minute timeout (`RUN_TIMEOUT_MS`) or server shutdown abort it. Only one run is active at a time (`MAX_CONCURRENT_RUNS`). Finished runs stay replayable for 30 minutes.

Flow: the orchestrator starts (`agent_started`), then calls the server-side tools `spawn_researcher` and `spawn_writer`. Each call emits an `orchestrator_action`, runs a sub-agent (`agent_started` ... `agent_completed` or `agent_failed`) and returns only a short digest to the orchestrator, never the notes or the draft. When the orchestrator ends, the draft is saved (`blog_saved`), the admin is notified and the run completes. Limits per run: 2 researcher spawns (`MAX_RESEARCH_SPAWNS`), 1 writer spawn (`MAX_WRITER_SPAWNS`), one spawn at a time, a whole-run budget (`RUN_MAX_BUDGET_USD`), and a per-spawn timeout (300 s researcher, 180 s writer).

| Route | Result |
| --- | --- |
| `POST /api/admin/runs` body `{ "title" }` (strict object, trimmed, 3-200 characters) | `202` `{ "runId" }`. `409 RUN_IN_PROGRESS` while a run is active, `400 VALIDATION_ERROR`, `503 SERVER_SHUTDOWN` while shutting down. |
| `GET /api/admin/runs/active` | `200` `{ "runId" }`, or `{ "runId": null }` when idle. |
| `POST /api/admin/runs/:runId/cancel` | `202`, idempotent. `404 NOT_FOUND` for an unknown run. |
| `GET /api/admin/runs/:runId/events` | SSE. Replays buffered events after the optional `Last-Event-ID` header, then streams live, and ends after a final event. `404 NOT_FOUND` JSON for an unknown run. |

Every event has an SSE `id` (monotonic per run) and its data carries `id` and `runId` plus the payload below. A `: ping` comment is sent every 15 seconds.

`agent` is `"orchestrator" | "researcher" | "writer"`. `spawn` is the 1-based instance number of that agent within the run (the orchestrator is always `1`; researcher passes are `1` and `2`; the writer is `1`). Every agent event (`agent_*`, `tool_call`, `tool_result`) carries `spawn`.

| Event | Payload |
| --- | --- |
| `run_started` | `{ title }` |
| `agent_started` | `{ agent, spawn }`. The orchestrator's comes first. During replay a client must not reset the instance's text on this event (it may arrive before a snapshot, or after one for a later instance); initialise the text only if absent. |
| `orchestrator_action` | `{ action: "spawn_researcher" \| "spawn_writer", accepted, spawn?, focus?, reason? }`. Sent when the orchestrator calls a spawn tool, before the sub-agent's `agent_started`. If `accepted` is true, `spawn` is the instance number about to start and `focus` (researcher only) is the optional one-line focus. If false, `reason` is one of `INVALID_INPUT`, `SPAWN_IN_PROGRESS`, `LIMIT_REACHED`, `BUDGET_EXHAUSTED`, and no sub-agent starts. |
| `agent_text_delta` | `{ agent, spawn, text }` |
| `agent_text_snapshot` | `{ agent, spawn, text, upToId }`. Replay only (no SSE `id`); replaces the text of that `agent:spawn` instance. Sent after the retained events up to `upToId` and before the later ones. |
| `tool_call` | `{ agent, spawn, toolUseId, name, input }` |
| `tool_result` | `{ agent, spawn, toolUseId, name, ok, results?, summary?, errorCode? }` |
| `agent_heartbeat` | `{ agent, spawn, toolName, elapsedSec }` |
| `agent_status` | `{ agent, spawn, state: "retrying" \| "failed", category, attempt? }` |
| `agent_completed` | `{ agent, spawn, numTurns, costUsd, usage: { inputTokens, outputTokens } }`. For a sub-agent it means the query finished, not that it produced usable output: an empty result is followed by `agent_failed`. Cancel, `RUN_TIMEOUT`, `SERVER_SHUTDOWN` and unexpected sub-agent errors (which fail the run with `INTERNAL_ERROR` and close only the orchestrator) send neither `agent_completed` nor `agent_failed` for open instances. General rule: any final event (`run_completed`, `run_cancelled` or `error`) implicitly closes every instance still open. |
| `agent_failed` | `{ agent, spawn, code, message }`. A sub-agent instance failed (`code` is one of `RATE_LIMITED`, `OVERLOADED`, `UPSTREAM_ERROR`, `AGENT_MAX_TURNS`, `AGENT_BUDGET_EXCEEDED`, `RESEARCH_EMPTY`, `WRITER_EMPTY`, `AGENT_TIMEOUT`). The run may continue (the orchestrator can retry within the limits). It is also sent with `agent: "orchestrator"`, `spawn: 1` when the orchestrator itself fails, which closes the orchestrator instance (it then gets no `agent_completed`); `INTERNAL_ERROR` is used for unexpected failures. |
| `blog_saved` | `{ blogId, slug, title, status: "draft" }` |
| `notification` | `{ channel: "telegram", status: "sent" \| "failed" \| "skipped", errorCode? }` |
| `run_completed` | `{ blogId, totalCostUsd }`. Final. |
| `run_cancelled` | `{}`. Final. |
| `error` | `{ agent?, spawn?, code, message }`. Final. Codes include the `agent_failed` codes, `NO_DRAFT`, `RUN_TIMEOUT`, `SERVER_SHUTDOWN` and `INTERNAL_ERROR`. When the run fails because a sub-agent failed, `agent` and `spawn` name that instance (the most recent sub-agent failure, even if a later pass succeeded); when the orchestrator failed with one of its own `AgentError` codes (except init violations, which are reported as `INTERNAL_ERROR`), or ended without a draft (`NO_DRAFT`), `agent` is `orchestrator` and `spawn` is absent. `INTERNAL_ERROR` final errors carry no `agent` (the orchestrator instance is normally closed by a preceding `agent_failed` with `INTERNAL_ERROR`). |

New error codes: `NO_DRAFT` (the orchestrator ended without the writer producing a draft, the orchestrator did not fail and no sub-agent failed at any point in the run; final `error` with `agent: "orchestrator"`, preceded by the orchestrator's `agent_completed`) and `AGENT_TIMEOUT` (a spawn exceeded its per-spawn timeout; sent as `agent_failed`, and as the final `error` if no draft results). When no draft exists, the final error is: the orchestrator's failure if it failed; otherwise the most recent sub-agent failure in the run, even if a later pass succeeded; otherwise `NO_DRAFT`. The whole run is limited to 15 minutes (`RUN_TIMEOUT_MS`); on expiry the final event is `error` with `RUN_TIMEOUT`.

Event order for an empty sub-agent result (for example a writer that returns only whitespace): `agent_completed`, then `agent_failed` with `RESEARCH_EMPTY` or `WRITER_EMPTY`, because the query itself finished. If no draft is produced in the end, the final `error` follows after the orchestrator's own `agent_completed` (or `agent_failed` if the orchestrator itself failed).

The per-run buffer holds up to 5000 events (`RUN_EVENT_BUFFER_MAX`). When full, only `agent_text_delta` events are evicted, oldest first; all other events are kept. A replay that starts before an evicted delta (no `Last-Event-ID`, or an older id) first sends one `agent_text_snapshot` per agent instance, keyed by `agent` and `spawn` (so two researcher passes never merge into one text), holding the text up to the oldest retained delta, then the retained events. Clients must likewise key text by `agent:spawn`.

On SIGTERM or SIGINT the server aborts active runs (final event `error` with `SERVER_SHUTDOWN`), waits up to 10 seconds for their agents and temp dirs to clean up, then closes.

```
# Start a run and note the returned runId
curl -X POST http://localhost:3001/api/admin/runs \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Why small teams ship faster"}'
# {"runId":"..."}

# Stream events (-N disables buffering); the stream ends after the final event
curl -N -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/api/admin/runs/<runId>/events

# Resume after event 3
curl -N -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Last-Event-ID: 3' http://localhost:3001/api/admin/runs/<runId>/events

# Cancel
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/api/admin/runs/<runId>/cancel
```

Typical stream (payloads abbreviated): `run_started`, `agent_started orchestrator`, the orchestrator's own `agent_text_delta` events (keyed `orchestrator:1`) throughout, `orchestrator_action spawn_researcher`, `agent_started researcher 1`, `tool_call`/`tool_result`/`agent_text_delta`..., `agent_completed researcher 1`, `orchestrator_action spawn_writer`, `agent_started writer 1`, `agent_text_delta`..., `agent_completed writer 1`, `agent_completed orchestrator`, `blog_saved`, `notification`, `run_completed`.

### Example

```
curl -N -X POST http://localhost:3001/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Why small teams ship faster","tone":"casual","length":"short","keywords":["focus","feedback"]}'
```

`-N` disables curl's output buffering so events appear as they arrive.

## Telegram notification

After a run saves a draft, the backend sends one plain-text Telegram message through the `telegram-chat-bot-mcp` MCP server (started over stdio; only the `send_telegram_text` tool is ever called).

Setup:

1. Create a bot with @BotFather and copy the token into `TELEGRAM_BOT_TOKEN`.
2. The admin sends `/start` to the bot. Bots can only message users or groups that started them.
3. Get the chat id: `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"` and read `message.chat.id`. Set it as `TELEGRAM_CHAT_ID`.
4. Set `ADMIN_BASE_URL` so the message links to the draft.

Notes:

- Failures are reported in the `notification` event as `TELEGRAM_UNAUTHORIZED` (bad token), `TELEGRAM_CHAT_NOT_FOUND` (wrong chat, or `/start` never sent), `TELEGRAM_TIMEOUT` or `TELEGRAM_ERROR`. Notification failures never fail a run.
- A send is retried once only when no result came back, to avoid duplicate messages.
- The package is pinned (`telegram-chat-bot-mcp@0.1.16`). Check its changelog before upgrading. Do not upgrade to 0.1.17: it has a Windows-only dependency that breaks `npm ci` on Linux and macOS.
- Never set `DEBUG_MCP`. The server runs with `LOG_ENABLE_CONSOLE=false` because its logger would otherwise write to stdout, the MCP channel. The pinned 0.1.16 server keeps no log files; its stderr is redacted (`bot<redacted>`) into the backend log.

## Troubleshooting

- **"Config error: missing ANTHROPIC_API_KEY"**: copy `.env.example` to `.env` and set the key, then restart.
- **"Config error: missing DATABASE_URL"**: set the Neon connection string as `DATABASE_URL` in `.env`, then restart.
- **"Config error: ADMIN_TOKEN must be at least 32 characters"**: set a longer random `ADMIN_TOKEN` in `.env` (`openssl rand -hex 32`), then restart.
- **"Port 3001 is already in use"**: set `PORT` to a free port in `.env`.
- **Stream arrives all at once**: a reverse proxy is buffering. The service sends `X-Accel-Buffering: no` for nginx; for other proxies disable response buffering for `/api/generate`. With curl, use `-N`.
- **`error` event with `RATE_LIMITED` or `OVERLOADED`**: temporary upstream condition; retry shortly.
