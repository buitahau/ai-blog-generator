# B08 - Implement spawn tools and MCP server

- **Side:** backend
- **Size:** M
- **Depends on:** [B04 - Let runAgentQuery accept per-run MCP servers](b04-run-agent-query-per-run-mcp-servers.md), [B06 - Orchestrator prompt, focus in research task, orchestrator definition](b06-orchestrator-prompt-focus-definition.md), [B07 - Implement orchestrator run state and digests](b07-orchestrator-run-state-digests.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- New `src/services/orchestrator/tools.js` exports `createPipelineServer({state, signal, send, flush, runSub})`.
  - `runSub` is injected. In B09 it is a wrapper over `runAgentQuery` plus the normalizer, so tests need no SDK.
- Tools:
  - `spawn_researcher {focus?}`
  - `spawn_writer {}`
  - Handlers re-parse their args with `z.strictObject`.
- Handler steps, for each spawn tool:
  1. `checkSpawn`. On refusal, emit `orchestrator_action {accepted: false, reason}` and return `{isError: true, content: [{type: 'text', text: JSON.stringify({ok: false, errorCode: reason})}]}`.
  2. Set `busy`, bump the count, and emit `orchestrator_action {accepted: true, spawn, focus?}`.
  3. Call `flush()`, then call `runSub` with `AbortSignal.any([signal, AbortSignal.timeout(spawnTimeout)])`, adding `extra.signal` as decided in B01.
  4. On success, record the result and return the digest.
- `AgentError` or an empty result: emit `agent_failed`, record `lastFailure`, and return an `isError` digest.
  - A spawn timeout maps to `AGENT_TIMEOUT`.
- Run signal aborted: return `isError` with `ABORTED`. Emit nothing.
- Any other throw: set `state.fatal = err` and call `onFatal()`, which aborts the orchestrator.
- Always clear `busy` in `finally`.
- Server: `createSdkMcpServer({name: 'pipeline', tools, alwaysLoad: true, timeout: PIPELINE_MCP_TIMEOUT_MS})`.
- Export `PIPELINE_TOOL_NAMES = ['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer']`.

## Acceptance criteria
- [ ] Direct handler calls with a fake `runSub` cover: success, `AgentError`, timeout, abort, a concurrent second call (`SPAWN_IN_PROGRESS`), invalid `focus` with a newline (`INVALID_INPUT`), and limit reached.
- [ ] `runSub` receives notes and sources from state for the writer, and never anything from the orchestrator's args.

## Verification

- New `test/orchestratorTools.test.js`. Mock `createSdkMcpServer` to capture the tool definitions and call their handlers.

## API contract

Emits `orchestrator_action` and `agent_failed`. See the requirement's Event contract changes.
