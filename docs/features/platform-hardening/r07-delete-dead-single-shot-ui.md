# r07 - Delete dead single-shot UI

> **Pending decision D1.** This task applies only if D1 (remove `POST /api/generate`) is approved. If D1 is rejected: this task is dropped. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r06 - Port generic streamSse tests to api/stream.test.js](r06-port-stream-sse-tests-to-api-stream-test.md), [r01 - Unmount and delete POST /api/generate](r01-unmount-and-delete-post-api-generate.md) (for the contract)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Delete these files, with their tests:
  - `src/App.jsx`, `App.test.jsx` and `App.integration.test.jsx`
  - `components/BlogForm.jsx` and `components/BlogOutput.jsx`
  - `hooks/useBlogGeneration.js` and its test
  - `api/generate.js` and its test
- In `constants/options.js`, remove `TONE_OPTIONS`, `LENGTH_OPTIONS`, `DEFAULTS` and `LIMITS`. Keep `PAGE_MAX`.
- In `constants/errors.js:3`, drop "Shared with the single-shot generator (App.jsx)" from the comment.
- Keep `MarkdownView`, `api/http.js` and `api/stream.js`.

## Acceptance criteria

- [ ] `grep -rn "api/generate\|App.jsx\|BlogForm\|BlogOutput\|useBlogGeneration" frontend/src` returns nothing.
- [ ] `npm test`, lint and build pass.

## Verification

- Run the commands above.
- `npm run dev`: the routes `/`, `/blogs/:slug` and `/admin/*` render.

## API contract

None. This removes the front-end use of `POST /api/generate` (see D1).
