# B5 - Claude streaming service

- **Side:** backend
- **Area:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** [B2 - Config module with single model constant and startup checks](b2-backend-config-module.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`backend/src/services/claude.js`:

- Holds one Anthropic client.
- Exports `streamBlogPost({system, messages, maxTokens, signal, onText})`.
- Uses `client.messages.stream(...)` with `MODEL`.
- Sends text deltas to `onText`.
- Returns `{stopReason, usage}`.
- Ties `signal` to `stream.abort()`.

Error mapping:

- 429 → `RATE_LIMITED`
- 529 → `OVERLOADED`
- Other API errors → `UPSTREAM_ERROR`
- Anything else → `INTERNAL_ERROR`

The full error is logged server-side only.

Confirm the streaming API with the `claude-api` skill before writing the code.

## Acceptance criteria

- [x] `MODEL` from config is the only model reference.
- [x] `maxTokens` is clamped to the ceiling.
- [x] Aborting stops the stream and surfaces the abort (not an upstream error).
- [x] Error mapping matches the contract.

## Verification

- vitest with the SDK mocked:
  - deltas arrive in order
  - usage is returned
  - `maxTokens` clamp
  - abort
  - 429 / 529 / 500 mapping
- Optional manual smoke test with a real key.

## API contract

None. Internal service interface. Upstream error codes map to the `error` event codes defined in [00-requirement.md](00-requirement.md#api-contract).
