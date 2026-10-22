# F3 - useBlogGeneration hook

- **Side:** frontend
- **Area:** frontend
- **Size:** S
- **Status:** resolved
- **Depends on:** [F2 - api/ module with SSE stream client](f2-frontend-api-sse-client.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`frontend/src/hooks/useBlogGeneration.js` wraps the F2 client.

State:

- `status`: `idle` | `streaming` | `done` | `cancelled` | `error`
- `content`
- `error`
- `stopReason`
- `usage`

Actions:

- `generate(params)`: cancels any running request, then starts a new one.
- `cancel()`
- `reset()`

Other behaviour:

- Aborts on unmount.
- Deltas are appended to `content` and batched (for example, flushed on `requestAnimationFrame`).

## Acceptance criteria

- [x] `status` is correct for success, cancel, and error.
- [x] A new generation aborts the previous one, and stale deltas never mix into the new content.
- [x] Unmounting while streaming aborts the request and causes no React warnings.

## Verification

- `renderHook` tests with F2 mocked:
  - success
  - cancel
  - error
  - new generation mid-stream
  - unmount

## API contract

None. Consumes the client in [F2](f2-frontend-api-sse-client.md), which implements the [`POST /api/generate`](00-requirement.md#api-contract) contract.
