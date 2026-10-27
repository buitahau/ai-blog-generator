# r12 - GET /api/admin/runs/:runId/draft

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r11 - Keep the unsaved draft on the run record](r11-keep-unsaved-draft-on-run-record.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/routes/adminRuns.js`, add `router.get('/:runId/draft')` before `/:runId/events`.
- Return 200 `{ title, contentMd, sources }`, or 404 `NOT_FOUND` with the message "No unsaved draft for this run."
- Document the route in the admin runs table of `backend/README.md`, and add `DRAFT_SAVE_FAILED` to its error codes.

Files:

- `backend/src/routes/adminRuns.js`
- `backend/test/adminRuns.test.js`
- `backend/README.md`

## Acceptance criteria

- [ ] Supertest covers 200, 404 and 401 for the new route in `adminRuns.test.js`.
- [ ] `backend/README.md` lists the route and `DRAFT_SAVE_FAILED`.

## Verification

- `curl -H "Authorization: Bearer $ADMIN_TOKEN" localhost:3001/api/admin/runs/<id>/draft`.

## API contract

`GET /api/admin/runs/:runId/draft` (Bearer auth)

- 200 `{ title: string, contentMd: string, sources: [{ title, url }] }`
- 404 `NOT_FOUND`, message "No unsaved draft for this run."
- 401 `UNAUTHORIZED`
