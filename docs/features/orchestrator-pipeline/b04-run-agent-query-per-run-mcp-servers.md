# B04 - Let runAgentQuery accept per-run MCP servers

- **Side:** backend
- **Size:** S
- **Depends on:** [B03 - Deny MCP resource and ToolSearch tools; assert init tools](b03-deny-mcp-resource-toolsearch-assert-init-tools.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- Add parameters `mcpServers = {}` and `extraAllowedTools = []` to `runAgentQuery`.
- Pass `mcpServers` through to `query()`.
- Set `allowedTools: [...tools, ...extraAllowedTools]`.
- Keep `tools` as the built-in tools only.
- Pass `agents: {[agentName]: agents[agentName]}` so each query sees only its own definition.
- If B01 chose `systemPrompt`, add an optional `systemPrompt` parameter, used instead of `agent` and `agents`.
- `strictMcpConfig` is always `true`.

## Acceptance criteria
- [ ] Researcher and writer calls send `mcpServers: {}` and an unchanged `allowedTools`.
- [ ] The orchestrator call sends the server, and `allowedTools` includes the two MCP names.
- [ ] `strictMcpConfig` is always `true`.

## Verification

- `test/runAgentQuery.test.js` asserts the options passed to `queryMock` in both cases.

## API contract

None. Internal service interface.
