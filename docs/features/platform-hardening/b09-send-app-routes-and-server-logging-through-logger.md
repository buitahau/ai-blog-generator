# B09 - Send app, routes and server logging through the logger

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [r01 - Unmount and delete POST /api/generate](r01-unmount-and-delete-post-api-generate.md) (D1)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- The `console.error` call in `backend/src/app.js` becomes `logger.error`.
- Pending decision D1 (recommended default: remove `/api/generate`): r01 deletes the route, so `backend/src/routes/generate.js` is not changed here. If D1 is rejected: the `console.info` and `console.error` calls in `routes/generate.js` become `logger.info` and `logger.error`.
- In `backend/src/server.js`, the non-fatal `console` calls become logger calls. At the time of writing, `:14` and `:34` are `info` (become `logger.info`) and `:38` is `error` (becomes `logger.error`).
- Keep the three plain `console.error` calls right before `process.exit` in `server.js` (at the time of writing `:9`, `:18`, `:30`), with the comment `// Printed regardless of LOG_LEVEL: the process exits next.`

## Acceptance criteria
- [ ] Outside `server.js`, `grep -rn "console\." backend/src` returns nothing.
- [ ] If D1 is rejected: the info spy and the error assert in `generate.test.js` still pass.
- [ ] With `LOG_LEVEL=silent`, a missing `ANTHROPIC_API_KEY` still prints the config error and exits with code 1.

## Verification

- `npm test`.
- `LOG_LEVEL=silent ANTHROPIC_API_KEY= node src/server.js` prints the config error and exits with code 1.
- `LOG_LEVEL=silent npm start` shows no "listening" line.

## API contract

None. Logging only.
