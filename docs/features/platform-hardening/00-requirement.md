# Platform hardening

Supersedes `b00-requirement.md` (per-agent models, agent specs and LOG_LEVEL logging) and `r00-requirement.md` (review hardening, items 1-7, and CD). Both are superseded by this file. Their content is carried here, restructured.

## Summary

This requirement has two strands, delivered as one task set in this folder.

- **Strand B: per-agent models, agent specs and logging (B01-B13).**
  1. **Per-agent models.** `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL` and `WRITER_MODEL` each choose a model for one agent. Each falls back to `MODEL` (`ANTHROPIC_MODEL` or `DEFAULT_MODEL`). Model IDs stay only in `backend/src/config.js`.
  2. **One spec per agent.** Each agent gets one spec in `backend/src/services/agents/definitions.js` (`AGENT_SPECS`): prompt, model, built-in tools, turn cap and spawn-tool config. `AGENTS`, `PIPELINE_TOOL_NAMES` and the `pipeline` MCP server are built from it. Today the tool names are duplicated at `definitions.js` and `tools.js`, and the spawn config sits in `tools.js`.
  3. **Logging through one logger.** Every `console.*` in `backend/src` except the three fatal calls in `server.js` goes through a logger controlled by `LOG_LEVEL` (`silent|error|warn|info|debug`, default `info`, invalid values fall back to `info`).
- **Strand R: review hardening (r01-r33).** Seven review items from [improvement-proposals.md](../improvement-proposals.md), plus continuous deployment (CD) to Fly.io and a Cloudflare Worker.
  - Items 1-7: close the unmetered `POST /api/generate` endpoint, stop finished drafts from being lost when the save fails, add CI, cut researcher memory, keep stuck runs inside the concurrency cap, optionally replace the Telegram MCP package with a direct Bot API call, and fix drift in the docs.
  - CD: a merge to `master` deploys the backend to Fly.io and the frontend to a Cloudflare Worker that serves the static assets and proxies `/api/*` to Fly.

## Goals

- Close the unmetered Claude endpoint.
- Stop losing a finished draft when the save fails.
- Run lint and tests in CI on every push and pull request.
- Stop the researcher from keeping every SDK message in memory.
- Keep a stuck run inside the concurrency cap.
- Optional (D6): remove the Telegram MCP package.
- Make the docs match the code.
- Deploy on merge to `master`: backend on Fly.io, frontend on a Cloudflare Worker that proxies `/api/*`.
- Let each agent run on its own model, with `MODEL` as the fallback.
- Keep each agent's prompt, model, tools and turn cap in one spec.
- Route all backend logging through one logger with a `LOG_LEVEL` switch.

## Scope

- Backend: all of strand B and the backend tasks of strand R.
- Front-end: only the r-tasks (r06, r07, r13, r14, r15, r17, r22, r26, r30). Strand B has no front-end work.

## Decisions

- **D1. Remove `POST /api/generate`. PENDING USER APPROVAL.**
  - Recommended: delete the route, its prompt and schema, and the single-shot front-end (r01-r03, r07).
  - Alternative (not recommended): mount `generateRouter` behind `requireAdmin` inside `createAdminRouter`. This would replace r01-r03 and r07 with one new task. Removal is still recommended.
  - If D1 is rejected: `MAX_TOKENS_CEILING`, `REQUEST_TIMEOUT_MS` and `services/claude.js` stay; B08 and B09 keep their lines as written; B13 documents the gated route; r30 drops its r07 dependency; r27 and r26 are rescoped; r05's API limiter also covers `/api/generate`.
- **D2. Rate limits.** Use `express-rate-limit` v8 with fixed config constants.
  - All `/api` routes except `/api/health`: 600 requests per 15 minutes per IP.
  - `/api/admin/session`: 20 per 15 minutes.
  - `POST /api/admin/runs`: 10 per 15 minutes.
  - Over the limit returns 429 `{ error: { code: "RATE_LIMITED", message } }`.
- **D3. Trust proxy from env.** `TRUST_PROXY` unset or blank means `false`. A non-negative integer sets the number of hops. Anything else fails `assertConfig` (see D15).
- **D4. Save failure.** A new final error code `DRAFT_SAVE_FAILED`, not retryable.
  - The run registry keeps the unsaved draft for the 30-minute retention.
  - `GET /api/admin/runs/:runId/draft` returns it.
  - Rejected: putting the draft in the error payload, because it breaks the ~4 KB event budget.
- **D5. Settling runs.** An aborted run whose pipeline is still unfinished counts against the concurrency cap for up to `ABORT_SETTLE_MAX_MS=60_000`, after the 5 s grace period.
  - `start()` returns 409 `RUN_SETTLING` inside that window.
  - After the window, the registry logs one error through `logger.error` and stops counting the run.
- **D6. Telegram via Bot API fetch. PENDING USER APPROVAL.** Replace `telegram-chat-bot-mcp` with one `fetch` call to the Bot API `sendMessage`. This reverses decision 2 of the [automated-blog-pipeline](../automated-blog-pipeline/00-requirement.md) requirement.
  - If the user keeps MCP: B08 and B10 stay as written, r23-r25 are skipped, and the r29 Telegram bullet stays.
- **D7. Deploy docs.** One reverse proxy in front of both the API and the built front-end, with an nginx example. No code change. The recommended production path is superseded by D9 (Worker + Fly); nginx stays as the generic alternative.
- **D8. CI audit.** `npm audit --omit=dev --audit-level=high` runs with `continue-on-error: true` until the advisories are triaged.
- **D9. Deploy: backend on Fly.io, frontend on a Cloudflare Worker, deploy on push to `master` after CI passes.**
  - Backend on Fly.io, as one machine. Not on Workers: the Claude Agent SDK spawns a subprocess (`backend/src/services/agents/runAgentQuery.js`), a run lasts minutes and streams SSE, and `runRegistry` is in memory.
  - Frontend on a Cloudflare Worker with static assets and a thin `/api/*` proxy to Fly.
  - Deploy jobs run in `.github/workflows/ci.yml` after the `backend` and `frontend` CI jobs, only on push to `master`. Backend first, then frontend. PRs and other branches never deploy.
- **D10. Per-agent model with fallback.** Each agent model reads its own env variable and falls back to `MODEL`.
  - Model IDs stay in one config constant (`backend/src/config.js`, per the backend CLAUDE.md).
  - `MODEL` is only the per-agent fallback. The `/api/generate` route is not a consumer of this rule (see D1).
  - Replaces decision (g) of the [orchestrator pipeline](../orchestrator-pipeline/00-requirement.md): "Same `MODEL` constant. No second model ID."
- **D11. Budgets stay hard-coded.** Decision (c) of the orchestrator pipeline holds: spawn counts and budget caps stay in `config.js` and `orchestrator/state.js`, not in env and not in the spec.
- **D12. One spec per agent.** `AGENT_SPECS` in `definitions.js` is the single source for each agent's prompt, model, built-in tools, turn cap and spawn tool. The spawn argument schemas move to `backend/src/validation/`.
- **D13. One logger.** `backend/src/lib/logger.js` wraps `console`. The level comes from `LOG_LEVEL`.
  - The logger adds no prefix and passes arguments through unchanged.
  - It looks up `console[method]` at call time, so `vi.spyOn` tests keep working.
  - `silent` turns logging off. There is no `LOG_ENABLED` variable.
- **D14. Fatal startup output is not logged.** The three plain `console.error` calls before `process.exit` in `server.js` print regardless of `LOG_LEVEL`.
- **D15. Invalid env policy.** Invalid `TRUST_PROXY` fails startup (`assertConfig`). Invalid `LOG_LEVEL` silently falls back to `info`. This is intentional. The `assertConfig` error prints through the fatal `console.error` in `server.js`, whatever `LOG_LEVEL` is.
- **D16. New code uses the logger.** New backend code uses `logger.*`, never `console.*`. Lint blocks raw `console` in `backend/src` (B12), and CI enforces it (r16).

## Review findings corrected

Each claim in the proposals was checked against the code. The file:line references are correct except for the corrections below. The tasks follow the corrected version.

1. **Trust proxy.** An unconditional `trust proxy = 1` is unsafe. When the app is not behind a proxy, a client can spoof `X-Forwarded-For`. Use the `TRUST_PROXY` env instead (D3).
   - `express-rate-limit` and `cors` appear in the lockfile only as dependencies of `@modelcontextprotocol/sdk`. `express-rate-limit` becomes a direct dependency in r05.
   - `backend/test/app.test.js:14,24,33,48` use `/api/generate` as the target. r01 moves them to `/api/admin/runs`.
2. **Slug and save failure.** The slug comes from the parsed H1 (`parseTitle`, `pipeline.js:270`), not the typed title. The failure case is a sixth draft with the same base slug.
   - The writer text stays in the run event buffer for 30 minutes, but it is not exactly recoverable.
   - `INTERNAL_ERROR` is retryable (`frontend/src/constants/errors.js:6`), so Retry reruns the paid pipeline. That is why `DRAFT_SAVE_FAILED` is not retryable (r13).
3. **CI.** No corrections.
4. **Researcher memory.** The proposed fix "push only `type === 'user'`" still keeps the WebFetch and WebSearch results, which are the large part. The real fix collects sources as messages arrive and keeps none (r18).
5. **Shutdown and eviction.** `shutdown()` (`runRegistry.js:193-197`) waits only for running runs. Retention eviction (`runRegistry.js:100`) can drop a run whose pipeline is still running. r19 tracks settling runs separately.
6. **Telegram dependencies.** "Two dependencies" is wrong. `@modelcontextprotocol/sdk` is a peer dependency of `@anthropic-ai/claude-agent-sdk` (`backend/package-lock.json:54`) and stays. Only `telegram-chat-bot-mcp` can go.
   - MCP was a deliberate choice. `docs/features/automated-blog-pipeline/00-requirement.md:24-25`, decision 2, lists fetch as "emergency contingency (needs user approval)".
7. **Docs drift.** `frontend/README.md:31` already mentions serving the build behind a proxy. More drift:
   - `frontend/CLAUDE.md:15,23,27-30,65,69-76`
   - `frontend/README.md:3,29,51-52,60,80`
   - the root `CLAUDE.md` layout
   - the comment at `frontend/src/constants/errors.js:3`

## Functional requirements

Strand B:

- `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL` and `WRITER_MODEL` are optional. When unset or blank, each agent uses `MODEL`.
- `AGENT_MODELS` exposes the three resolved models as a frozen object with exactly the keys `orchestrator`, `researcher` and `writer`.
- `AGENTS.<name>.model` is the agent's model. `runAgentQuery` passes it to `query()`. An agent without a model falls back to `MODEL`.
- `AGENT_SPECS` holds one frozen spec per agent. `AGENTS`, `PIPELINE_TOOL_NAMES` and the `pipeline` MCP server are built from it.
- `LOG_LEVEL` accepts `silent`, `error`, `warn`, `info` or `debug`. Blank or invalid values give `info`.
- Each log call at or below the configured level prints through `console`. Calls above the level print nothing.
- At `debug`, each agent query logs one `Agent init:` line with the agent name, model and tools.
- At startup, `server.js` logs the resolved models at `info`.

Strand R:

- `POST /api/generate` returns 404 `NOT_FOUND`. Its prompt, schema and front-end use are removed. (D1)
- Every `/api` route except `/api/health` is rate limited per IP. (D2)
- `req.ip` honours `X-Forwarded-For` only when `TRUST_PROXY` is set. (D3)
- A draft that fails to save emits `DRAFT_SAVE_FAILED`. An admin can download the exact Markdown for 30 minutes. (D4)
- A sixth draft with the same base slug saves as `<base>-<runId first 8>`.
- One transient insert failure is retried once, without creating a duplicate row.
- The researcher keeps no SDK message array. Sources are collected as messages arrive.
- An aborted run whose pipeline is still unfinished blocks new starts with `RUN_SETTLING` for up to 60 s. (D5)
- Shutdown waits for settling runs too, bounded by `shutdownWaitMs`.
- The front-end offers Retry for `RUN_SETTLING`, and a "Download draft" action for `DRAFT_SAVE_FAILED`.
- A request over the rate limit gets 429 `RATE_LIMITED`. The front-end shows the server message for a 429 from start. (D2, Q4)
- CI runs lint and tests for both packages, and the front-end build, on push and pull request.
- Telegram sends with one `fetch` call to the Bot API. The sent, failed and skipped results and the error codes are unchanged. (D6)
- The docs match the code.
- A merge to `master` runs CI, then deploys the backend to Fly.io, then deploys the frontend Worker. PRs and other branches never deploy. (D9, r31)
- The Worker serves the built SPA with deep-link fallback, and proxies `/api/*` to the Fly origin without buffering SSE. (r30)
- The backend runs as one Fly machine. `release_command` runs the migrations before each deploy. (r29)
- Rollback and the manual deploy path are documented. (r32)
- A new maintainer can deploy from zero by following [setup-cd.md](setup-cd.md). (r33)

## Non-functional requirements

- The SSE contract is unchanged, except for the new error codes `DRAFT_SAVE_FAILED`, `RUN_SETTLING` and `RATE_LIMITED` (HTTP 429). The error codes and the `init.tools` checks are otherwise unchanged.
- Rate-limit numbers and windows live in one place, `backend/src/config.js`.
- `/api/health` is never rate limited.
- Draft content is never logged. Save-failure logs carry only the error code or name.
- The Telegram token and request URL are never logged. Logs go through `redact`.
- Secrets are never logged. The `query()` options are never logged, because `env` holds `ANTHROPIC_API_KEY`.
- Importing `config.js` needs no API key.
- Tests do not depend on a developer's `.env`.
- Calls below the log threshold have no formatting cost.
- Lint blocks new raw `console` use in `backend/src`. CI runs that lint.
- CI uses no secrets. Tests mock the SDK and use PGlite.
- The audit step does not block CI until the advisories are triaged. (D8)
- No secret is in the repo, in `fly.toml` or in `wrangler.jsonc`. Deploy credentials live in the GitHub `production` environment; app secrets live in `fly secrets`. (D9)
- Deploy jobs run only on `master` and use the `production` environment. Actions are pinned to full tags. (D9, r31)

## Feature acceptance criteria

- [ ] `POST /api/generate` returns 404 `NOT_FOUND`, and the front-end has no reference to it. (D1)
- [ ] Requests over the limit return 429 `RATE_LIMITED`. `/api/health` is never limited.
- [ ] A DB insert failure after the writer gives the final error `DRAFT_SAVE_FAILED`, and the admin can download the exact Markdown for 30 minutes.
- [ ] A sixth draft with the same base slug saves as `<base>-<runId first 8>`.
- [ ] CI runs lint and tests for both packages, and the front-end build, on push and pull request.
- [ ] `npm run lint` fails on a raw `console` call in `backend/src`, locally and in CI.
- [ ] The researcher keeps no SDK message array.
- [ ] `POST /api/admin/runs` returns 409 `RUN_SETTLING` while an aborted run is settling inside the window.
- [ ] (D6) Telegram sends with one `fetch` call. `telegram-chat-bot-mcp` is gone. The sent, failed and skipped contract and the error codes are unchanged.
- [ ] `LOG_LEVEL` levels behave as in the functional requirements: `silent` prints nothing, `error`, `warn`, `info` and `debug` print at or below their level, and blank or invalid values give `info`.
- [ ] `AGENT_MODELS` and `AGENT_SPECS` are frozen and have the shapes in the functional requirements.
- [ ] The docs match the code.
- [ ] (D9, CD) A merge to `master` runs CI, then deploys the backend to Fly.io and then the frontend Worker. A PR does not deploy.
- [ ] (CD) A failing test or lint blocks both deploys.
- [ ] (CD, r30) `wrangler dev` serves the built SPA with `/admin/generate` deep-link fallback, and proxies `/api/health` to a local backend.
- [ ] (CD, r30) An SSE run streams incrementally through the Worker, and a run longer than a few minutes is not cut.
- [ ] (CD, r29) The backend image builds, and `/api/health` returns 200 with dummy env. `fly config validate` passes.
- [ ] (CD, r32, r33) Rollback and manual deploy are documented, and `setup-cd.md` lets a new maintainer deploy from zero.

## Assumptions & open questions

- **Q1. D1 approval. PENDING USER APPROVAL.** Approve removing `POST /api/generate` (D1)?
- **Q2. D6 approval. PENDING USER APPROVAL.** Approve replacing the Telegram MCP package with a Bot API fetch (D6)? If not, skip r23-r25. This reverses an approved design.
- **Q3. CLI model precedence. Settled by B11.** When both the top-level `model` and the agent definition `model` are set, it is not known which one the CLI uses. This change sets both and logs `init.model` at `debug`. B11 settles the question with a live check.
- **Q4. `RATE_LIMITED` shared name.** `RATE_LIMITED` is already used for upstream Anthropic rate limits, and the front-end treats it as retryable. The HTTP 429 from the new limiter uses the same code. Recommendation: keep the code and document both meanings (r26, r27). r22 also checks that a 429 from start shows the server message.
- **Q5. Cloudflare Worker, not Pages.** Confirm that a Worker with static assets (not Cloudflare Pages) is the right host for the SPA. r30 decides.
- **Q6. SSE through the Worker.** Confirm that SSE through the Worker survives multi-minute runs. r30 measures it. If it does not, the fallback is out of scope here (see Risks).
- **Q7. `TRUST_PROXY` hop count.** Expected to be 2 (Worker, then Fly). Measured in r33.
- **Q8. Fly region and memory.** Region: TBD. Memory: one `shared-cpu-1x` machine with 512 MB is assumed (r29), and memory is to be measured during a run.
- **One draft per run.** r09 assumes one draft per run. `run_id` has no index, which is fine at this size.
- **Settle window.** The 60 s window is a fixed config constant (`ABORT_SETTLE_MAX_MS`).
- **Single Fly machine.** `min_machines_running = 1`, and `fly scale count 1`.
- **Single origin for browsers.** The browser calls relative `/api/*` on the Worker domain. `API_ORIGIN` is the Fly `fly.dev` origin, passed by CI as `--var`.
- **Forward-only migrations.** Every migration is additive, so a rolled-back backend still works with the newer schema (r32).
- **No format check on model IDs.** A bad model ID fails at run time as `UPSTREAM_ERROR`.
- **Spec location.** The spec stays in `services/agents/definitions.js`. The spawn argument schemas move to `backend/src/validation/`.
- **Spawn counts and budgets.** They stay in `config.js` and `orchestrator/state.js`.
- **Logger behaviour.** No prefix, no formatting, and `console[method]` is looked up at call time. This keeps the exact-argument assertions in `runAgentQuery.test.js` passing.
- **`normalize.js` debug call.** The `console.debug` in `normalize.js` becomes hidden at the default `info` level. This is accepted.
- **Scripts.** `scripts/*.js` are out of scope.

## Risks & out of scope

Risks:

- **CLI model precedence is unverified.** B02 sets both the top-level and the definition model. B11 runs a live check.
- **The gateway may not serve every model ID.** A missing model shows as `UPSTREAM_ERROR` in that agent's panel.
- **Cheaper models may be weaker.** They may lower quality or follow "end turn means done" less reliably. The USD caps still hold.
- **SDK schema mismatch.** If `AGENTS` carries extra keys, the SDK may reject them. B04 tests for exactly four keys.
- **Vacuous Telegram redaction test.** After the level changes, the redaction test can pass with nothing logged. Under D6 the redaction test moves to r23, which asserts that something was logged.
- **Leaked options object.** The `query()` options contain `env`, which holds `ANTHROPIC_API_KEY`. B11 has a test for this, and B13 documents the rule.
- **`LOG_LEVEL=silent` in production.** It hides security signals such as "Unexpected agent tools". This is a documented operator choice. The run still fails closed.
- **Stuck SDK subprocess.** After 60 s, a truly stuck SDK subprocess can overlap a new run. This is bounded and logged.
- **Idempotency** of r09 assumes one draft per run.
- **Limits may be too low** behind a CDN. The constants are kept in one place so they can be changed.
- **D6 replaces an approved design** (automated-blog-pipeline decision 2).
- **Single Fly machine means downtime during deploy (accepted).** `strategy = "immediate"` stops the only machine. SIGTERM waits up to 10 s for an active run, then the run is aborted with `SERVER_SHUTDOWN`. A deploy can therefore kill an in-flight run and lose its unsaved draft. Check `GET /api/admin/runs/active` before a manual deploy (r32).
- **`TRUST_PROXY` hop count with two proxies.** The Worker and Fly are two hops in front of Node. A wrong value rate-limits by a proxy address (too few hops) or lets a client choose its key (too many). Confirmed by measurement in r33.
- **The `fly.dev` URL bypasses the Worker.** It stays reachable directly. Rate limits still apply, but with `TRUST_PROXY = 2` a client that sends its own `X-Forwarded-For` through `fly.dev` can choose its rate-limit key. The shared-secret follow-up is out of scope.
- **Worker limits on long SSE.** Cloudflare's CPU and wall-clock limits and idle timeouts may cut a multi-minute stream. r30 verifies a run longer than a few minutes. Heartbeats are every 15 s. If the stream is cut, fall back to the SPA calling Fly directly with CORS. That is out of scope and needs a new task.
- **Secrets.** A leaked `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ADMIN_TOKEN` or Telegram token must be rotated (`fly secrets set`). `FLY_API_TOKEN` must be a deploy-scoped token, and `CLOUDFLARE_API_TOKEN` must have only Workers edit scope.

Out of scope:

- Items 8-13 of [improvement-proposals.md](../improvement-proposals.md).
- helmet and CSP.
- CORS.
- Serving `frontend/dist` from Express.
- Root workspaces.
- Running the backend on Cloudflare Workers.
- Fly autoscaling or more than one machine. This needs a shared run store first.
- A shared-secret header from the Worker to the backend (follow-up for the `fly.dev` bypass).
- A per-agent model from the admin UI or the request body. `POST /api/admin/runs` stays strict `{title}`.
- Moving spawn counts, budgets or `checkSpawn` into the spec.
- Structured or JSON logging, timestamps, request IDs, and log files.
- Logging in `scripts/*.js`, and `AGENTS` in `scripts/agent-smoke.js`.

## Order

Global execution order. Lanes within a phase run in parallel.

1. **Phase 0.** Decide D1 and D6. Apply doc edits.
2. **Phase 1.** B07 || r16 -> r17 || B01 || B03 || r06 || r08 -> r09.
3. **Phase 2.** (D1) r01 -> r02 -> r03 || (D6) r23 -> r24 || r07 (after r01 and r06). r23 uses `logger.warn` from the start.
4. **Phase 3.** B08 || B09 (after r01), then B10, then B12. From here lint and CI reject raw `console`.
5. **Phase 4.** B02 -> B04 -> B05 -> B06; B11 (after B02 and B10).
6. **Phase 5.** Lane A: r04 -> r05 (after r24). Lane B: r18 (after B06) -> r10 -> r11 -> r19 -> r20. Lane C: r12 (after r11) -> r21 (after r20). Lanes parallel.
7. **Phase 6.** Front-end: r13 (after r12) -> r14 -> r15 || r22 (after r21 and r13).
8. **Phase 7.** r29 (after r16 and r24) -> r30 (after r04, r05, r07, r29) -> r31 (after r17, r29, r30).
9. **Phase 8 (docs, serialized).** B13 -> r25 -> r27 -> r28 -> r32 -> r33 (with the r30 findings) -> r26.

Shared-file serialization:

- `config.js`, `config.test.js` and `.env.example`: B01, B07, r03, r04, r05, r20, r25 in this order of phases. Edits use the constant names as anchors.
- `pipeline.js`: r03 -> B08 -> B10 -> B05 -> B06 -> r18 -> r10.
- `runAgentQuery.js`: r03 -> B08 -> B10 -> B02 -> B11.
- `runRegistry.js`: B08 -> r11 -> r19 -> r20.
- `app.js`: r01 -> B09 -> r04 -> r05.
- `frontend/src/constants/errors.js`: r07 -> r13 -> r22 -> r30.
- `backend/CLAUDE.md`: B13 -> r25 -> r27.
- `backend/README.md`: r12 -> r21 -> B13 -> r25 -> r27 -> r28 -> r32.
- Test files: r02 -> B02 and B04 (tests are referred to by name). r03 -> B05. r24 -> r05 (both change `package.json`).

## Tasks

Gate column: tasks that exist or change only when a decision is approved. Transitive gates are not repeated. Recommended defaults are shown: D1 remove `/api/generate`, D6 fetch notifier.

| # | Task | Side | Size | Depends on | Gate |
|---|------|------|------|------------|------|
| B01 | [Add per-agent model constants to config](b01-add-per-agent-model-constants-to-config.md) | backend | S | - | - |
| B02 | [Use each agent's model in AGENTS and runAgentQuery](b02-use-each-agent-model-in-agents-and-run-agent-query.md) | backend | S | B01, r03 | D1 |
| B03 | [Move spawn-tool argument schemas to validation](b03-move-spawn-tool-argument-schemas-to-validation.md) | backend | S | - | - |
| B04 | [Add AGENT_SPECS; build AGENTS and PIPELINE_TOOL_NAMES from it](b04-add-agent-specs-build-agents-and-pipeline-tool-names.md) | backend | M | B02, B03 | - |
| B05 | [Build the pipeline MCP server from AGENT_SPECS](b05-build-pipeline-mcp-server-from-agent-specs.md) | backend | M | B04, r03 | D1 |
| B06 | [Read turn caps from the spec in runPipeline](b06-read-turn-caps-from-spec-in-run-pipeline.md) | backend | S | B04, B08, B10 | - |
| B07 | [Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md) | backend | S | - | - |
| B08 | [Send services logging through the logger](b08-send-services-logging-through-logger.md) | backend | S | B07, r03 (D1), r24 (D6) | D1, D6 |
| B09 | [Send app, routes and server logging through the logger](b09-send-app-routes-and-server-logging-through-logger.md) | backend | S | B07, r01 (D1) | D1 |
| B10 | [Lower noisy non-fatal logs to warn](b10-lower-noisy-non-fatal-logs-to-warn.md) | backend | S | B08 | D6 |
| B11 | [Add debug logs for agent init and startup models](b11-add-debug-logs-for-agent-init-and-startup-models.md) | backend | S | B02, B07, B10 | - |
| B12 | [Block raw console use in backend/src with ESLint](b12-block-raw-console-use-with-eslint.md) | backend | S | B08, B09, B10 | - |
| B13 | [Document per-agent models, the agent spec and LOG_LEVEL](b13-document-per-agent-models-agent-spec-and-log-level.md) | backend | S | B05, B06, B10, B11, B12 | - |
| r01 | [Unmount and delete POST /api/generate](r01-unmount-and-delete-post-api-generate.md) | backend | S | - | D1 |
| r02 | [Delete single-shot prompt and schema](r02-delete-single-shot-prompt-and-schema.md) | backend | S | r01 | D1 |
| r03 | [Move StreamAbortedError out and delete services/claude.js](r03-move-stream-aborted-error-and-delete-claude-service.md) | backend | M | r02, B07 | D1 |
| r04 | [Add TRUST_PROXY config](r04-add-trust-proxy-config.md) | backend | S | - | - |
| r05 | [Add rate limiting](r05-add-rate-limiting.md) | backend | M | r04, r24 (D6) | D6 |
| r06 | [Port generic streamSse tests to api/stream.test.js](r06-port-stream-sse-tests-to-api-stream-test.md) | front-end | S | - | - |
| r07 | [Delete dead single-shot UI](r07-delete-dead-single-shot-ui.md) | front-end | S | r06, r01 | D1 |
| r08 | [Use the run id slug as the last attempt](r08-run-id-slug-as-last-attempt.md) | backend | S | - | - |
| r09 | [Retry a transient insert failure once without duplicating](r09-retry-transient-insert-failure-once.md) | backend | S | r08 | - |
| r10 | [Report save failure as DRAFT_SAVE_FAILED and return the draft](r10-report-save-failure-as-draft-save-failed.md) | backend | S | B07, r18 | - |
| r11 | [Keep the unsaved draft on the run record](r11-keep-unsaved-draft-on-run-record.md) | backend | S | r10 | - |
| r12 | [GET /api/admin/runs/:runId/draft](r12-get-admin-run-draft-endpoint.md) | backend | S | r11 | - |
| r13 | [getRunDraft API function](r13-get-run-draft-api-function.md) | front-end | S | r12 | - |
| r14 | [Mark the save step failed on DRAFT_SAVE_FAILED](r14-mark-save-step-failed-on-draft-save-failed.md) | front-end | S | r13 | - |
| r15 | [Download draft action on the save-failed alert](r15-download-draft-action-on-save-failed-alert.md) | front-end | S | r13, r14 | - |
| r16 | [CI workflow with backend job](r16-ci-workflow-with-backend-job.md) | backend | S | - | - |
| r17 | [Front-end CI job](r17-front-end-ci-job.md) | front-end | S | r16 | - |
| r18 | [Collect sources as messages arrive](r18-collect-sources-as-messages-arrive.md) | backend | S | B06, B08 | - |
| r19 | [Track settling runs, clean up the grace listener, wait at shutdown](r19-track-settling-runs-and-wait-at-shutdown.md) | backend | S | r11, B08 | - |
| r20 | [Block start() while settling, within a window](r20-block-start-while-settling-within-window.md) | backend | S | r19 | - |
| r21 | [Map RunSettlingError to 409 RUN_SETTLING](r21-map-run-settling-error-to-409.md) | backend | S | r20, r12 | - |
| r22 | [Handle RUN_SETTLING in the run UI](r22-handle-run-settling-in-run-ui.md) | front-end | S | r21, r13 | - |
| r23 | [Bot API fetch notifier](r23-bot-api-fetch-notifier.md) | backend | M | B07 | D6 |
| r24 | [Switch to the fetch notifier and drop the MCP package](r24-switch-to-fetch-notifier-and-drop-mcp-package.md) | backend | S | r23 | D6 |
| r25 | [Update Telegram docs](r25-update-telegram-docs.md) | backend | S | r24, B13 | D6 |
| r26 | [Fix front-end docs](r26-fix-front-end-docs.md) | front-end | S | r07, r13, r15, r22, r28, r30 | D1 |
| r27 | [Fix backend and root docs (removed endpoint, rate limits, TRUST_PROXY)](r27-fix-backend-and-root-docs.md) | backend | S | r03, r05, B13 | D1 |
| r28 | [Deploy section in the backend README](r28-deploy-section-in-backend-readme.md) | backend | S | r04, r29, r30 | - |
| r29 | [Fly.io backend packaging](r29-fly-io-backend-packaging.md) | backend | M | r16, r24 (D6) | D6 |
| r30 | [Cloudflare Worker for frontend and API proxy](r30-cloudflare-worker-frontend-and-api-proxy.md) | front-end | M | r04, r05, r07, r29 | D1 |
| r31 | [CD workflow: deploy on merge to master](r31-cd-workflow-deploy-on-merge-to-master.md) | backend | M | r16, r17, r29, r30 | - |
| r32 | [Rollback and manual deploy path](r32-rollback-and-manual-deploy-path.md) | backend | S | r31, r28 | - |
| r33 | [One-time setup runbook](r33-one-time-setup-runbook.md) | backend | S | r29, r30, r31 | - |
