# F2 - api/ module with SSE stream client

- **Side:** frontend
- **Area:** frontend
- **Size:** M
- **Status:** resolved
- **Depends on:** [F1 - Scaffold Vite + React + antd app](f1-frontend-scaffold.md). Contract comes from [B6](b6-backend-generate-sse-route.md); buildable before B6 is merged.
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`frontend/src/api/generate.js`:

- `streamGenerate(params, {signal, onDelta, onDone, onError})` POSTs JSON to `/api/generate`.
- Non-OK response: parse the JSON error and call `onError({code, message, details})`.
- Otherwise: read `response.body` with `TextDecoder` and parse SSE frames. Handle frames split across chunks, multi-line `data:`, and `:` comments. Dispatch `delta`, `done`, and `error`.
- `AbortError` is treated as cancel. No `onError` call.
- A stream that ends with no `done` or `error` reports `STREAM_INTERRUPTED`.

Pure frame parser in `frontend/src/api/sse.js`.

## Acceptance criteria

- [x] Handles every event and error case in the contract.
- [x] A split frame is parsed correctly.
- [x] Abort stops reading without calling `onError`.
- [x] No antd or React imports in the `api/` module.

## Verification

- vitest on `sse.js`:
  - single frame
  - split frames
  - comments
  - multiple events in one chunk
- `streamGenerate` tests with `fetch` mocked:
  - happy path
  - 400 JSON error
  - mid-stream `error` event
  - abort
  - cut-off stream

## API contract

Client for [`POST /api/generate`](00-requirement.md#api-contract) (`application/json`), reading the `text/event-stream` response.

- Events: `start`, `delta` `{"text"}`, `done` `{"stopReason","usage"}`, `error` `{"code","message"}`.
- Pre-stream JSON errors: `VALIDATION_ERROR` (with `details`), `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`.
- Client-side codes: `STREAM_INTERRUPTED` when the stream ends without `done` or `error`; `NETWORK_ERROR` when `fetch` fails before a response (server unreachable); `HTTP_ERROR` for a non-OK response whose body is not the JSON error shape.
