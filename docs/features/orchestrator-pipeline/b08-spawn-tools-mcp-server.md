# B08 - Implement spawn tools and MCP server

- **Status:** resolved
- **Side:** backend
- **Size:** M
- **Depends on:** [B01 - Spike: verify in-process MCP tools and a nested query](b01-spike-in-process-mcp-tools-nested-query.md), [B04 - Let runAgentQuery accept per-run MCP servers](b04-run-agent-query-per-run-mcp-servers.md), [B06 - Orchestrator prompt, focus in research task, orchestrator definition](b06-orchestrator-prompt-focus-definition.md), [B07 - Implement orchestrator run state and digests](b07-orchestrator-run-state-digests.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- New `src/services/orchestrator/tools.js` exports `createPipelineServer({state, signal, send, flush, runSub, onFatal})`.
  - `runSub` is injected. In B09 it is a wrapper over `runAgentQuery` plus the normalizer, so tests need no SDK.
  - `onFatal()` aborts the orchestrator through B09's internal controller.
- Tools:
  - `spawn_researcher {focus?}`
  - `spawn_writer {}`
  - The MCP-level schema is loose: `{focus: z.string().optional()}` and `{}`. The MCP layer validates arguments against it before the handler runs (B01 question 11), so a strict schema there would hide `INVALID_INPUT` and the `orchestrator_action` event.
  - All validation happens in the handler: reject non-string `focus`, extra keys (`z.strictObject`), and `focus` that fails the rules (trimmed, at most 150 characters, `/^[^\r\n<>\p{Cc}]*$/u`). Refuse with `INVALID_INPUT`.
  - For `INVALID_INPUT`, do not echo `focus` in `orchestrator_action`.
  - Direct handler tests skip the MCP layer, so they do not prove the real validation path; B09's manual run does.
- Handler steps, for each spawn tool:
  1. Validate args, then `checkSpawn`. On refusal, emit `orchestrator_action {accepted: false, reason}` and return `{isError: true, content: [{type: 'text', text: JSON.stringify({ok: false, errorCode: reason})}]}`.
  2. Set `busy`, bump the count, and emit `orchestrator_action {accepted: true, spawn, focus?}`. The `busy` check (in `checkSpawn`) and the `busy` set run with no `await` in between.
  3. Call `flush()`, then call `runSub` with `AbortSignal.any([signal, spawnTimeoutSignal, extra.signal])`. Keep `spawnTimeoutSignal = AbortSignal.timeout(spawnTimeout)` in its own variable. `extra.signal` is included only if B01 confirms it fires.
  4. On success, record the result and return the digest.
- Failure handling after `runSub` throws. Check in this order, because `runAgentQuery` throws `StreamAbortedError` for any aborted signal, including the timeout:
  1. `signal.aborted` (run signal): return `isError` with `ABORTED`. Emit nothing.
  2. `spawnTimeoutSignal.aborted`: code `AGENT_TIMEOUT`, handled as a sub-agent failure (step 5 below).
  3. `extra.signal.aborted`: use the code B01 decides.
  4. `err.initViolation` (B03): fatal, like step 6.
  5. `AgentError` or an empty result (`RESEARCH_EMPTY`, `WRITER_EMPTY`): emit `agent_failed`, call `recordFailure`, add `err.costUsd` to `spentUsd`, and return an `isError` digest. For an empty result the order is `agent_completed`, then `agent_failed`.
  6. Anything else: set `state.fatal = err` and call `onFatal()`.
- Always clear `busy` in `finally`.
- `agent_failed.message` and the digest `errorCode` come from a fixed `MESSAGES` map in the backend (including `AGENT_TIMEOUT`). The front-end only decides retryability.
- Server: `createSdkMcpServer({name: 'pipeline', tools, alwaysLoad: true, timeout: PIPELINE_MCP_TIMEOUT_MS})`.
- Export `PIPELINE_TOOL_NAMES = ['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer']`.

## Acceptance criteria
- [x] Direct handler calls with a fake `runSub` cover: success, `AgentError`, timeout (fake `runSub` throws `StreamAbortedError` after the timeout signal fires, expect `AGENT_TIMEOUT` and not fatal), run abort, a concurrent second call (`SPAWN_IN_PROGRESS`), invalid `focus` with a newline or control character (`INVALID_INPUT`, no `focus` echoed), limit reached, `initViolation` (fatal and `onFatal` called), and a non-`AgentError` throw (fatal).
- [x] A failed spawn's `costUsd` is added to `spentUsd`.
- [x] `runSub` receives notes and sources from state for the writer, and never anything from the orchestrator's args.

## Verification

- New `test/orchestratorTools.test.js`. Mock `createSdkMcpServer` to capture the tool definitions and call their handlers.

## API contract

Emits `orchestrator_action` and `agent_failed`. See the requirement's Event contract changes.
