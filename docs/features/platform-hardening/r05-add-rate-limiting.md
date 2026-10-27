# r05 - Add rate limiting

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [r04 - Add TRUST_PROXY config](r04-add-trust-proxy-config.md), [r24 - Switch to the fetch notifier and drop the MCP package](r24-switch-to-fetch-notifier-and-drop-mcp-package.md) (if D6 is approved)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Add `express-rate-limit@^8` to `backend/package.json`. It is a direct dependency now. In the lockfile it is only a transitive dependency of `@modelcontextprotocol/sdk`.
- New `backend/src/middleware/rateLimit.js` exports `createLimiter({ windowMs, limit })`, which wraps `rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler })`.
- The handler sends 429 `{ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' } }`.
- In `backend/src/config.js`:
  - `RATE_LIMIT_WINDOW_MS = 15 * 60_000`
  - `API_RATE_LIMIT = 600`
  - `ADMIN_SESSION_RATE_LIMIT = 20`
  - `RUN_START_RATE_LIMIT = 10`
- `createApp` accepts `rateLimits = { windowMs, api, adminSession, runStart }`, defaulting to the config values.
- Build the limiters inside `createApp`, so each app instance has its own store and tests share no counters.
- Mount order:
  1. `/api/health`
  2. `app.use('/api', apiLimiter)`
  3. `app.use('/api/admin/session', sessionLimiter)`
  4. `app.post('/api/admin/runs', runStartLimiter)`
  5. the existing routers

  The session limiter sits before `requireAdmin`, so failed 401 responses count.

Files:

- `backend/package.json`
- `backend/src/middleware/rateLimit.js` (new)
- `backend/src/config.js`
- `backend/src/app.js`
- `backend/test/rateLimit.test.js` (new)

## Acceptance criteria

- [ ] With `api: 2`, the 3rd `GET /api/blogs` returns 429.
- [ ] `/api/health` is never limited.
- [ ] With `adminSession: 2`, the 3rd request returns 429 even with a bad token.
- [ ] With `runStart: 1`, the 2nd `POST /api/admin/runs` returns 429.
- [ ] Existing tests pass with the defaults.

## Verification

- Supertest with `createApp({ rateLimits })` and a mocked repo and registry, like `test/adminRuns.test.js`.
- Manual: `for i in $(seq 25); do curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/admin/session; done` shows 401 for the first 20 requests, then 429.

## API contract

- Any `/api/*` route except `/api/health` can return 429 `{ error: { code: 'RATE_LIMITED', message } }`.
- 429 responses carry the `RateLimit`, `RateLimit-Policy` and `Retry-After` headers.
