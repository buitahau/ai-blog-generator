# Blog Generator scaffold

## Summary

Starting code for a Blog Generator. The user fills a form (topic, tone, length, optional audience, keywords), watches the post stream in as sanitized Markdown, and can cancel at any time. Errors show as antd `message` / `Alert`.

- **Backend:** Node.js + Express 5. The only part that holds `ANTHROPIC_API_KEY` and talks to Claude. Validates requests, keeps prompts in their own module, caps `max_tokens`, and streams via SSE.
- **Front-end:** React + Vite + antd v5. Calls only our backend through a small `api/` module and renders Markdown sanitized.

## Goals

- Starting code for a Blog Generator.
- User can fill a form, watch the post stream in as sanitized Markdown, and cancel at any time.
- Errors are shown to the user as antd `message` / `Alert`.

## Functional requirements

- **FR1** `GET /api/health` returns `{"status":"ok"}`.
- **FR2** `POST /api/generate` validates the request, builds the prompt, and streams the result over SSE.
- **FR3** A client disconnect aborts the Claude call.
- **FR4** The form collects topic, tone, length, audience, and keywords, with client-side hints. The backend still validates everything.
- **FR5** Output streams into an antd panel as sanitized Markdown, with Cancel and Copy.
- **FR6** Errors are shown via antd `message` / `Alert`. A `max_tokens` truncation shows a warning.

## Non-functional requirements

- **Security**
  - `ANTHROPIC_API_KEY` lives only in `backend/.env` (gitignored). `backend/.env.example` is committed.
  - The front-end never imports the SDK.
  - Request body limit is 10 KB.
  - Upstream error details are not sent to the client.
  - Markdown output is sanitized.
- **Cost**
  - The server sets `max_tokens` from the requested length, capped at the ceiling.
  - The client cannot send `max_tokens`.
- **Performance**
  - No buffering. Responses set `X-Accel-Buffering: no` and `Cache-Control: no-cache`.
- **Reliability**
  - The server fails at startup when the key is missing.
  - A `: ping` heartbeat is sent every 15 seconds.
- **Accessibility**
  - antd Form labels on all fields.
  - Output region uses `aria-live="polite"` and `aria-busy`.
- **Maintainability**
  - One model constant.
  - Prompts live in `backend/src/prompts/`.
  - API calls live in `frontend/src/api/`.

## Assumptions & open questions

### Assumptions

- Node 22 LTS.
- Plain JavaScript ES modules.
- npm, with one `package.json` per side.
- Backend: `express` 5, `zod`, `dotenv`, `vitest` + `supertest` (SDK mocked).
- Front-end: Vite, React, antd v5, `react-markdown` + `rehype-sanitize` (no raw HTML), `vitest` + React Testing Library.
- Vite dev server proxies `/api` to `http://localhost:3001`.
- Model ID is held in one constant in `backend/src/config.js`, overridable with `ANTHROPIC_MODEL`. Default is the latest model, believed to be `claude-opus-5-5`. The implementer must confirm the ID via the `claude-api` skill.
- `POST /api/generate` responds with `text/event-stream`. The front-end reads it with `fetch` + `ReadableStream` (`EventSource` is GET-only).
- No persistence and no auth.
- Length mapping:
  - short: ~400 words, `max_tokens` 1024
  - medium: ~800 words, `max_tokens` 2048
  - long: ~1500 words, `max_tokens` 4096
  - `MAX_TOKENS_CEILING` = 4096

### Open questions (defaults)

- JS or TS? Default: JS. TS adds roughly S of work to B1 and F1.
- Tones: professional, casual, friendly, persuasive, technical. Audience is optional. Up to 10 keywords.
- Rate limiting? Default: none, add later.
- ESLint / Prettier? Default: yes, minimal.
- Git init? Default: write `.gitignore` files regardless.

## Risks & out of scope

### Risks

- No auth and no rate limiting. Fix before deployment.
- Proxies may buffer SSE.
- Wrong model ID or SDK usage. Check the `claude-api` skill and smoke-test with a real key.
- Prompt injection. Delimit user fields and sanitize output.
- Re-render per token. Batch deltas in F3.

### Out of scope

- Saved drafts / history.
- Accounts / auth.
- Deployment, Docker, CI.
- Editing or regenerating sections.
- SEO metadata / images.
- Export formats.
- UI i18n.
- Rate limiting / quotas (deferred).

### Notes

- No root `README.md` task. A possible future task R1 if requested.

## API contract

### `GET /api/health`

- `200` `{"status":"ok"}`

### `POST /api/generate`

Request: `application/json`

| Field | Type | Rules |
|-------|------|-------|
| `topic` | string | required, trimmed, 3–200 characters |
| `tone` | string | one of `professional` \| `casual` \| `friendly` \| `persuasive` \| `technical`; default `professional` |
| `length` | string | one of `short` \| `medium` \| `long`; default `medium` |
| `audience` | string | optional, ≤100 |
| `keywords` | string[] | optional, ≤10 items, each 1–40 characters |

Unknown fields (including `max_tokens` and `model`) are rejected.

Pre-stream JSON errors:

- `400` `{"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"path":"topic","message":"..."}]}}`
- `400` `INVALID_JSON`
- `413` `PAYLOAD_TOO_LARGE`
- `415` `UNSUPPORTED_MEDIA_TYPE`

Success: `200` `text/event-stream`. Events:

- `start` `{}`
- `delta` `{"text":"..."}` (repeated)
- `done` `{"stopReason":"end_turn"|"max_tokens","usage":{"inputTokens":n,"outputTokens":n}}`
- `error` `{"code":"UPSTREAM_ERROR"|"RATE_LIMITED"|"OVERLOADED"|"INTERNAL_ERROR","message":"<safe text>"}`

Additional rules:

- `: ping` comments are sent every 15 seconds.
- The stream always ends with exactly one `done` or one `error`, then closes.
- On client disconnect, the server aborts the SDK stream and sends nothing more.

## Tasks

Order: Backend B1 → B2 → (B3, B4 in parallel) → B5 → B6 → B7. Front-end F1 → (F2, F4, F5 in parallel) → F3 → F6 → F7. F6 end-to-end verification is where both sides must be finished.

| # | Task | Area | Size | Depends on |
|---|------|------|------|------------|
| B1 | [Scaffold backend package with health endpoint](b1-backend-scaffold-health.md) | backend | S | - |
| B2 | [Config module with single model constant and startup checks](b2-backend-config-module.md) | backend | S | B1 |
| B3 | [Request validation](b3-backend-request-validation.md) | backend | S | B1 |
| B4 | [Prompt templates](b4-backend-prompt-templates.md) | backend | S | B2 |
| B5 | [Claude streaming service](b5-backend-claude-streaming-service.md) | backend | M | B2 |
| B6 | [POST /api/generate SSE route](b6-backend-generate-sse-route.md) | backend | M | B3, B4, B5 |
| B7 | [Write backend CLAUDE.md and README.md](b7-backend-docs.md) | backend | S | B6 (first draft can start after B1) |
| F1 | [Scaffold Vite + React + antd app](f1-frontend-scaffold.md) | frontend | S | - (proxy check needs B1 running) |
| F2 | [api/ module with SSE stream client](f2-frontend-api-sse-client.md) | frontend | M | F1 (contract from B6; buildable before B6 merged) |
| F3 | [useBlogGeneration hook](f3-frontend-generation-hook.md) | frontend | S | F2 |
| F4 | [Generation form component](f4-frontend-generation-form.md) | frontend | S | F1 |
| F5 | [Output panel with safe Markdown rendering](f5-frontend-output-panel.md) | frontend | S | F1 |
| F6 | [Wire up main page and error display](f6-frontend-main-page-errors.md) | frontend | M | F3, F4, F5 (end-to-end needs B6) |
| F7 | [Write frontend CLAUDE.md and README.md](f7-frontend-docs.md) | frontend | S | F6 (first draft can start after F1) |
