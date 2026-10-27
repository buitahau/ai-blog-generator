# r03 - Move StreamAbortedError out and delete services/claude.js

> **Pending decision D1.** This task applies only if D1 (remove `POST /api/generate`) is approved. If D1 is rejected: this task is dropped. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [r02 - Delete single-shot prompt and schema](r02-delete-single-shot-prompt-and-schema.md), [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Create `backend/src/services/abort.js` with `StreamAbortedError` copied unchanged from the `StreamAbortedError` class in `claude.js` (same name, same reason handling).
- Repoint the imports:
  - the `StreamAbortedError` import in `services/pipeline.js`
  - the `StreamAbortedError` import in `services/agents/runAgentQuery.js`
  - the tests `orchestratorTools`, `runAgentQuery`, `pipeline` and `adminRuns`
- Delete `services/claude.js` and `test/claude.test.js`.
- In `config.js`, remove `MAX_TOKENS_CEILING` and `REQUEST_TIMEOUT_MS`, and their assertions in `test/config.test.js`. Keep `LENGTH_PRESETS` and its positive-preset test.
- Keep `@anthropic-ai/sdk` in `package.json`. It is a peer dependency of the Agent SDK.
- Sequencing: this task runs before B08. B08 does not edit `claude.js` (D1).

Files:

- `backend/src/services/abort.js` (new)
- `backend/src/services/claude.js` (delete)
- `backend/test/claude.test.js` (delete)
- `backend/src/services/pipeline.js`
- `backend/src/services/agents/runAgentQuery.js`
- `backend/src/config.js`
- `backend/test/config.test.js`
- the tests listed above

## Acceptance criteria

- [ ] `grep -rn "services/claude" backend` returns nothing.
- [ ] `StreamAbortedError.name === 'StreamAbortedError'`.
- [ ] All tests pass.

## Verification

- `npm test && npm run lint`.
- From `backend/`, `node -e "import('./src/app.js')"` starts without errors.

## API contract

None. Internal refactor. Abort behaviour is unchanged.
