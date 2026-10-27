# r01 - Unmount and delete POST /api/generate

> **Pending decision D1.** This task applies only if D1 (remove `POST /api/generate`) is approved. If D1 is rejected: this task is replaced by one task that gates `POST /api/generate` behind `requireAdmin`. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/app.js`, delete the import on line 2 and the mount on line 53.
- Delete `backend/src/routes/generate.js` and `backend/test/generate.test.js`.
- In `backend/test/app.test.js`, change the four `/api/generate` targets (lines 14, 24, 33 and 48) to `/api/admin/runs`. Body parsing runs at app level before auth, so 400, 413 and 415 still come back.
- Add an app test that asserts `POST /api/generate` returns 404.

Files:

- `backend/src/app.js`
- `backend/src/routes/generate.js` (delete)
- `backend/test/generate.test.js` (delete)
- `backend/test/app.test.js`

## Acceptance criteria

- [ ] `POST /api/generate` returns 404 `NOT_FOUND`.
- [ ] `grep -rn "routes/generate" backend/src` returns nothing.
- [ ] `npm test` and `npm run lint` pass.

## Verification

- `curl -s -X POST localhost:3001/api/generate -H 'Content-Type: application/json' -d '{}'` returns `{"error":{"code":"NOT_FOUND",...}}`.
- The new `app.test.js` case asserts the 404.

## API contract

- `POST /api/generate` is removed. Any request to it returns 404 `NOT_FOUND`.
