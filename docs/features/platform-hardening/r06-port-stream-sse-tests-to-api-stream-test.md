# r06 - Port generic streamSse tests to api/stream.test.js

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- `frontend/src/api/generate.test.js` is today's main coverage of `api/stream.js`. r07 deletes it, so the generic cases move first.
- Create `frontend/src/api/stream.test.js`. Call `streamSse(url, {...})` directly, with endpoint-agnostic cases:
  - event dispatch
  - heartbeat comments are ignored
  - `STREAM_INTERRUPTED` when the stream ends before the final event
  - `NETWORK_ERROR` when fetch rejects
  - `HTTP_ERROR` on a non-OK response without a code
  - a server `{ error: { code } }` body is passed through
  - abort resolves quietly, without calling `onError`
  - the auth header is sent, and a 401 clears the token
- Reuse the `sseResponse` and `frame` helpers from `generate.test.js:6-26`. Copy them rather than importing, because that file is deleted in r07.

Files:

- `frontend/src/api/stream.test.js` (new)
- `frontend/src/api/generate.test.js` (read only)

## Acceptance criteria

- [ ] Each case in the list above is covered.
- [ ] `npm test` passes.
- [ ] The new file has no `generate.js` import.

## Verification

- `cd frontend && npm test -- stream`.

## API contract

None. Tests the existing `streamSse` client.
