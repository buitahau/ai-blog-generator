# B04 - Add AGENT_SPECS; build AGENTS and PIPELINE_TOOL_NAMES from it

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [B02 - Use each agent's model in AGENTS and runAgentQuery](b02-use-each-agent-model-in-agents-and-run-agent-query.md), [B03 - Move spawn-tool argument schemas to validation](b03-move-spawn-tool-argument-schemas-to-validation.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/services/agents/definitions.js`, add:
  - `PIPELINE_SERVER = 'pipeline'`
  - `mcpToolName = (tool) => \`mcp__${PIPELINE_SERVER}__${tool}\``
- Add a frozen `AGENT_SPECS`:
  - `orchestrator`: `{ description, prompt: ORCHESTRATOR_SYSTEM, model: AGENT_MODELS.orchestrator, builtinTools: [], usesPipelineTools: true, maxTurns: ORCHESTRATOR_MAX_TURNS }`.
  - `researcher`: `{ description, prompt: RESEARCHER_SYSTEM, model: AGENT_MODELS.researcher, builtinTools: ['WebSearch', 'WebFetch'], maxTurns: RESEARCH_MAX_TURNS, spawn: { tool: 'spawn_researcher', description, inputShape: researcherToolShape, argsSchema: researcherSpawnArgs, timeoutMs: RESEARCH_SPAWN_TIMEOUT_MS } }`.
  - `writer`: `{ description, prompt: WRITER_SYSTEM, model: AGENT_MODELS.writer, builtinTools: [], maxTurns: WRITER_MAX_TURNS, spawn: { tool: 'spawn_writer', description, inputShape: writerToolShape, argsSchema: writerSpawnArgs, timeoutMs: WRITER_SPAWN_TIMEOUT_MS } }`.
  - The spawn tool descriptions are copied from the `spawn_researcher` and `spawn_writer` tool definitions in `tools.js`.
- Build `SPAWNABLE_AGENTS`: the spec names that have a `spawn`, in spec order.
- `PIPELINE_TOOL_NAMES = SPAWNABLE_AGENTS.map((a) => mcpToolName(AGENT_SPECS[a].spawn.tool))`.
- `AGENTS` maps each spec to exactly `{ description, prompt, model, tools: [...builtinTools, ...(usesPipelineTools ? PIPELINE_TOOL_NAMES : [])] }`.
  - The SDK receives `AGENTS` directly from `runAgentQuery.js`, so no other keys are allowed.
- Keep the existing comments. The writer has no tools ([orchestrator-pipeline b01 spike Q3](../orchestrator-pipeline/b01-spike-findings.md)).
- Leave `tools.js` as it is.
- Files: `backend/src/services/agents/definitions.js`, `backend/test/prompts.test.js`.

## Acceptance criteria
- [ ] `AGENTS` deep-equals its current value.
- [ ] `Object.keys(AGENTS.<name>)` sorts to `['description', 'model', 'prompt', 'tools']` for every agent.
- [ ] `PIPELINE_TOOL_NAMES` deep-equals `['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer']`.
- [ ] The specs are frozen.

## Verification

- Add asserts in `prompts.test.js` for the points above.
- `npm test`.

## API contract

None. Internal service interface.
