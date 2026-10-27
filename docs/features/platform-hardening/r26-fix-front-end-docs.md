# r26 - Fix front-end docs

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r07 - Delete dead single-shot UI](r07-delete-dead-single-shot-ui.md), [r13 - getRunDraft API function](r13-get-run-draft-api-function.md), [r15 - Download draft action on the save-failed alert](r15-download-draft-action-on-save-failed-alert.md), [r22 - Handle RUN_SETTLING in the run UI](r22-handle-run-settling-in-run-ui.md), [r28 - Deploy section in the backend README](r28-deploy-section-in-backend-readme.md), [r30 - Cloudflare Worker for frontend and API proxy](r30-cloudflare-worker-frontend-and-api-proxy.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- `frontend/CLAUDE.md`:
  - Line 12: list all pages, and remove "placeholders".
  - Delete lines 13, 15, 23, 27 and 28.
  - Line 18: the `api/http.js` text says it is "shared by generate.js". `generate.js` is deleted in r07, so fix the text.
  - Line 30 keeps only `PAGE_MAX`.
  - Lines 31 and 48 list error codes: add `RUN_SETTLING`, `DRAFT_SAVE_FAILED` and `UPSTREAM_UNAVAILABLE`, and note that `RATE_LIMITED` also means the HTTP 429 from the limiter (see Q4).
  - Lines 65 and 69-76: replace the `streamGenerate` and `App.jsx` error-handling text with run error handling (`RunMessage` and `constants/errors.js`, including `RUN_SETTLING` and `DRAFT_SAVE_FAILED`).
  - Line 66: remove `POST /api/generate`.
  - Add the new files: `api/stream.test.js` (r06), `getRunDraft` in `api/runs.js` (r13), and `worker/` and `wrangler.jsonc` (r30).
- `frontend/README.md:3,29,51-52,60,80`: describe the blog list and the admin generate flow.
  - Lines 53-55, 62 and 64-74: update to the run flow, the new error codes and the Worker.
  - Lines 29-31: r28 adds the Deploy link at line 31 first. Keep that link.
- The proxy example becomes `/api/admin/runs/:id/events`.

Files:

- `frontend/CLAUDE.md`
- `frontend/README.md`

## Acceptance criteria

- [ ] `grep -n "generate.js\|App.jsx\|BlogForm\|useBlogGeneration\|placeholder\|/api/generate" frontend/CLAUDE.md frontend/README.md` returns nothing, apart from an antd prop if quoted.

## Verification

- A reviewer reads both files against `AppRoutes.jsx`.

## API contract

None.
