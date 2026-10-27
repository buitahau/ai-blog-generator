# r14 - Mark the save step failed on DRAFT_SAVE_FAILED

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r13 - getRunDraft API function](r13-get-run-draft-api-function.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `frontend/src/hooks/useAgentRun.js`, in `case 'error'`, when `data.code === 'DRAFT_SAVE_FAILED'`, call `patchStep(next, 'save', 'failed')`, then `finish(...)`.

Files:

- `frontend/src/hooks/useAgentRun.js`
- its reducer test

## Acceptance criteria

- [ ] For `DRAFT_SAVE_FAILED`, the reducer test gives `steps.save === 'failed'` and `status === 'error'`.
- [ ] Other error codes leave `save` unchanged.

## Verification

- `npm test -- useAgentRun`.

## API contract

Consumes the `error` event with code `DRAFT_SAVE_FAILED` (see r10).
