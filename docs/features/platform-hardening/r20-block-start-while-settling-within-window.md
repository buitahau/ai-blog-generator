# r20 - Block start() while settling, within a window

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r19 - Track settling runs, clean up the grace listener, wait at shutdown](r19-track-settling-runs-and-wait-at-shutdown.md), [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Add `ABORT_SETTLE_MAX_MS = 60_000` to `backend/src/config.js`, and a `createRunRegistry({ settleMaxMs })` option.
- Store `{ pipeline, since: Date.now() }` in `settling`.
- Update `shutdown()` to wait on `[...settling.values()].map(e => e.pipeline)`, because the values are now objects and no longer promises.
- Add `export class RunSettlingError`.
- In `start()`, after the closing check: if any `settling` entry is younger than `settleMaxMs`, throw `RunSettlingError`.
- Older entries no longer block. On the first such check for a run, log `logger.error('Run exceeded settle window; admitting new run:', id)` once.
- This is D5. After 60 s, a truly stuck SDK subprocess can overlap a new run. This is bounded and logged.

Files:

- `backend/src/config.js`
- `backend/src/services/runRegistry.js`
- `backend/test/runRegistry.test.js`

## Acceptance criteria

- [ ] `start()` is rejected within the window.
- [ ] `start()` succeeds after the window, and the log fires once.
- [ ] `start()` succeeds right after the stuck pipeline resolves.

## Verification

- `runRegistry.test.js` with `vi.useFakeTimers()`.

## API contract

None. `RunSettlingError` is mapped to HTTP in r21.
