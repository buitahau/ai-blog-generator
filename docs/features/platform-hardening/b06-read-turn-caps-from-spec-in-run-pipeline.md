# B06 - Read turn caps from the spec in runPipeline

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B04 - Add AGENT_SPECS; build AGENTS and PIPELINE_TOOL_NAMES from it](b04-add-agent-specs-build-agents-and-pipeline-tool-names.md), [B08 - Send services logging through the logger](b08-send-services-logging-through-logger.md), [B10 - Lower noisy non-fatal logs to warn](b10-lower-noisy-non-fatal-logs-to-warn.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/services/pipeline.js`:
  - The `limits` object passed for a sub-agent call (`{ maxTurns, maxBudgetUsd }`) becomes `limits: { maxTurns: AGENT_SPECS[agent].maxTurns, maxBudgetUsd }`.
  - The orchestrator's `maxTurns` (in the orchestrator `runAgentQuery` call) becomes `AGENT_SPECS.orchestrator.maxTurns`.
- Remove the turn-cap imports from `config.js` that are now unused. `ORCHESTRATOR_MAX_BUDGET_USD` stays.

## Acceptance criteria
- [ ] With the mocked `runAgentQuery`, `maxTurns` is 12, 2 and 8 for researcher, writer and orchestrator.
- [ ] Lint passes with no unused imports.

## Verification

- `npm test` (`pipeline.test.js`).
- `npm run lint`.

## API contract

None. Internal service change.
