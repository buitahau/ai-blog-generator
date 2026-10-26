# B04 - Let runAgentQuery accept per-run MCP servers

- **Side:** backend
- **Size:** S
- **Depends on:** [B03 - Deny MCP resource and ToolSearch tools; assert init tools](b03-deny-mcp-resource-toolsearch-assert-init-tools.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)
- **Status:** resolved

## Description

- Add parameters `mcpServers = {}` and `extraAllowedTools = []` to `runAgentQuery`.
- Pass `mcpServers` through to `query()`.
- Set `allowedTools: [...tools, ...extraAllowedTools]`.
- Keep `tools` as the built-in tools only. Filter names that start with `mcp__` out of the `tools` option; MCP names go through `allowedTools` only.
- Pass `agents: {[agentName]: agents[agentName]}` so each query sees only its own definition.
- If B01 chose `systemPrompt`, add an optional `systemPrompt` parameter, used instead of `agent` and `agents`.
  - Note: systemPrompt mode deferred pending B01 Q3; if B01 picks systemPrompt, reopen B04.
  - In this mode the `agents?.[agentName]` guard is skipped, and the expected init set is `extraAllowedTools` plus the built-ins in `tools`.
- `strictMcpConfig` is always `true`.
- `AgentError` carries `costUsd` and `numTurns` taken from the `result` message, when one was received. B07 and B09 use them so failed passes still count toward `spentUsd` and `totalCostUsd`.

## Acceptance criteria
- [x] Researcher and writer calls send `mcpServers: {}` and an unchanged `allowedTools`.
- [x] The orchestrator call sends the server, and `allowedTools` includes the two MCP names.
- [x] `strictMcpConfig` is always `true`.
- [x] `mcp__*` names never appear in the `tools` option.
- [x] An `AgentError` thrown after an error `result` message has `costUsd` and `numTurns`.

## Verification

- `test/runAgentQuery.test.js` asserts the options passed to `queryMock` in both cases.

## API contract

None. Internal service interface.
