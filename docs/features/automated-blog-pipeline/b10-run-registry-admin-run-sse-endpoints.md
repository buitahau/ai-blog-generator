# B10 - Add run registry and admin run SSE endpoints

- **Side:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** [B04 - Add admin token auth middleware](b04-admin-token-auth-middleware.md), [B09 - Implement fixed-order research -> write -> save-draft pipeline](b09-fixed-order-research-write-save-pipeline.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/services/runRegistry.js`: per run id (`randomUUID`), keeps:
  - Status.
  - `AbortController`.
  - Event buffer of up to `RUN_EVENT_BUFFER_MAX` (5000) events with monotonic ids. When full, evict only `agent_text_delta` events, oldest first; structural events are never evicted. The registry keeps the accumulated text per agent. If a replay starts before an evicted delta (no `Last-Event-ID`, or the id is older than the oldest retained delta), first send `agent_text_snapshot {agent, text, upToId}` per agent with the full text up to the oldest retained delta, then the retained events after that point.
  - Subscribers.
  - Concurrency cap.
  - `RUN_TIMEOUT_MS` abort.
  - The registry emits `run_started` before calling `runPipeline`. Cancel calls `controller.abort(new RunCancelledError())`; the timeout calls `controller.abort(new RunTimeoutError())`. When the pipeline ends the registry checks `signal.reason`: cancel -> `run_cancelled {}`, timeout -> `error {code:'RUN_TIMEOUT', message}`.
  - Finished runs are evicted after 30 minutes.
- `src/routes/adminRuns.js`, behind `requireAdmin`.
- `sendEvent` gets an optional `id`.
- 15 s heartbeat.
- A subscriber disconnect only unsubscribes. It does not stop the run.
- Graceful shutdown: `server.js` handles SIGTERM/SIGINT by calling `registry.shutdown()`, which aborts every active run with reason `ServerShutdown` (final event `error {code:'SERVER_SHUTDOWN'}`), waits for the pipelines to settle (temp dirs removed, subprocesses exited, at most 10 s), then closes the server.
- Document the event table in the README.
- Doc updates (describe as steps; do not edit CLAUDE.md in this task):
  - In `backend/CLAUDE.md`, scope the rule "Client disconnect aborts the upstream stream" to `/api/generate`, and add: "Admin runs (`/api/admin/runs`) intentionally keep running after a subscriber disconnects; only cancel, timeout or shutdown abort them."
  - Update the Layout in `backend/CLAUDE.md` with `db/`, `services/agents/`, `services/notifier/`, `services/pipeline.js`, `services/runRegistry.js`, `routes/blogs.js`, `routes/adminBlogs.js`, `routes/adminRuns.js`, `middleware/requireAdmin.js`, `scripts/`.
  - Update the backend part of the root `CLAUDE.md` Layout.

## Acceptance criteria
- [x] Two subscribers get identical events.
- [x] `Last-Event-ID: 5` replays from 6 without duplicates.
- [x] The run continues after a client disconnect. Cancel stops the subprocess.
- [x] A second POST returns 409.
- [x] A timeout yields `error {code:'RUN_TIMEOUT'}`, never `run_cancelled`. A cancel yields `run_cancelled`, never an `error`.
- [x] 3000 deltas, then a reconnect without `Last-Event-ID`, rebuilds the full text through the snapshot plus retained deltas.
- [ ] SIGTERM during a run leaves no temp dir and no child process.

## Verification

- `curl` POST with the Bearer token returns `{runId}`.
- `curl -N -H "Authorization: Bearer $ADMIN_TOKEN" localhost:3001/api/admin/runs/<id>/events` shows events through `run_completed`.
- After Ctrl-C, `curl -N -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Last-Event-ID: 3' localhost:3001/api/admin/runs/<id>/events` replays from 4.
- `supertest` with a mocked pipeline covers replay, cancel, 404, 409, and timeout.
- `supertest` cases: timeout final event, cancel final event, eviction plus snapshot, `shutdown()`.

## API contract

- `POST /api/admin/runs` with body `{title}` (strict object, trimmed, 3-200 characters)
  - `202` `{runId}`
  - Errors: `409` `RUN_IN_PROGRESS`, `400` `VALIDATION_ERROR`, `401`.
- `GET /api/admin/runs/:runId/events` (SSE, optional `Last-Event-ID`)
  - Replays buffered events after that id, then streams live. Ends after a final event.
  - `404` `NOT_FOUND` JSON when the run is unknown.
- `POST /api/admin/runs/:runId/cancel`
  - `202`. Idempotent.
- `GET /api/admin/runs/active`
  - `200` `{runId}` or `{runId: null}`.

Events. All carry `id` and `runId`.

| Event | Payload |
|-------|---------|
| `run_started` | `{title}` |
| `agent_started` | `{agent: 'researcher' \| 'writer'}` |
| `agent_text_delta` | `{agent, text}` |
| `agent_text_snapshot` | `{agent, text, upToId}`. Replay only; replaces the agent's text. |
| `tool_call` | `{agent, toolUseId, name, input}` |
| `tool_result` | `{agent, toolUseId, name, ok, results?, summary?, errorCode?}` |
| `agent_heartbeat` | `{agent, toolName, elapsedSec}` |
| `agent_status` | `{agent, state: 'retrying' \| 'failed', category, attempt?}` |
| `agent_completed` | `{agent, numTurns, costUsd, usage: {inputTokens, outputTokens}}` |
| `blog_saved` | `{blogId, slug, title, status: 'draft'}` |
| `notification` | `{channel: 'telegram', status: 'sent' \| 'failed' \| 'skipped', errorCode?: 'TELEGRAM_UNAUTHORIZED' \| 'TELEGRAM_CHAT_NOT_FOUND' \| 'TELEGRAM_TIMEOUT' \| 'TELEGRAM_ERROR'}` |
| `run_completed` | `{blogId, totalCostUsd}`. Final. |
| `run_cancelled` | `{}`. Final. |
| `error` | `{agent?, code, message}`. Codes include `RUN_TIMEOUT` and `SERVER_SHUTDOWN`. Final. |
