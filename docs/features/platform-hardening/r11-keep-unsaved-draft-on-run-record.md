# r11 - Keep the unsaved draft on the run record

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r10 - Report save failure as DRAFT_SAVE_FAILED and return the draft](r10-report-save-failure-as-draft-save-failed.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/services/runRegistry.js`, in `execute`, add `.then((result) => { if (result?.draft) run.unsavedDraft = result.draft; })` to the pipeline chain, before `.catch`.
- Add the registry method `getUnsavedDraft(runId)`. It returns `run.unsavedDraft ?? null`, and `null` for an unknown run.
- The draft is dropped on eviction after `RUN_RETENTION_MS`.

Files:

- `backend/src/services/runRegistry.js`
- `backend/test/runRegistry.test.js` (new)

## Acceptance criteria

- [ ] A fake `runPipeline` that returns `{ draft }` is readable through `getUnsavedDraft`.
- [ ] A normal run gives `null`.
- [ ] An unknown id gives `null`.

## Verification

- New `backend/test/runRegistry.test.js` using `createRunRegistry({ runPipeline: fake, retentionMs: 50 })`, including a check after eviction.

## API contract

None. Internal. The HTTP route is in r12.
