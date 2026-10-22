# B7 - Write backend CLAUDE.md and README.md

- **Side:** backend
- **Area:** backend
- **Size:** S
- **Depends on:** [B6 - POST /api/generate SSE route](b6-backend-generate-sse-route.md) (first draft can start after [B1](b1-backend-scaffold-health.md))
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

### `backend/CLAUDE.md` (for agents)

- Layout: `src/config.js`, `validation/`, `prompts/`, `services/claude.js`, `routes/generate.js`, `lib/sse.js`.
- Commands: `dev`, `start`, `test`, `lint`.
- Rules:
  - The key lives only in `.env`.
  - The model ID lives only in `config.js`.
  - Prompts stay in `prompts/`.
  - The client can never set `max_tokens` or `model`.
  - SDK errors are logged, never sent to the client.
  - Tests mock the SDK.
- Pointer to the `claude-api` skill before any SDK change.

### `backend/README.md` (for humans)

- What the service does.
- Prerequisites: Node 22.
- Setup: `cp .env.example .env`, then set `ANTHROPIC_API_KEY`.
- Env var table: `ANTHROPIC_API_KEY`, `PORT`, `ANTHROPIC_MODEL`.
- Run and test commands.
- API contract: health and generate, with request fields, error codes, and SSE events.
- `curl -N` example.
- Short troubleshooting section: missing key, proxy buffering.

### Root `CLAUDE.md`

- Updated to link to both subfolder `CLAUDE.md` files, so layout and commands are not duplicated.

## Acceptance criteria

- [ ] Both files exist in `backend/`.
- [ ] Commands and env vars match `package.json`, `.env.example`, and `config.js`.
- [ ] The documented API contract matches the implemented routes.
- [ ] Only placeholders appear, no real key.
- [ ] Root `CLAUDE.md` links to both subfolder `CLAUDE.md` files.

## Verification

- Follow the README from a clean clone: the server starts and the `curl` example streams.
- `grep -rn "sk-ant" backend/` returns nothing.

## API contract

None. Documentation task. Documents the contract in [00-requirement.md](00-requirement.md#api-contract).
