# B08 - Send services logging through the logger

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [r03 - Move StreamAbortedError out and delete services/claude.js](r03-move-stream-aborted-error-and-delete-claude-service.md) (D1), [r24 - Switch to the fetch notifier and drop the MCP package](r24-switch-to-fetch-notifier-and-drop-mcp-package.md) (D6)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Replace each `console.X` with `logger.X`, keeping the level and the arguments.
- Call sites: every `console.*` in:
  - `backend/src/services/agents/runAgentQuery.js` (the `[agent stderr]` and temp dir cleanup calls are lowered to warn in B10)
  - `backend/src/services/agents/normalize.js` (the `console.debug` becomes hidden at the default `info` level; this is accepted)
  - `backend/src/services/orchestrator/tools.js`
  - `backend/src/services/pipeline.js`
  - `backend/src/services/runRegistry.js`
- Pending decision D1 (recommended default: remove `/api/generate`): r03 deletes `backend/src/services/claude.js` before this task, so its `console` call is not listed here. If D1 is rejected: also convert the `console` call in `services/claude.js`.
- Pending decision D6 (recommended default: fetch notifier): r24 deletes `backend/src/services/notifier/telegramMcp.js` before this task, so its calls are not listed here. If D6 is rejected: also convert the `console` calls in `notifier/telegramMcp.js`, keeping `redact(...)` exactly as it is.

## Acceptance criteria
- [ ] `grep -rn "console\." backend/src/services` returns nothing.
- [ ] Existing tests pass unchanged, including the exact-argument asserts and the Telegram redaction tests.

## Verification

- `npm test`.
- Add a test, in `logger.test.js` or `runAgentQuery.test.js`, where `vi.mock('../src/lib/logger.js')` provides `createLogger({ level: 'silent' })`. The "Unexpected agent tools" path must not call `console.error`.

## API contract

None. Logging only; the SSE contract is unchanged.
