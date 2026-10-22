# F06 - Make SSE client generic and add runs API

- **Side:** front-end
- **Size:** M
- **Status:** todo
- **Depends on:** [F04 - Add admin token login and route guard](f04-admin-token-login-route-guard.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- Move the core of `api/generate.js` to `api/stream.js`:
  - `streamSse(url, {method, body, headers, signal, onEvent, finalEvents})`.
  - Keeps error normalising: `NETWORK_ERROR`, `HTTP_ERROR`, `STREAM_INTERRUPTED`.
  - Abort is a quiet cancel.
  - `reader.cancel()` in `finally`.
- Expose the SSE `id` (update `api/sse.js` if needed).
- `streamGenerate` becomes a wrapper with unchanged tests.
- `api/runs.js`:
  - `startRun(title)`
  - `getActiveRun()`
  - `subscribeRun(runId, {lastEventId, signal, onEvent})`: sends `Last-Event-ID` and `Authorization` headers.
  - `cancelRun(runId)`

## Acceptance criteria
- [ ] Existing generate and SSE tests pass.
- [ ] `run_completed`, `run_cancelled`, and `error` are final events.
- [ ] Interruption reports `STREAM_INTERRUPTED` with the last id.
- [ ] A 401 clears the token and reports `{code:'UNAUTHORIZED'}` through `onError` or a rejection; no navigation inside `src/api`.

## Verification

- `npm test` with `runs.test.js` (mocked fetch and stream chunks): headers, id plumbing, interrupt, abort (no `onError`).

## API contract

Consumes the run endpoints. See [B10](b10-run-registry-admin-run-sse-endpoints.md):

- `POST /api/admin/runs` with `{title}`: `202` `{runId}`.
- `GET /api/admin/runs/active`: `{runId}` or `{runId: null}`.
- `GET /api/admin/runs/:runId/events` (SSE, `Last-Event-ID`).
- `POST /api/admin/runs/:runId/cancel`: `202`.
