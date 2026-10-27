# r08 - Use the run id slug as the last attempt

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- The slug comes from the parsed H1 (`parseTitle` in `pipeline.js`), not from the typed title. A sixth draft with the same base slug currently fails to save.
- In `backend/src/db/blogsRepo.js`, `createDraft`:
  - keep attempts 1 to 5 (the empty suffix and `-2` to `-5`)
  - after a unique violation on attempt 5, try one more slug: `` `${base.slice(0, 80 - 9).replace(/-+$/, '')}-${runId.slice(0, 8)}` ``
  - if that slug also collides, throw the original error
- In `backend/test/blogsRepo.test.js`, replace the "gives up after 5 attempts" test.

Files:

- `backend/src/db/blogsRepo.js`
- `backend/test/blogsRepo.test.js`

## Acceptance criteria

- [ ] The 6th `Same` call returns slug `same-11111111`.
- [ ] A 7th call with the same run id rejects with `cause.code === '23505'`.
- [ ] The slug is 80 characters or fewer for a 150-character title.

## Verification

- `npm test -- blogsRepo` (PGlite).

## API contract

None. The slug rule is internal. A sixth draft with the same base slug saves as `<base>-<runId first 8>`.
