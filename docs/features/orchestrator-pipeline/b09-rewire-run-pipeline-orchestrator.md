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
- After the orchestrator query ends, decide in this order:
  1. `state.fatal` set: final `error` `INTERNAL_ERROR`. Check this before the `StreamAbortedError` branch, because aborting the internal controller makes the orchestrator's `runAgentQuery` throw `StreamAbortedError`, which would otherwise be rethrown as an abort.
  2. Run signal aborted: rethrow `StreamAbortedError` as today.
  3. `draftMd` non-empty (including when the orchestrator threw `AgentError` after the writer succeeded): continue the existing save, notify and `run_completed` path unchanged.
  4. No draft, in this precedence:
     - The orchestrator's own `AgentError`: final `error` with agent `orchestrator` and its code.
     - `state.lastFailure`: final `error` with that agent, code and `spawn`.
     - Otherwise `NO_DRAFT` (agent `orchestrator`).
- When the orchestrator itself fails, emit `agent_failed {orchestrator, spawn: 1}` before the final `error`, so the front-end closes the `plan` step. On a normal end, emit `agent_completed {orchestrator, spawn: 1}`.
- The final `error` event carries `spawn` when it comes from `lastFailure`.
- `totalCostUsd` = orchestrator cost + spawn costs, including the cost of failed spawns (from `AgentError.costUsd`).
- Fixed `MESSAGES` for the final error texts live here, alongside B08's, so the front-end shows the backend message.

## Acceptance criteria
- [ ] Happy path order: orchestrator started, action, researcher 1, action, writer 1, orchestrator completed, `blog_saved`, `notification`, `run_completed`.
- [ ] Research twice, then the writer merges sources.
- [ ] Writer only: the draft is saved with `sources: []`.
- [ ] Orchestrator ends with no calls: final `error` `NO_DRAFT`.
- [ ] Writer fails: final `error` `{agent: 'writer', code}`.
- [ ] Orchestrator `AGENT_MAX_TURNS` after the writer succeeded: draft saved.
- [ ] Abort during the nested researcher: `StreamAbortedError` is rethrown, no draft saved.
- [ ] Fatal path: a non-`AgentError` throw in a handler ends with `INTERNAL_ERROR`, not an abort.
- [ ] Orchestrator `AgentError` with no draft and an earlier researcher failure: the final `error` names the orchestrator, not the researcher, and `agent_failed {orchestrator}` is emitted first.
- [ ] A failed spawn's cost is included in `totalCostUsd`.
- [ ] The existing abort-after-save behaviour is kept.

## Verification

- Rewrite `test/pipeline.test.js`. Mock `runAgentQuery`. For the orchestrator, invoke the captured tool handlers in scripted order, with `createSdkMcpServer` mocked.
- `npm test`.
- Manual real run with the curl commands from the README.

## API contract

Emits the run events defined in the requirement's Event contract changes.
