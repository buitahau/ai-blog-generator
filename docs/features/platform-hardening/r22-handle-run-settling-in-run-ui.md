# r22 - Handle RUN_SETTLING in the run UI

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r21 - Map RunSettlingError to 409 RUN_SETTLING](r21-map-run-settling-error-to-409.md) (for the contract), [r13 - getRunDraft API function](r13-get-run-draft-api-function.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Add `'RUN_SETTLING'` to `RETRYABLE_RUN_ERRORS` in `frontend/src/constants/errors.js`.
- The generic `ErrorAlert` shows the server message with a Retry button.
- There is no "Show it" action. A `RUN_IN_PROGRESS` reattach would find nothing.
- A 429 `RATE_LIMITED` from `POST /api/admin/runs` (the start-run limiter from r05) shows the server message. This is the HTTP 429 response, not the upstream Anthropic code with the same name (see Q4).

Files:

- `frontend/src/constants/errors.js`
- `AdminGeneratePage.test.jsx` (existing)

## Acceptance criteria

- [ ] In `AdminGeneratePage.test.jsx`, `status: 'error'` with `error: { code: 'RUN_SETTLING', message: '...' }` renders the message and a Retry button.
- [ ] The same case shows no "Show it" action.
- [ ] A 429 `RATE_LIMITED` from `startRun` shows the server message.

## Verification

- `npm test -- AdminGeneratePage`.

## API contract

- Consumes 409 `RUN_SETTLING` (see r21).
- Consumes 429 `RATE_LIMITED` from the start-run limiter (see r05).
