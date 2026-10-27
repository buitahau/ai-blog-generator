# B05 - Build the pipeline MCP server from AGENT_SPECS

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [B04 - Add AGENT_SPECS; build AGENTS and PIPELINE_TOOL_NAMES from it](b04-add-agent-specs-build-agents-and-pipeline-tool-names.md), [r03 - Move StreamAbortedError out and delete services/claude.js](r03-move-stream-aborted-error-and-delete-claude-service.md) (D1, shared imports)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/services/orchestrator/tools.js`:
  - Delete `PIPELINE_TOOL_NAMES`.
  - Delete `SPAWN_CONFIG`.
  - In `handleSpawn`, use `const { spawn } = AGENT_SPECS[agent]`, then:
    - `action = spawn.tool`
    - `schema = spawn.argsSchema`
    - `timeoutMs = spawnTimeouts[agent] ?? spawn.timeoutMs`
  - The `createSdkMcpServer` name is `PIPELINE_SERVER`.
  - The tools are `SPAWNABLE_AGENTS.map((agent) => tool(spec.spawn.tool, spec.spawn.description, spec.spawn.inputShape, (args, extra) => handleSpawn(agent, args, extra)))`.
  - Leave the researcher and writer branches in `handleSpawn` alone.
- Where `mcpServers` is built for the orchestrator (in `backend/src/services/pipeline.js`), the key is `{ [PIPELINE_SERVER]: server }`, not a literal `pipeline`. A mismatched key breaks the `mcp__pipeline__*` tool names silently.
- The imports of `PIPELINE_TOOL_NAMES` in `backend/src/services/pipeline.js`, and in `backend/test/orchestratorTools.test.js`, now come from `./agents/definitions.js`. The value is unchanged.
- Files: `backend/src/services/orchestrator/tools.js`, `backend/src/services/pipeline.js` (imports and the `mcpServers` key), `backend/test/orchestratorTools.test.js`.

## Acceptance criteria
- [ ] `tools.js` has no literal `spawn_researcher` or `spawn_writer`, and no `mcp__` string.
- [ ] The `mcpServers` key is `PIPELINE_SERVER` (`pipeline`), so the `mcp__pipeline__*` names resolve.
- [ ] The `orchestrator_action.action` values are unchanged.
- [ ] The `spawnTimeouts` test override still works.
- [ ] `orchestratorTools.test.js` and `pipeline.test.js` pass.
- [ ] The SSE contract is unchanged.

## Verification

- `npm test`.
- `grep -n "spawn_\|mcp__" backend/src/services/orchestrator/tools.js` shows no matches.

## API contract

None. The SSE contract is unchanged.
