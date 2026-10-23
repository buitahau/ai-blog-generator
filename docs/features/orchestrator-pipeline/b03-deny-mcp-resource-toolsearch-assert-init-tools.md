# B03 - Deny MCP resource and ToolSearch tools; assert init tools

- **Side:** backend
- **Size:** S
- **Depends on:** [B01 - Spike: verify in-process MCP tools and a nested query](b01-spike-in-process-mcp-tools-nested-query.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `src/services/agents/runAgentQuery.js`, append `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ReadMcpResourceDirTool` and `ToolSearch` to `DISALLOWED_TOOLS`.
- In the message loop, on `message.type === 'system' && message.subtype === 'init'`:
  - Compare `message.tools` to `expected = new Set([...tools, ...extraAllowedTools])`.
  - `extraAllowedTools` is `[]` for now. B04 adds the parameter.
  - Any extra tool: `console.error('Unexpected agent tools:', extras)`, abort the internal controller, and throw `AgentError('UPSTREAM_ERROR')`.
  - A missing or non-array `tools` field: skip the check.

## Acceptance criteria
- [ ] The `query` call receives the four new names in `disallowedTools`.
- [ ] An init tool list of `['WebSearch','WebFetch','Bash']` for the researcher rejects with `UPSTREAM_ERROR`.
- [ ] The exact declared tools pass.
- [ ] A writer init list of `[]` passes.

## Verification

- New cases in `test/runAgentQuery.test.js`, using the existing `queryMock`.

## API contract

None. Internal service behaviour.
