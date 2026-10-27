# B02 - Use each agent's model in AGENTS and runAgentQuery

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B01 - Add per-agent model constants to config](b01-add-per-agent-model-constants-to-config.md), [r03 - Move StreamAbortedError out and delete services/claude.js](r03-move-stream-aborted-error-and-delete-claude-service.md) (D1)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/services/agents/definitions.js`, replace `MODEL` with `AGENT_MODELS.orchestrator`, `AGENT_MODELS.researcher` and `AGENT_MODELS.writer`.
- In `backend/src/services/agents/runAgentQuery.js`, in the `query()` options, use `model: agents[agentName].model ?? MODEL`.
- Files: `backend/src/services/agents/definitions.js`, `backend/src/services/agents/runAgentQuery.js`, `backend/test/prompts.test.js` (the `AGENTS` tests "gives the orchestrator only the two pipeline MCP tools" and "uses the configured model"), `backend/test/runAgentQuery.test.js` ("runAgentQuery options" > "passes hardened options and no canUseTool", which asserts `model: MODEL`).

## Acceptance criteria
- [ ] `AGENTS.writer.model === WRITER_MODEL`, and the same holds for the other agents.
- [ ] The mocked `query()` receives `options.model` equal to the agent's model.
- [ ] A test agent with no `model` falls back to `MODEL`.

## Verification

- Update the tests listed above.
- Add a `runAgentQuery` test with `agents: { writer: { ..., model: 'm-test' } }` that expects `options.model === 'm-test'`.
- `npm test`.

## API contract

None. Internal service interface.
