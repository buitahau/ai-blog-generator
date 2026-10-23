# B09 - Rewire runPipeline around the orchestrator

- **Side:** backend
- **Size:** M
- **Depends on:** [B08 - Implement spawn tools and MCP server](b08-spawn-tools-mcp-server.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `pipeline.js`:
  - Key the throttle by `agent:spawn`, and flush when the key changes.
  - `runSub(agent, spawn, prompt, limits, signal)` reuses the current `runAgent` body with `createNormalizer(agent, {spawn})`. `agent_started` and `agent_completed` carry `spawn`.
  - Run the orchestrator:
    - Emit `agent_started {orchestrator, spawn: 1}`.
    - Call `runAgentQuery` with `mcpServers: {pipeline}` and `extraAllowedTools: PIPELINE_TOOL_NAMES`, using the `ORCHESTRATOR_*` limits.
    - Wrap it in an internal controller that is also aborted by the run signal.
- After the orchestrator resolves, or throws `AgentError` while `draftMd` exists, continue the existing save, notify and `run_completed` path unchanged.
- No draft: fail with `state.lastFailure` (agent and code). If there is none, fail with `NO_DRAFT` (agent `orchestrator`).
- `state.fatal`: `INTERNAL_ERROR`.
- `totalCostUsd` = orchestrator cost + spawn costs.

## Acceptance criteria
- [ ] Happy path order: orchestrator started, action, researcher 1, action, writer 1, orchestrator completed, `blog_saved`, `notification`, `run_completed`.
- [ ] Research twice, then the writer merges sources.
- [ ] Writer only: the draft is saved with `sources: []`.
- [ ] Orchestrator ends with no calls: final `error` `NO_DRAFT`.
- [ ] Writer fails: final `error` `{agent: 'writer', code}`.
- [ ] Orchestrator `AGENT_MAX_TURNS` after the writer succeeded: draft saved.
- [ ] Abort during the nested researcher: `StreamAbortedError` is rethrown, no draft saved.
- [ ] The existing abort-after-save behaviour is kept.

## Verification

- Rewrite `test/pipeline.test.js`. Mock `runAgentQuery`. For the orchestrator, invoke the captured tool handlers in scripted order, with `createSdkMcpServer` mocked.
- `npm test`.
- Manual real run with the curl commands from the README.

## API contract

Emits the run events defined in the requirement's Event contract changes.
