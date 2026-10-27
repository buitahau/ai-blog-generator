# r02 - Delete single-shot prompt and schema

> **Pending decision D1.** This task applies only if D1 (remove `POST /api/generate`) is approved. If D1 is rejected: this task is dropped. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r01 - Unmount and delete POST /api/generate](r01-unmount-and-delete-post-api-generate.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Delete `backend/src/prompts/blogPost.js` and `backend/src/validation/generateSchema.js`.
- In `backend/test/prompts.test.js`, remove the `buildBlogPrompt` tests. Keep the researcher, orchestrator and writer tests.
- In `backend/test/validation.test.js`, remove the `generateSchema` describe block. Switch the validate middleware test at line 42 to `startRunSchema` from `validation/runSchema.js`.
- Keep `LENGTH_PRESETS`. `prompts/writer.js` uses it.

Files:

- `backend/src/prompts/blogPost.js` (delete)
- `backend/src/validation/generateSchema.js` (delete)
- `backend/test/prompts.test.js`
- `backend/test/validation.test.js`

## Acceptance criteria

- [ ] Neither deleted module is imported anywhere.
- [ ] The validate middleware is still tested: 400 `VALIDATION_ERROR` with `details`.
- [ ] Tests and lint pass.

## Verification

- `npm test`.
- `grep -rn "generateSchema\|blogPost" backend/src backend/test` returns nothing.

## API contract

None. Internal modules only.
