# Blog Generator backend

Node.js API that generates blog posts with Claude. It validates the request, builds the prompt server-side, calls the Anthropic SDK, and streams the Markdown result to the browser as Server-Sent Events. The API key never leaves this service.

## Prerequisites

- Node.js 22 or newer
- An Anthropic API key

## Setup

```
cd backend
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
npm run dev
```

The server listens on `http://localhost:3001` by default and exits with an error if `ANTHROPIC_API_KEY` is missing.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | none | Anthropic API key. Keep it in `backend/.env` only. |
| `PORT` | no | `3001` | HTTP port. |
| `ANTHROPIC_MODEL` | no | default in `src/config.js` | Overrides the model ID. Leave empty to use the default. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with file watching. |
| `npm start` | Start without watching. |
| `npm test` | Run the test suite (SDK is mocked, no key needed). |
| `npm run lint` | Run ESLint. |

## API

All errors outside the SSE stream use this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path": "topic", "message": "..." }] } }
```

`details` is present only for validation errors.

### `GET /api/health`

Returns `200` with `{ "status": "ok" }`.

### `POST /api/generate`

Request: `Content-Type: application/json`, body up to 10 KB.

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `topic` | string | yes | trimmed, 3 to 200 characters |
| `tone` | string | no | `professional` (default), `casual`, `friendly`, `persuasive`, `technical` |
| `length` | string | no | `short` (about 400 words), `medium` (default, about 800), `long` (about 1500) |
| `audience` | string | no | trimmed, up to 100 characters; blank is treated as not provided |
| `keywords` | string[] | no | up to 10 items, each trimmed, 1 to 40 characters |

Unknown fields (including `model` and `max_tokens`) are rejected. The token limit is fixed by `length` on the server (1024, 2048, or 4096) and never exceeds 4096.

Pre-stream errors (JSON, not SSE):

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid or unknown fields (see `details`) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 4xx | `BAD_REQUEST` | Other malformed request (body-parser failures not listed here) |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type is not JSON, or unsupported charset/encoding |
| 404 | `NOT_FOUND` | Unknown route |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

On success the response is `200` with `Content-Type: text/event-stream`. Events:

| Event | Data | Notes |
| --- | --- | --- |
| `start` | `{}` | Stream opened. |
| `delta` | `{ "text": "..." }` | Next chunk of Markdown. |
| `done` | `{ "stopReason": "end_turn" \| "max_tokens", "usage": { "inputTokens": n, "outputTokens": n } }` | Final event on success. `max_tokens` means the post was cut off. |
| `error` | `{ "code": "...", "message": "..." }` | Final event on failure after the stream started. |

In-stream error codes: `RATE_LIMITED`, `OVERLOADED`, `UPSTREAM_ERROR` (also used when the model declines the request), `INTERNAL_ERROR`. Messages are safe, generic text; upstream details are only logged on the server.

A `: ping` comment is sent every 15 seconds as a heartbeat. Closing the connection cancels the upstream request. If the upstream doesn't start responding within 60 seconds (`REQUEST_TIMEOUT_MS`, per attempt; the SDK retries up to twice), the stream ends with an `UPSTREAM_ERROR` event. Generation itself has no overall time limit.

### Example

```
curl -N -X POST http://localhost:3001/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Why small teams ship faster","tone":"casual","length":"short","keywords":["focus","feedback"]}'
```

`-N` disables curl's output buffering so events appear as they arrive.

## Troubleshooting

- **"Config error: missing ANTHROPIC_API_KEY"**: copy `.env.example` to `.env` and set the key, then restart.
- **"Port 3001 is already in use"**: set `PORT` to a free port in `.env`.
- **Stream arrives all at once**: a reverse proxy is buffering. The service sends `X-Accel-Buffering: no` for nginx; for other proxies disable response buffering for `/api/generate`. With curl, use `-N`.
- **`error` event with `RATE_LIMITED` or `OVERLOADED`**: temporary upstream condition; retry shortly.
