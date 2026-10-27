# r18 - Collect sources as messages arrive

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B06 - Read turn caps from the spec in runPipeline](b06-read-turn-caps-from-spec-in-run-pipeline.md), [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [B08 - Send services logging through the logger](b08-send-services-logging-through-logger.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Today the researcher pushes every SDK message into an array. That includes the WebFetch and WebSearch results, which are the large part. The proposed fix "push only `type === 'user'`" still keeps those results. This task keeps no messages at all.
- In `backend/src/services/agents/normalize.js`, add `export function createSourceCollector()`, which returns `{ add(message), list() }`.
  - Move the loop body in `collectSources` into `add`, with the same try/catch and `logger.error`, and the same `MAX_SOURCES` cap.
- Re-implement `collectSources(messages)`: create a collector, `add` every message, and return `list()`.
- In `backend/src/services/pipeline.js`, in `runSub`:
  - remove `const messages = []` and `messages.push(message)`
  - add `const sources = isResearcher ? createSourceCollector() : null`
  - `onMessage` calls `sources?.add(message)`
  - return `sources: sources?.list()`

Files:

- `backend/src/services/agents/normalize.js`
- `backend/test/normalize.test.js`
- `backend/src/services/pipeline.js`
- `backend/test/pipeline.test.js`

## Acceptance criteria

- [ ] The existing `collectSources` tests in `normalize.test.js` pass unchanged.
- [ ] A new test shows the collector output equals `collectSources` for the same input.
- [ ] `pipeline.test.js` passes.
- [ ] `pipeline.js` has no `messages` array.

## Verification

- `npm test -- normalize pipeline`.
- `grep -n "messages.push" backend/src/services/pipeline.js` returns nothing.

## API contract

None. The researcher output (sources) is unchanged.
