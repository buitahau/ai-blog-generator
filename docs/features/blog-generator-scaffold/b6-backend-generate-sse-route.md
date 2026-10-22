# B6 - POST /api/generate SSE route

- **Side:** backend
- **Area:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** [B3 - Request validation](b3-backend-request-validation.md), [B4 - Prompt templates](b4-backend-prompt-templates.md), [B5 - Claude streaming service](b5-backend-claude-streaming-service.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`backend/src/routes/generate.js`, mounted in `app.js`.

Request order:

1. Validate the request.
2. Build the prompt.
3. Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Flush.
4. Send `start`.
5. Call B5. Send each chunk as `delta`.
6. Finish with exactly one `done` or `error`, then end the response.

Other behaviour:

- An `AbortController` fires on `res.on('close')` if the response has not finished.
- A `: ping` heartbeat is sent every 15 seconds. The timer is cleared on finish and on close.
- SSE frame writing lives in the helper `src/lib/sse.js`.

## Acceptance criteria

- [x] A valid request streams `start`, at least one `delta`, and `done` (with `stopReason` and `usage`). Verified with mocked B5 only; live curl check pending (needs a real API key).
- [x] A validation failure returns a JSON 400, not SSE.
- [x] A mid-stream upstream failure sends one `error` event with a safe message and no stack.
- [x] Client disconnect aborts the SDK stream within ~1 s, with no further writes (no "write after end"). Verified with mocked B5 only; live Ctrl-C check pending (needs a real API key).
- [x] The heartbeat timer is always cleared.

## Verification

- `curl -N -XPOST -H 'Content-Type: application/json' -d '{"topic":"Benefits of unit testing","length":"short"}' localhost:3001/api/generate` shows `event: start`, gradual `event: delta`, and `event: done`.
- Ctrl-C mid-stream: the server log shows the abort, with no errors.
- supertest with B5 mocked covers:
  - happy-path event order
  - `error` event
  - 400 path

## API contract

`POST /api/generate` (`application/json`). Request fields and rules as in [00-requirement.md](00-requirement.md#api-contract). Unknown fields, including `max_tokens` and `model`, are rejected.

Pre-stream JSON errors:

- `400` `VALIDATION_ERROR` with `details`
- `400` `INVALID_JSON`
- `413` `PAYLOAD_TOO_LARGE`
- `415` `UNSUPPORTED_MEDIA_TYPE`

Success: `200` `text/event-stream`.

- `start` `{}`
- `delta` `{"text":"..."}` (repeated)
- `done` `{"stopReason":"end_turn"|"max_tokens","usage":{"inputTokens":n,"outputTokens":n}}`
- `error` `{"code":"UPSTREAM_ERROR"|"RATE_LIMITED"|"OVERLOADED"|"INTERNAL_ERROR","message":"<safe text>"}`

Rules:

- `: ping` comments every 15 seconds.
- The stream always ends with exactly one `done` or one `error`, then closes.
- Client disconnect aborts the SDK stream and sends nothing more.
- `stopReason` is narrowed server-side: SDK `refusal` is sent as an `error` event (`UPSTREAM_ERROR`); any value other than `max_tokens` is sent as `end_turn`.
