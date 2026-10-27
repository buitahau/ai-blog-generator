# r33 - One-time setup runbook

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r29 - Fly.io backend packaging](r29-fly-io-backend-packaging.md), [r30 - Cloudflare Worker for frontend and API proxy](r30-cloudflare-worker-frontend-and-api-proxy.md), [r31 - CD workflow: deploy on merge to master](r31-cd-workflow-deploy-on-merge-to-master.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Write `docs/features/platform-hardening/setup-cd.md`: an ordered runbook a new maintainer can follow from zero to a working deploy, with nothing else.

Steps, in order:

1. Accounts and tools: Fly.io account and `flyctl`; Cloudflare account (plus the zone if a custom domain is used); Neon project; GitHub admin on the repo; Node 22, Docker, `wrangler` through `npx`.
2. Neon: create the production database (or branch). Keep its connection string for `DATABASE_URL`.
3. Fly app: `cd backend && fly auth login && fly launch --no-deploy --copy-config`. Decline Postgres and Redis. Choose the app name and a region near Neon. Then `fly scale count 1` and `fly status` (one machine).
4. Fly secrets, before the first deploy (the release command needs `DATABASE_URL`):
   - `fly secrets set ANTHROPIC_API_KEY=... DATABASE_URL=... ADMIN_TOKEN=...`
   - `ADMIN_TOKEN`: `openssl rand -hex 32`. Store it in a password manager; it is the admin login.
   - Optional: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
5. Fly deploy token: `fly tokens create deploy -a <app>` (check `--help` for an expiry flag). Store the value as the GitHub secret `FLY_API_TOKEN`.
6. Cloudflare:
   - API token: dashboard, My Profile, API Tokens, Create Token, the "Edit Cloudflare Workers" template, scoped to the account. Store as `CLOUDFLARE_API_TOKEN`.
   - Account id: dashboard, account overview. Store as `CLOUDFLARE_ACCOUNT_ID`.
7. GitHub environment: Settings, Environments, New environment `production`.
   - Secrets: `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   - Variable: `API_ORIGIN` = `https://<app>.fly.dev`. This is the Fly origin the Worker proxies to, not the public domain.
   - Optional: required reviewers on `production`, so a deploy waits for approval.
8. First manual deploy:
   - Backend: `cd backend && fly deploy --remote-only`. The release command runs `npm run db:migrate` first. Check `fly logs`; the startup output includes a `Models:` line.
   - Frontend: `cd frontend && npm ci && npm run build && npx wrangler deploy --var API_ORIGIN:https://<app>.fly.dev`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the shell (or `npx wrangler login`).
9. `TRUST_PROXY` and the proxy checks (findings below). Measure the hop count, set `TRUST_PROXY` in `backend/fly.toml` `[env]` to the confirmed value, commit it, and run `cd backend && fly deploy --remote-only` again. Do this before turning on CD.
10. Smoke test the default URLs: `curl -fsS https://<worker-url>/api/health` returns `{"status":"ok"}`, and `https://<worker-url>/admin/login` loads.
11. Custom domain (optional): Worker dashboard, Settings, Domains & Routes, add the custom domain (the zone must be on Cloudflare). Then set `ADMIN_BASE_URL` in `backend/fly.toml` `[env]` to `https://<domain>` and deploy the backend again.
12. Turn on CD: merge a small change to `master`. Actions runs CI, then `deploy-backend`, then `deploy-frontend`.
13. Smoke test the product:
    - Open `https://<domain>/admin/login` and log in with `ADMIN_TOKEN`.
    - Start a run through the Worker: `curl -fsS -X POST https://<domain>/api/admin/runs -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"title":"Why small teams ship faster"}'`, which returns `{"runId":"..."}`.
    - Stream it: `curl -N -H "Authorization: Bearer $ADMIN_TOKEN" https://<domain>/api/admin/runs/<runId>/events`. Events arrive over time and the stream ends with `run_completed`.
    - Telegram (optional): with the two Telegram secrets set, the `notification` event shows `sent`.
14. Read [backend/README.md](../../../backend/README.md) `## Deploy` for rollback and manual deploy (r32).

Reference: every secret and variable used by the workflows:

| Where | Name | Used by |
|-------|------|---------|
| GitHub environment `production`, secret | `FLY_API_TOKEN` | `deploy-backend` |
| GitHub environment `production`, secret | `CLOUDFLARE_API_TOKEN` | `deploy-frontend` |
| GitHub environment `production`, secret | `CLOUDFLARE_ACCOUNT_ID` | `deploy-frontend` |
| GitHub environment `production`, variable | `API_ORIGIN` | both deploy jobs (smoke test; `--var` for the Worker) |
| Fly app secret (`fly secrets set`) | `ANTHROPIC_API_KEY` | backend |
| Fly app secret | `DATABASE_URL` | backend and release command |
| Fly app secret | `ADMIN_TOKEN` | backend |
| Fly app secret (optional) | `TELEGRAM_BOT_TOKEN` | backend |
| Fly app secret (optional) | `TELEGRAM_CHAT_ID` | backend |
| `backend/fly.toml` `[env]` | `PORT`, `TRUST_PROXY`, `ADMIN_BASE_URL` (optional) | backend |
| `backend/fly.toml` `[env]` (optional) | `LOG_LEVEL` (default `info`; never `silent` in production) | backend |
| `backend/fly.toml` `[env]` (optional) | `ANTHROPIC_MODEL`, `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL`, `WRITER_MODEL` | backend |

Troubleshooting to include:

- Release command fails: `fly logs`; usually `DATABASE_URL` is missing or the Neon branch is unreachable.
- Every client shares one rate-limit bucket: `TRUST_PROXY` is unset or wrong (see step 9).
- `UPSTREAM_UNAVAILABLE` (502) from the Worker: `API_ORIGIN` is wrong or the Fly app is stopped (`fly status`).
- Deploy job says `API_ORIGIN` is empty: set the `production` variable.

Findings (measured in this task, step 9):

1. **Proxy hops.** Expected chain: browser, then Cloudflare edge (`CF-Connecting-IP` is the browser), then the Worker (`X-Forwarded-For: <browser>`), then the Fly edge, which appends the address it sees (`<cloudflare egress>`), then Node.
   - Express counts hops from the socket address. Node sees the list `[fly edge, cloudflare egress, browser]`, so the expected value is `TRUST_PROXY = 2`, not 1.
   - Measure: deploy a throwaway branch with a debug route that returns `req.ip` and `req.ips` (never merged), set `TRUST_PROXY` to 1, 2 and 3 in turn, call through `wrangler dev` pointing at the Fly app, and compare with the browser's real address. Result: TBD.
   - Record the confirmed value in `backend/fly.toml` `[env]` (step 9).
2. **Direct `fly.dev` access.** The `https://<app>.fly.dev` URL stays reachable without the Worker. With `TRUST_PROXY = 2`, a client that sends its own `X-Forwarded-For` through `fly.dev` can choose its rate-limit key (the spoofed entry lands at the untrusted position). Measure and record: TBD. Mitigation (out of scope, follow-up): a shared-secret header from the Worker, checked by the backend.
3. **SSE through the Worker.** Run an admin run and stream it through the deployed Worker with `curl -N`. Confirm events arrive over time (not in one batch) and that a run longer than a few minutes is not cut. Result: TBD. If it is cut, the fallback is the SPA calling Fly directly with CORS, which is out of scope and needs a new task.

These findings decide the `TRUST_PROXY` value and the SSE fallback. Fill them in during the task; until then they are TBD.

Files:

- `docs/features/platform-hardening/setup-cd.md` (new)
- `backend/fly.toml` (`TRUST_PROXY` after finding 1)

## Acceptance criteria

- [ ] A new maintainer can deploy from zero following only `setup-cd.md`.
- [ ] Every secret and variable name in the table matches the workflows and the Fly and Cloudflare commands exactly.
- [ ] The steps run in the order listed (secrets before the first deploy, `TRUST_PROXY` set and deployed before CD is turned on).
- [ ] The TRUST_PROXY hop count is measured and recorded (finding 1), and the `fly.dev` bypass is recorded (finding 2).
- [ ] SSE through the deployed Worker is checked (finding 3).
- [ ] The smoke test covers login, a run that streams over SSE through the Worker, and the optional Telegram notification.
- [ ] The doc links to r32 for rollback.

## Verification

- A reviewer follows the runbook on a throwaway Fly app and Worker name, or walks through it with the real accounts before go-live.
- Compare the names in the table with `.github/workflows/ci.yml`, `backend/fly.toml` and `frontend/wrangler.jsonc` using grep.
- Findings 1 and 2: the throwaway experiment in finding 1, run after the first manual deploy.
- Finding 3 and the deployed Worker check: `npx wrangler dev --remote --var API_ORIGIN:https://<app>.fly.dev` or the deployed Worker, for a multi-minute run.

## API contract

None. Documentation only.
