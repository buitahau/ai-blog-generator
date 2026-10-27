# r13 - getRunDraft API function

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r07 - Delete dead single-shot UI](r07-delete-dead-single-shot-ui.md), [r12 - GET /api/admin/runs/:runId/draft](r12-get-admin-run-draft-endpoint.md) (for the contract)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `frontend/src/api/runs.js`, add:
  `export const getRunDraft = (runId) => adminRequest(`${BASE}/${encodeURIComponent(runId)}/draft`)`
- In `frontend/src/constants/errors.js`, add `export const DRAFT_SAVE_FAILED = 'DRAFT_SAVE_FAILED'`.
- Do not add `DRAFT_SAVE_FAILED` to `RETRYABLE_RUN_ERRORS`. A retry would rerun the paid pipeline.

Files:

- `frontend/src/api/runs.js`
- `frontend/src/api/runs.test.js`
- `frontend/src/constants/errors.js`

## Acceptance criteria

- [ ] `runs.test.js` checks the URL.
- [ ] `runs.test.js` checks the Bearer header.
- [ ] `runs.test.js` checks that a 404 rejects with `{ code: 'NOT_FOUND' }`.

## Verification

- `npm test -- runs`.

## API contract

Consumes `GET /api/admin/runs/:runId/draft` (see r12).
