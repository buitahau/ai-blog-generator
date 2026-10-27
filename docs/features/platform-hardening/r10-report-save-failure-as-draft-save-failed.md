# r10 - Report save failure as DRAFT_SAVE_FAILED and return the draft

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [r18 - Collect sources as messages arrive](r18-collect-sources-as-messages-arrive.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Today a failed save loses the finished draft. This task keeps it and reports the failure.
- In `backend/src/services/pipeline.js`, wrap the `repo.createDraft` call (the save step) in its own try/catch.
  - If `signal?.aborted`, rethrow as `StreamAbortedError` (unchanged).
  - Otherwise log with `logger.error('Draft save failed:', err?.cause?.code ?? err?.code ?? err?.name)`. Log no content.
  - Emit `{ type: 'error', code: 'DRAFT_SAVE_FAILED', message: MESSAGES.DRAFT_SAVE_FAILED }`.
  - Return `{ status: 'failed', code: 'DRAFT_SAVE_FAILED', draft: { title, contentMd, sources } }`, where `title` is the parsed title.
- Add to `MESSAGES`: `DRAFT_SAVE_FAILED: 'The draft could not be saved. Download it from this run before it expires.'`

Files:

- `backend/src/services/pipeline.js`
- `backend/test/pipeline.test.js`

## Acceptance criteria

- [ ] When `createDraft` rejects, exactly one final `error` event with code `DRAFT_SAVE_FAILED` is emitted.
- [ ] No `blog_saved` event, and no notification.
- [ ] The returned `draft.contentMd` equals the writer output.
- [ ] The abort case still throws `StreamAbortedError`.

## Verification

- `npm test -- pipeline`.

## API contract

- New final error code `DRAFT_SAVE_FAILED`, emitted with no agent.
- It is preceded by the orchestrator's `agent_completed`.
- No `blog_saved` event and no notification.
- Not retryable on the front-end (see r13).
