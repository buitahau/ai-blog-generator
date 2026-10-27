# r15 - Download draft action on the save-failed alert

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r13 - getRunDraft API function](r13-get-run-draft-api-function.md), [r14 - Mark the save step failed on DRAFT_SAVE_FAILED](r14-mark-save-step-failed-on-draft-save-failed.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- `frontend/src/components/agent/RunMessage.jsx` receives `runId` through `run.runId`.
- In `ErrorAlert`, when `error.code === DRAFT_SAVE_FAILED`, show an `Alert type="error"` with the server message and an action button "Download draft".
- On click:
  1. call `getRunDraft(runId)`
  2. build `new Blob([contentMd], { type: 'text/markdown' })`
  3. download it through a temporary `<a download="draft-<runId first 8>.md">`
  4. revoke the object URL
- On rejection, show `message.error('The draft is no longer available.')`.
- There is no Retry button for this code.

Files:

- `frontend/src/components/agent/RunMessage.jsx`
- `frontend/src/components/agent/RunMessage.test.jsx` (new)

## Acceptance criteria

- [ ] The button appears only for `DRAFT_SAVE_FAILED`.
- [ ] A click calls `getRunDraft` with the run id (mocked).
- [ ] A rejection shows `message.error`.

## Verification

- New `RunMessage.test.jsx`, with `api/runs.js` mocked and `URL.createObjectURL` stubbed.
- Manual: point `DATABASE_URL` at an unreachable host and start a run. The alert appears and the download works.

## API contract

Consumes `GET /api/admin/runs/:runId/draft` (see r12).
