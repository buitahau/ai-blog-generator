# r19 - Track settling runs, clean up the grace listener, wait at shutdown

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r11 - Keep the unsaved draft on the run record](r11-keep-unsaved-draft-on-run-record.md), [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [B08 - Send services logging through the logger](b08-send-services-logging-through-logger.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Today `shutdown()` in `backend/src/services/runRegistry.js` waits only for running runs. Retention eviction can drop a run whose pipeline still runs. This task tracks such runs separately.
- In `backend/src/services/runRegistry.js`, add a registry-level `const settling = new Map()` (run id to pipeline promise). It is independent of the `runs` retention.
- Expose the settling run ids through `settlingRunIds()`, which returns an array of run ids.
- In `execute`, after the race: if the pipeline has not settled (the `settled` flag, set in `.finally`), call `settling.set(run.id, pipeline)` and `logger.warn('Run still settling after abort:', run.id)`.
- The pipeline's `.finally` deletes the entry.
- Store the `arm` listener and call `signal.removeEventListener('abort', arm)` after the race.
- `shutdown()` waits on `[...active.map((r) => r.pipeline), ...settling.values()]`, bounded by `shutdownWaitMs`.

Files:

- `backend/src/services/runRegistry.js`
- `backend/test/runRegistry.test.js` (from r11)

## Acceptance criteria

- [ ] With a fake pipeline that ignores abort and `abortGraceMs: 10`, `settling` has one entry after cancel and none after the pipeline resolves. The test reads the map through `settlingRunIds()`, which returns an array of run ids.
- [ ] `shutdown` waits for a settling pipeline, up to the limit.
- [ ] After normal completion, no abort listener is left. The test spies on `add` and `removeEventListener`.

## Verification

- `backend/test/runRegistry.test.js` (from r11), with fake timers.

## API contract

None. Internal to the registry.
