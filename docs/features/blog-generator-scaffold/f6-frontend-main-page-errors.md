# F6 - Wire up main page and error display

- **Side:** frontend
- **Area:** frontend
- **Size:** M
- **Status:** resolved
- **Depends on:** [F3 - useBlogGeneration hook](f3-frontend-generation-hook.md), [F4 - Generation form component](f4-frontend-generation-form.md), [F5 - Output panel with safe Markdown rendering](f5-frontend-output-panel.md). End-to-end needs [B6](b6-backend-generate-sse-route.md).
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`src/App.jsx` (or `src/pages/GeneratorPage.jsx`) combines F3, F4, and F5 in a responsive antd `Row` / `Col` layout.

Error mapping:

- `VALIDATION_ERROR` → field errors on the form (F4) plus `message.error`.
- `RATE_LIMITED` / `OVERLOADED` → `Alert` saying to try again shortly.
- `UPSTREAM_ERROR` / `INTERNAL_ERROR` / `STREAM_INTERRUPTED` / network failure → error `Alert` with a Retry button that resends the last request.

## Acceptance criteria

- [ ] Full flow against the real backend: submit, gradual streaming, done.
- [ ] Cancel stops the stream in the UI and on the backend (backend log shows abort).
- [x] Each error class shows the specified antd feedback. (verified via mocked-fetch test)
- [x] Retry resends the last request. (verified via mocked-fetch test)

## Verification status

Verified by `frontend/src/App.integration.test.jsx` (mocked `fetch`; covers success streaming, cancel aborting the request signal, VALIDATION_ERROR field mapping plus `message.error`, RATE_LIMITED/OVERLOADED, UPSTREAM_ERROR/INTERNAL_ERROR/NETWORK_ERROR/STREAM_INTERRUPTED with Retry, and INVALID_JSON/PAYLOAD_TOO_LARGE/UNSUPPORTED_MEDIA_TYPE). `npm test`, `npm run lint`, and `npm run build` pass.

**NOT verified live** (needs a running backend and a real Claude key, not available here):
- Full real-backend flow (submit, gradual streaming, done) - first criterion left unticked.
- Cancel stopping the stream on the backend (backend abort log) - second criterion left unticked; only the client-side abort signal was verified.
- Stopping the real backend and retrying after restart.
- A real 400 response for a 2-character topic with client validation bypassed (mapping verified only against a mocked response).

## Verification

- Manual end-to-end with both servers:
  - Generate a "short" post and watch it stream gradually.
  - Cancel mid-stream and see the backend abort log.
  - Stop the backend, submit, and see the error `Alert`. In dev, the Vite proxy answers with a non-JSON 5xx, so this shows as `HTTP_ERROR` (not `NETWORK_ERROR`) with a Retry button. Retry works after restart.
  - A 2-character topic with client validation bypassed shows the 400 mapping.
- Integration test with `fetch` mocked for success and error paths.

## API contract

Consumes [`POST /api/generate`](00-requirement.md#api-contract) through [F2](f2-frontend-api-sse-client.md). Error codes handled: `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `UPSTREAM_ERROR`, `RATE_LIMITED`, `OVERLOADED`, `INTERNAL_ERROR`, and client-side `STREAM_INTERRUPTED`.
