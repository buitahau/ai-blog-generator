# B02 - Add orchestrator limits to config

- **Status:** resolved
- **Side:** backend
- **Size:** S
- **Depends on:** [B01 - Spike: verify in-process MCP tools and a nested query](b01-spike-in-process-mcp-tools-nested-query.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `src/config.js`, add the constants from the Limits table in [00-requirement.md](00-requirement.md) under the comment `// Orchestrator (option B)`.
  - Constants only. No env overrides.
- `RUN_TIMEOUT_MS = 15*60_000` (changed from 10 minutes).
- `PIPELINE_MCP_TIMEOUT_MS = RUN_TIMEOUT_MS + 60000`.

## Acceptance criteria
- [x] Values match the Limits table in the requirement.
- [x] `PIPELINE_MCP_TIMEOUT_MS > RUN_TIMEOUT_MS`.
- [x] Importing `config.js` without an API key still works.

## Verification

- Extend `test/config.test.js` to assert the values, and that `RESEARCH_MAX_BUDGET_USD * MAX_RESEARCH_SPAWNS + WRITER_MAX_BUDGET_USD + ORCHESTRATOR_MAX_BUDGET_USD <= RUN_MAX_BUDGET_USD`.
- `npm test`.

## API contract

None. Internal config constants.
