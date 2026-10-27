# r09 - Retry a transient insert failure once without duplicating

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r08 - Use the run id slug as the last attempt](r08-run-id-slug-as-last-attempt.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Change the signature to `createBlogsRepo(db, { retryDelayMs = 500 } = {})`.
- In `createDraft`, on the first non-unique insert error:
  1. wait `retryDelayMs`
  2. run `select().from(blogs).where(eq(blogs.runId, runId)).limit(1)`
  3. if a row exists, return it, because the first insert may have committed and only the response was lost
  4. otherwise retry the same slug once
- A second non-unique error is thrown.
- Unique violations keep the r08 path.
- This assumes one draft per run. `run_id` has no index, which is fine at this size.

Files:

- `backend/src/db/blogsRepo.js`
- `backend/test/blogsRepo.test.js`

## Acceptance criteria

- [ ] A wrapper whose first insert rejects with `new Error('ECONNRESET')` yields one saved row.
- [ ] A wrapper that commits and then rejects returns the existing row, and the table holds exactly 1 row.
- [ ] Two non-unique failures reject.

## Verification

- New cases in `blogsRepo.test.js`, with `retryDelayMs: 0`.

## API contract

None. Internal to the repository.
