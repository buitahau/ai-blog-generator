# r21 - Map RunSettlingError to 409 RUN_SETTLING

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r12 - GET /api/admin/runs/:runId/draft](r12-get-admin-run-draft-endpoint.md), [r20 - Block start() while settling, within a window](r20-block-start-while-settling-within-window.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In the error mapping of `backend/src/routes/adminRuns.js`, add:
  `if (err instanceof RunSettlingError) return sendError(res, 409, 'RUN_SETTLING', 'The previous run is still stopping. Try again in a few seconds.');`
- Add a row for this error to the runs table in `backend/README.md`.

Files:

- `backend/src/routes/adminRuns.js`
- `backend/test/adminRuns.test.js`
- `backend/README.md`

## Acceptance criteria

- [ ] With a registry stub that throws `RunSettlingError`, supertest gets 409 with code `RUN_SETTLING`.
- [ ] `backend/README.md` lists the row.

## Verification

- `npm test -- adminRuns`.

## API contract

- `POST /api/admin/runs` returns 409 `{ error: { code: 'RUN_SETTLING', message } }` while the previous run is settling.
- `GET /active` returns `{ runId: null }` while settling.
