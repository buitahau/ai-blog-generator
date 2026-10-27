# r29 - Fly.io backend packaging

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [r16 - CI workflow with backend job](r16-ci-workflow-with-backend-job.md), [r24 - Switch to the fetch notifier and drop the MCP package](r24-switch-to-fetch-notifier-and-drop-mcp-package.md) (if D6 is approved)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Package the backend for Fly.io. The backend stays on Fly and does not go on Workers: the Agent SDK spawns a subprocess (`backend/src/services/agents/runAgentQuery.js`), a run lasts minutes and streams SSE, and `runRegistry` is in memory (D9).

- `backend/Dockerfile`:
  - Base image `node:22-slim` (`engines` is `>=22`).
  - `WORKDIR /app` and `ENV NODE_ENV=production`.
  - `COPY package.json package-lock.json`, then `RUN npm ci --omit=dev`.
  - `COPY src ./src` and `COPY scripts ./scripts`. Also `COPY drizzle ./drizzle`: it is not in the first list, but `npm run db:migrate` (`scripts/migrate.js`) reads the generated migrations from it, so the release command fails without it.
  - `USER node` (the non-root user in the official Node images).
  - `EXPOSE 3001` and `CMD ["node", "src/server.js"]`. The `start` script is `node src/server.js`. Run `node` directly, not `npm start`, so SIGTERM reaches the server process and not an npm wrapper.
  - No `.env` in the image and no secret in `ENV` or `ARG`.
- `backend/.dockerignore`: `node_modules`, `.env`, `.env.*`, `test`, `coverage`, `*.log`, `Dockerfile`, `.dockerignore`, `fly.toml`.
- Agent SDK CLI: `@anthropic-ai/claude-agent-sdk` 0.3.308 ships the CLI as a platform package through `optionalDependencies`. On amd64 with glibc that is `@anthropic-ai/claude-agent-sdk-linux-x64`; the `-musl` variant is for Alpine. `node:22-slim` is glibc Debian, so do not switch the base to Alpine. Fly builds `linux/amd64`; on Apple silicon build with `--platform linux/amd64`.
- Pending decision D6: if D6 is approved (default; r24 removes the MCP package), drop this bullet. If D6 is rejected: `telegram-chat-bot-mcp` is started by `backend/src/services/notifier/telegramMcp.js`. Check at implementation that it resolves from `node_modules` and is not downloaded at runtime (for example through `npx`).
- PID 1: Node runs as PID 1 and does not reap orphaned grandchildren. Check for zombie processes after a run. Add `tini` only if zombies show up.
- `backend/fly.toml`:
  - `app` and `primary_region` are set by `fly launch`. The region is TBD at implementation; pick one near the Neon database.
  - `[env]`: `PORT = "3001"`. `TRUST_PROXY` is added once r33 has measured the hop count. Optional, non-secret: `LOG_LEVEL = "info"` (never `silent` in production), and `ANTHROPIC_MODEL`, `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL` and `WRITER_MODEL` if set. No secret goes here.
  - `[http_service]`: `internal_port = 3001`, `force_https = true`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`. The requirement wrote `false`; flyctl documents the string form `"off"`. Confirm with `fly config validate`.
  - `[[http_service.checks]]`: `method = "GET"`, `path = "/api/health"`, `interval = "15s"`, `timeout = "2s"`, `grace_period = "10s"`.
  - `kill_signal = "SIGTERM"` and `kill_timeout = 15` (seconds). Shutdown waits up to `SHUTDOWN_WAIT_MS` (10 s), then `server.close` with a 2 s straggler timer, so 15 s covers it.
  - `[deploy]`: `release_command = "npm run db:migrate"` (the script name is checked against `backend/package.json`) and `strategy = "immediate"`. With one machine, `immediate` stops the old machine before the new one starts; that downtime is accepted (see the requirement risks).
  - `[[vm]]`: `size = "shared-cpu-1x"`, `memory = "512mb"`. This is an assumption. Measure memory during a run, because each agent spawns a CLI subprocess.
- Exactly one machine. After `fly launch`, run `fly scale count 1` and confirm with `fly status`. Reason: `runRegistry` is in memory and `MAX_CONCURRENT_RUNS = 1` applies per process. A second machine would have its own run list and cap, and admin SSE or cancel could reach a machine that does not hold the run. Scaling out needs a shared run store first, which is out of scope.
- Secrets are set with `fly secrets set` and never appear in `fly.toml` or the repo: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ADMIN_TOKEN`, and optionally `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Each `fly secrets set` restarts the machine. Keep values out of shell history (for example read them with `read -s` first).
- Non-secret config in `[env]` only: `PORT`, `TRUST_PROXY` (r33), `LOG_LEVEL` and the `*_MODEL` variables above, and `ADMIN_BASE_URL` (set in r33 once the domain is known).

Files:

- `backend/Dockerfile` (new)
- `backend/.dockerignore` (new)
- `backend/fly.toml` (new)

## Acceptance criteria

- [ ] `docker build` succeeds for `backend/`.
- [ ] The container starts with dummy env, and `GET /api/health` returns 200 with `{ "status": "ok" }`.
- [ ] `fly config validate` passes on `backend/fly.toml`.
- [ ] No secret is in the repo, in `fly.toml`, or in the image. The image has no `.env`.
- [ ] The Agent SDK CLI works in the image: with a dummy key, a run fails with an API auth error from the CLI, not with a spawn error.
- [ ] `fly.toml` allows one machine only (`min_machines_running = 1`, `fly scale count 1` documented).
- [ ] `release_command` is `npm run db:migrate`, and the image contains `drizzle/`.

## Verification

- `docker build -t blog-backend backend/` (add `--platform linux/amd64` on Apple silicon).
- `docker run --rm -p 3001:3001 -e ANTHROPIC_API_KEY=dummy -e DATABASE_URL=postgres://dummy@localhost:5432/dummy -e ADMIN_TOKEN=$(openssl rand -hex 32) blog-backend`, then `curl -fsS localhost:3001/api/health`. The health route does not touch the database, so the container starts without a reachable DB.
- `docker run --rm --entrypoint sh blog-backend -c 'ls -la /app'` shows no `.env`.
- `cd backend && fly config validate`.
- First launch, manual: `cd backend && fly launch --no-deploy --copy-config`, then `fly scale count 1`. The first real deploy happens in [r33](r33-one-time-setup-runbook.md).
- Migration against a Neon branch is checked in r33, not locally.

## API contract

None. Packaging only. `/api/health` is unchanged.
