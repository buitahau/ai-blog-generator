# B05 - Add spawn index to normalizer events; add mergeSources

- **Side:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** [B02 - Add orchestrator limits to config](b02-add-orchestrator-limits-config.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `normalize.js`, `createNormalizer(agent, {spawn = 1} = {})`.
  - Adds `spawn` to every emitted event, including the ones from `flush()`.
- Export `mergeSources(lists)`:
  - Dedupes by URL, keeping order.
  - Keeps the first title seen for a URL.
  - Caps the result at `MAX_SOURCES` (20), imported from `config.js`. Remove the local `MAX_SOURCES` in `normalize.js` so the value is defined once.
  - Ignores non-array inputs.

## Acceptance criteria
- [x] Every event type carries `spawn`.
- [x] `spawn` defaults to 1.
- [x] `mergeSources([[a,b],[b,c]])` returns `[a,b,c]`.
- [x] 25 unique sources are capped at 20.

## Verification

- `test/normalize.test.js`: update the snapshots and add `mergeSources` cases.

## API contract

Internal interface. The `spawn` field reaches SSE clients through the pipeline; that contract change is described in the requirement's Event contract changes.
