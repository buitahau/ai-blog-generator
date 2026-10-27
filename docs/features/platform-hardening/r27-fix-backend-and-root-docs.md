# r27 - Fix backend and root docs (removed endpoint, rate limits, TRUST_PROXY)

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r03 - Move StreamAbortedError out and delete services/claude.js](r03-move-stream-aborted-error-and-delete-claude-service.md), [r05 - Add rate limiting](r05-add-rate-limiting.md), [B13 - Document per-agent models, the agent spec and LOG_LEVEL](b13-document-per-agent-models-agent-spec-and-log-level.md), [r25 - Update Telegram docs](r25-update-telegram-docs.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- The removed endpoint (D1) and the new settings (D2, D3) are documented here.
- `backend/README.md`:
  - Line 3 (the single-shot description): rewrite it to describe the run-based API, since `POST /api/generate` is removed.
  - Remove the `POST /api/generate` section (currently lines 61-98) and its example (currently lines 200-208).
  - Line 234 (the SSE reference in the admin runs section): point the reference at `/api/admin/runs/:id/events`.
  - Lines 96 and 235 (where error codes are listed): document both meanings of `RATE_LIMITED`. The upstream Anthropic rate limit is a run error and is retryable. The HTTP 429 from the new limiter is a response to `/api/*`.
  - Add `TRUST_PROXY` to the env table.
  - Add a "Rate limits" subsection under the API section, with the D2 numbers and the 429 response shape.
- `backend/CLAUDE.md`:
  - Remove lines 12, 17, 22, 32 and 66.
  - Rewrite line 63 (the max_tokens/MAX_TOKENS_CEILING rule) to "The client can never set model or limits".
  - Update the constants on line 11 to the names in `config.js` after r05 and r20.
  - Update line 10 (trust proxy and rate limiters), line 31 (`getUnsavedDraft` and the settling state) and line 36 (the draft route).
  - Remove the `claude.js` reference at line 73.
  - Add `middleware/rateLimit.js` and `services/abort.js`.
- Root `CLAUDE.md`, layout section:
  - Drop `streamGenerate`, `useBlogGeneration`, "BlogForm, BlogOutput", "form options (tones, lengths)" and "POST /api/generate (SSE)".
  - `services/`: drop "Claude streaming service", and add `abort.js`.
  - `lib/`: add the logger.
  - `middleware/`: add `rateLimit.js`.
  - Add `.github/workflows/` (CI and CD), `frontend/worker/` and `frontend/wrangler.jsonc`.

Files:

- `backend/README.md`
- `backend/CLAUDE.md`
- `CLAUDE.md`

## Acceptance criteria

- [ ] `grep -rn "/api/generate\|streamBlogPost\|blogPost.js" CLAUDE.md backend/CLAUDE.md backend/README.md` returns nothing.

## Verification

- The grep above.
- A reviewer reads the rate-limit and `TRUST_PROXY` text against `backend/src/app.js`.

## API contract

Documents the removed endpoint (D1) and the rate limits (D2): any `/api/*` route except `/api/health` can return 429 `RATE_LIMITED`.
