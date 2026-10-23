# B11 - Document the orchestrator event contract

- **Side:** backend
- **Size:** S
- **Depends on:** [B09 - Rewire runPipeline around the orchestrator](b09-rewire-run-pipeline-orchestrator.md), [B10 - Key registry snapshots by agent and spawn](b10-registry-snapshots-by-agent-spawn.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- `backend/README.md`:
  - Describe the admin runs.
  - Update the events table.
  - Add the new error codes.
  - State the 15 minute timeout.
  - State the snapshot-per-instance rule.
- `backend/CLAUDE.md` layout: add `services/orchestrator/` and `prompts/orchestrator.js`.

## Acceptance criteria
- [ ] Every new event and field is documented: `spawn`, `orchestrator`, `orchestrator_action`, `agent_failed`, `NO_DRAFT`, `AGENT_TIMEOUT`, and the snapshot shape.
- [ ] A curl example is included.

## Verification

- Compare the README against the events emitted in `test/pipeline.test.js`.
- `npm run lint`.

## API contract

Documentation only. No API change.
