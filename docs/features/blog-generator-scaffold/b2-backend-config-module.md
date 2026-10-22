# B2 - Config module with single model constant and startup checks

- **Side:** backend
- **Area:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** [B1 - Scaffold backend package with health endpoint](b1-backend-scaffold-health.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`backend/src/config.js`:

- Loads `dotenv`.
- Exports `MODEL`: a default constant, overridable by `ANTHROPIC_MODEL`.
- Exports `PORT`.
- Exports `MAX_TOKENS_CEILING = 4096`.
- Exports `LENGTH_PRESETS`: word target and `max_tokens` per length (short ~400 / 1024; medium ~800 / 2048; long ~1500 / 4096).
- Exports `REQUEST_TIMEOUT_MS`.

Startup check: a missing `ANTHROPIC_API_KEY` stops the server with a clear error. The error never prints the key.

Confirm the model ID with the `claude-api` skill before fixing the default.

## Acceptance criteria

- [x] Grep for model ID strings finds exactly one match, in `config.js`.
- [x] The server refuses to start without a key, with a readable error.
- [x] No preset exceeds `MAX_TOKENS_CEILING`.

## Verification

- `ANTHROPIC_API_KEY= npm start` exits 1 with "missing ANTHROPIC_API_KEY".
- `grep -rn "claude-" backend/src` shows only `config.js`.
- Unit test: presets are ≤ ceiling.

## API contract

None. Internal module.
