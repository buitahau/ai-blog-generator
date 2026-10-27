# B03 - Deny MCP resource and ToolSearch tools; assert init tools

- **Side:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** [B01 - Spike: verify in-process MCP tools and a nested query](b01-spike-in-process-mcp-tools-nested-query.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `src/services/agents/runAgentQuery.js`, append `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ReadMcpResourceDirTool` and `ToolSearch` to `DISALLOWED_TOOLS`.
- In the message loop, on `message.type === 'system' && message.subtype === 'init'`:
  - Compare `message.tools` to `expected = new Set([...tools, ...extraAllowedTools])`.
  - `extraAllowedTools` is `[]` for now. B04 adds the parameter.
  - The expected sets for the researcher and the writer are the lists recorded in B01 question 10, not assumed values.
  - Any extra tool: `console.error('Unexpected agent tools:', extras)`, set a local `initError = new AgentError('UPSTREAM_ERROR')` with `initError.initViolation = true`, abort the internal controller, and throw it.
  - The existing catch must test `initError` before it tests `abortController.signal.aborted`. Otherwise the abort turns the error into `StreamAbortedError`, and the run ends with the registry's fallback `INTERNAL_ERROR`.
  - `initViolation` is the flag B08 uses to treat this error as fatal (it is a security signal, not an ordinary sub-agent failure the orchestrator may retry).
  - A missing or non-array `tools` field: skip the check.

## Acceptance criteria
- [x] The `query` call receives the four new names in `disallowedTools`.
- [x] An init tool list of the recorded researcher list plus `Bash` rejects with `UPSTREAM_ERROR`.
- [x] The error is still an `AgentError` (not `StreamAbortedError`) after the internal abort, and has `initViolation === true`.
- [x] The recorded researcher and writer init lists from B01 pass (researcher `['WebSearch','WebFetch']`, writer `[]`, as in the tests).

## Verification

- New cases in `test/runAgentQuery.test.js`, using the existing `queryMock`.

## API contract

None. Internal service behaviour.

## Outstanding review comments

- **Resolved:** B01 question 10 recorded the real init lists (researcher `['WebSearch','WebFetch']`, writer `[]`), matching the test fixtures. The merge gate is cleared.
- **Nit:** in the init-violation test, assert `opts().abortController.signal.reason === err`, and assert `onMessage` is not called for the violating init message.
