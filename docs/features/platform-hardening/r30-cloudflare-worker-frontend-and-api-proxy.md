# r30 - Cloudflare Worker for frontend and API proxy

- **Status:** TBD
- **Side:** front-end
- **Size:** M
- **Depends on:** [r04 - Add TRUST_PROXY config](r04-add-trust-proxy-config.md), [r05 - Add rate limiting](r05-add-rate-limiting.md), [r07 - Delete dead single-shot UI](r07-delete-dead-single-shot-ui.md), [r22 - Handle RUN_SETTLING in the run UI](r22-handle-run-settling-in-run-ui.md), [r29 - Fly.io backend packaging](r29-fly-io-backend-packaging.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Serve the built SPA and proxy `/api/*` to the Fly.io backend from one Cloudflare Worker with static assets (D9). Browsers call relative `/api/*` URLs on the Worker domain, as the dev proxy does today.

This task covers the Worker code, local `wrangler dev` and the tests. The checks that need a deployed Fly app (the `TRUST_PROXY` hop count, the `fly.dev` bypass and SSE through the deployed Worker) are in [r33](r33-one-time-setup-runbook.md).

- Config: `frontend/wrangler.jsonc`. The config sits in `frontend/`, so the paths below are relative to `frontend/`.
  - `name`, `compatibility_date` (set to the date of implementation, TBD until then).
  - `main`: `worker/src/index.js`.
  - `assets`: `directory: "./dist"`, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`.
  - `vars`: `API_ORIGIN`. The value is the Fly origin (`https://<app>.fly.dev`). It is not a secret, and it is not hardcoded: CI and manual deploys pass it with `--var API_ORIGIN:<origin>`, so the config never points at a dev host by accident. The config holds an empty placeholder.
- `frontend/worker/src/index.js`:
  - Handles only `/api/*`. Any other path is not handled by the script; if it is ever invoked for one, it returns `env.ASSETS.fetch(request)`.
  - Fails with 500 if `API_ORIGIN` is empty.
  - Builds the upstream URL from `API_ORIGIN` plus the same path and query.
  - Forwards the method, the headers and the body. The body is passed through as a stream and is not read.
  - Forwards `Authorization`.
  - Overwrites `X-Forwarded-For` with the value of `CF-Connecting-IP`, so a client cannot spoof its address through the Worker.
  - Strips hop-by-hop headers in both directions (`Connection`, `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`) and `Host`.
  - Sends `Accept-Encoding: identity` upstream, as the Vite dev proxy does, so no hop compresses or buffers the SSE stream.
  - Passes `request.signal` to the upstream `fetch`, so a client disconnect cancels the upstream request. Admin runs keep running after a subscriber leaves (backend rule), because only the subscription is cancelled.
  - Returns the upstream status and headers, and `body` set to the upstream `body` stream object (no `text()`, no `TransformStream`). `Content-Type: text/event-stream` and `Cache-Control: no-cache` are kept; set `no-cache` if the upstream omits it on an SSE response.
  - If `fetch` rejects, returns `502` with `{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "The API is unavailable. Please retry shortly." } }`.
- `frontend/src/constants/errors.js`: add `UPSTREAM_UNAVAILABLE` to `RETRYABLE_RUN_ERRORS`. The code is not in that list today, so the 502 is not retryable without this change.
- Tests: `frontend/worker/src/index.test.js`, with `// @vitest-environment node` at the top. They run with the frontend `npm test`, so CI r17 already runs them. Mock `fetch` with `vi.stubGlobal`. Cover: path, query and method forwarded; JSON body forwarded; `Authorization` forwarded; SSE response body is the same stream object as the upstream body; `502 UPSTREAM_UNAVAILABLE` when `fetch` rejects; `X-Forwarded-For` set from `CF-Connecting-IP` and a client-sent value overwritten; hop-by-hop headers stripped; non-`/api` paths not forwarded.
  - If the Workers runtime wraps the body so it is not the same object, keep the test on chunk-by-chunk reads from one stream and record the change in a comment at the top of `index.test.js`.
- `wrangler` is a devDependency of `frontend/`. Local dev: `npm run build`, then `npx wrangler dev --var API_ORIGIN:http://localhost:3001` (default port 8787). Serves the built SPA and proxies `/api` to the local backend.
- ESLint: `frontend/worker/` may need Workers globals in the flat config. Check at implementation.

### Deployed measurements (moved to r33)

The `TRUST_PROXY` hop count, the direct `fly.dev` access check and SSE through the deployed Worker need a deployed Fly app. They are measured in [r33](r33-one-time-setup-runbook.md), after the first manual deploy, and the result sets `TRUST_PROXY` in `backend/fly.toml`.

Files:

- `frontend/wrangler.jsonc` (new)
- `frontend/worker/src/index.js` (new)
- `frontend/worker/src/index.test.js` (new)
- `frontend/package.json` (`wrangler` devDependency)
- `frontend/eslint.config.js` (only if the Workers globals need it)
- `frontend/src/constants/errors.js` (`UPSTREAM_UNAVAILABLE` in `RETRYABLE_RUN_ERRORS`)

## Acceptance criteria

- [ ] `wrangler dev` serves the built SPA, and `/admin/generate` deep-links to `index.html`.
- [ ] `wrangler dev` proxies `/api/health` to a local backend and returns its 200 response.
- [ ] An SSE run streams incrementally through the Worker (`curl -N`, local backend).
- [ ] The Worker tests pass in `npm test`, and CI runs them.
- [ ] The Worker never reads the response body, and the SSE response passes the upstream stream through.
- [ ] `X-Forwarded-For` is set from `CF-Connecting-IP` and a client value is overwritten.
- [ ] The Worker does not handle non-`/api` paths.
- [ ] `UPSTREAM_UNAVAILABLE` is in `RETRYABLE_RUN_ERRORS`.

## Verification

- `cd frontend && npm run build && npm test`.
- `cd frontend && npx wrangler dev --var API_ORIGIN:http://localhost:3001`, with the backend running locally.
  - `curl -i localhost:8787/admin/generate` returns the SPA `index.html`.
  - `curl -i localhost:8787/api/health` returns the backend's `200`.
- SSE: `curl -N -H "Authorization: Bearer $ADMIN_TOKEN" localhost:8787/api/admin/runs/<runId>/events`. Events must appear one by one.

## API contract

None for the backend. The Worker adds no new endpoints. It returns `502 { error: { code: "UPSTREAM_UNAVAILABLE", message } }` when the upstream cannot be reached.
