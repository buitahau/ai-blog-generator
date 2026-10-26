# B11 - Document the orchestrator event contract

- **Side:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** [B09 - Rewire runPipeline around the orchestrator](b09-rewire-run-pipeline-orchestrator.md), [B10 - Key registry snapshots by agent and spawn](b10-registry-snapshots-by-agent-spawn.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- `backend/README.md`:
  - Update the existing admin runs section for the orchestrator flow.
  - Update the events table.
  - Add the new error codes.
  - State the 15 minute timeout.
  - State the snapshot-per-instance rule.
  - State the event order for an empty result: `agent_completed`, then `agent_failed`.
  - State that the final `error` event may carry `spawn`, and that `agent_failed` also closes the orchestrator instance when it fails.
- `backend/CLAUDE.md`: add `services/orchestrator/` and `prompts/orchestrator.js` to the layout, and update the `config.js` constants line.

## Acceptance criteria
- [x] Every new event and field is documented: `spawn`, `orchestrator`, `orchestrator_action`, `agent_failed`, `NO_DRAFT`, `AGENT_TIMEOUT`, and the snapshot shape.
- [x] A curl example is included.

## Verification

- Compare the README against the events emitted in `test/pipeline.test.js`.
- `npm run lint`.

## API contract

Documentation only. No API change.
