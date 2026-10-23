# Orchestrator-driven pipeline (option B)

## Summary

The hard-coded researcher -> writer sequence in `backend/src/services/pipeline.js` is replaced by one orchestrator agent, a single Agent SDK `query()`. The orchestrator's only tools are two in-process MCP tools: `spawn_researcher {focus?}` and `spawn_writer {}`.

Each tool handler is our code. It runs the sub-agent through the existing hardened `runAgentQuery` (own tools, caps, env allowlist, temp cwd). It keeps notes, sources and the draft in pipeline state outside the model, and returns only a numbers-and-enums digest to the orchestrator.

The orchestrator decides which agent runs next, or that nothing more is needed. Ending its turn means done. There is no `finish` tool. After the orchestrator query resolves, fixed code saves the draft and notifies, but only if the writer produced a draft.

This supersedes Decision 1 and the out-of-scope line "Orchestrator-driven subagent spawning" in [automated-blog-pipeline/00-requirement.md](../automated-blog-pipeline/00-requirement.md). The original rejection gave two reasons: the order was only prompt-enforced, and subagent text did not stream. Neither holds now. Each sub-agent is still its own `query()`, so its text streams. The order is enforced by limits in code.

## Decisions

- **Supersedes the earlier decision.** Decision 1 (two sequential `query()` calls) and the out-of-scope line "Orchestrator-driven subagent spawning" in `automated-blog-pipeline/00-requirement.md` are replaced by this document.
  - Rationale: see the summary. Sub-agents remain separate `query()` calls, so streaming holds, and order is enforced by code-side limits.
- **(a) The orchestrator never sees notes, excerpts, source titles or hosts.**
  - Rationale: this is attacker-controllable web text.
  - The researcher digest is computed by our code from numbers and enums only: `{ agent:'researcher', spawn, ok, errorCode?, notesChars, sourceCount, fetchedOk, searchCount, remaining:{researcher,writer}, budgetRemainingUsd }`.
  - The writer digest is `{ agent, spawn, ok, errorCode?, draftChars, hasH1 }`.
  - The writer handler builds the writer prompt from pipeline state (combined notes and merged sources). `spawn_writer` takes no args.
  - The researcher's self-assessment is excluded. It is model output produced after reading untrusted pages.
- **(b) Only the orchestrator spawns the writer, at most once.**
  - Save and notify remain fixed code. They run after the orchestrator query resolves, and only if `state.draftMd` is non-empty.
  - No draft: final `error` with `NO_DRAFT` (agent `orchestrator`), or with the last sub-agent failure's agent and code if one caused it (for example `writer` / `WRITER_EMPTY`).
  - There is no silent fallback writer.
  - If the writer succeeded but the orchestrator then fails (max turns or budget), the draft is still saved.
  - Skipping research entirely is allowed. The draft is saved with `sources: []`.
- **(c) Limits are constants in `config.js`, not env.** The values are listed in the Limits table below.
  - Per-spawn budget = `min(agentCap, RUN_MAX_BUDGET_USD - ORCHESTRATOR_MAX_BUDGET_USD - spentOnSpawns)`.
  - Below `MIN_SPAWN_BUDGET_USD`, the spawn is refused with `isError` and `BUDGET_EXHAUSTED`.
  - The orchestrator's cost is reserved up front.
  - Rationale: a stray env value cannot raise the budget.
- **(d) Events are attributed per spawn.**
  - The handler closes over the pipeline `send`, the throttle flush, and the state.
  - Each spawn gets a fresh `createNormalizer(agent, {spawn})`. Every agent-scoped event carries `spawn` (1-based per agent; always 1 for the orchestrator).
  - The orchestrator's own MCP `tool_use` and `tool_result` are already dropped by `normalize.js` (`TRACKED_TOOLS`). Its decisions are emitted by the handler from validated args as `orchestrator_action`.
  - Spawns are sequential: the orchestrator is blocked while a sub-agent runs. The handler flushes the throttle before `agent_started` and after `agent_completed`.
  - Throttle and `runRegistry.evictedText` are keyed by `agent:spawn`. Today `runRegistry.evictOldestDelta` keys by `delta.agent`, so two researcher passes would merge into one snapshot. This is a real bug and is fixed here.
  - UI: one panel per instance ("Researcher", "Researcher (pass 2)").
- **(e) Cancellation and errors.**
  - The run signal is passed to the orchestrator `runAgentQuery` and to every nested one.
  - Nested calls use `AbortSignal.any([runSignal, AbortSignal.timeout(spawnTimeout), extra.signal if AbortSignal])`.
  - Run aborted: the handler returns at once, and `runPipeline` rethrows `StreamAbortedError` as today.
  - `AgentError` in a sub-agent (rate limit, budget, max turns, `RESEARCH_EMPTY`, `WRITER_EMPTY`, spawn timeout `AGENT_TIMEOUT`): emit a non-final `agent_failed`, record `state.lastFailure`, return an `isError` digest with a fixed `errorCode`. The orchestrator may retry within the caps, write without research, or stop.
  - A non-`AgentError` throw is a bug: set `state.fatal`, abort the orchestrator through an internal controller, and end with `INTERNAL_ERROR`. The same applies to an init-tool violation (`AgentError` with `initViolation`), which is a security signal and is not retryable by the orchestrator.
  - Check order in a handler after `runSub` throws (the SDK wrapper throws `StreamAbortedError` for any aborted signal, including the spawn timeout): run signal, spawn timeout, `extra.signal`, init violation, `AgentError`, anything else.
  - `AgentError` carries `costUsd` and `numTurns`, so failed spawns still count toward `spentUsd` and the run total.
  - Parallel `tool_use` blocks: the handler lock rejects the second call with `SPAWN_IN_PROGRESS`.
- **(f) Sources.**
  - `collectSources` runs per spawn, on that spawn's raw messages.
  - A new `mergeSources(lists)` dedupes by URL in pass order and caps the result at 20.
  - Writer notes come from successful passes only, joined as `## Research pass N` blocks, and capped at `NOTES_MAX_CHARS`.
- **(g) Model.** Same `MODEL` constant. No second model ID.
  - Rationale: the model ID stays in one config constant (CLAUDE.md).
- **(h) Admin override is out of scope.** `POST /api/admin/runs` stays strict `{title}`.
- **`focus` for `spawn_researcher`.**
  - Optional. Trimmed, at most 150 characters, must match `/^[^\n<>]*$/`.
  - Passed escaped inside `<focus>` in the researcher task.
  - Fail-closed: on `system/init`, if `init.tools` contains anything outside the agent's expected set, the run aborts with `AgentError` `UPSTREAM_ERROR` and the event is logged.

## Functional requirements

- An admin types a title. A background run starts on the server and runs an orchestrator agent.
- The orchestrator has exactly two tools, both in-process MCP tools served as server `pipeline`:
  - `spawn_researcher {focus?}`: runs one researcher pass.
  - `spawn_writer {}`: runs the writer once, using the notes and sources collected in state.
- The orchestrator chooses the order. Its guidance (see B06) is to research first unless the title needs no facts, to research again only if `sourceCount < 3` or the pass failed and `remaining.researcher > 0`, to call `spawn_writer` exactly once, and to end its turn after the writer returns `ok`.
- Skipping research entirely is allowed. The draft is then saved with `sources: []`.
- Ending the orchestrator's turn means the run is done. There is no `finish` tool.
- Each tool call returns only the digest defined in Decision (a). The orchestrator never receives notes, excerpts, source titles, or hosts.
- Each researcher pass collects its own sources. `mergeSources` combines them in pass order, deduplicated by URL and capped at 20.
- The writer prompt is built by the writer handler from pipeline state: combined notes from successful passes, and the merged sources.
- After the orchestrator resolves, fixed code saves the draft (`createDraft`) and notifies, only if a draft exists.
- The event stream shows each agent instance separately (for example "Researcher" and "Researcher (pass 2)").
- Orchestrator decisions are visible in the stream as `orchestrator_action` events, including refused spawns and their reasons.
- `focus` is optional and validated. Invalid focus is refused with `INVALID_INPUT`.

## Non-functional requirements

- **Security**
  - The orchestrator sees digests only (numbers and enums). Web-derived text stays in pipeline state.
  - The orchestrator's tools are limited to the two `pipeline` MCP tools. Built-in tools, MCP resource tools and `ToolSearch` are denied.
  - The init tool list is checked fail-closed on every agent. An unexpected tool aborts the run.
  - Sub-agent environments stay on the existing allowlist (`PATH`, `HOME` = temp dir, `ANTHROPIC_API_KEY`). `strictMcpConfig` is always `true`.
  - Each nested run gets its own fresh empty temp cwd, removed afterwards.
- **Cost**
  - Hard run budget: `RUN_MAX_BUDGET_USD` = 2.75 USD. Previously about 1.5 USD.
  - Client-side budget estimates may overshoot.
- **Time**
  - Run timeout 15 minutes (`RUN_TIMEOUT_MS`).
  - Each spawn has its own deadline. `PIPELINE_MCP_TIMEOUT_MS` is a backstop only.
- **Resources**
  - One run at a time (`MAX_CONCURRENT_RUNS=1`). A run can have up to two CLI subprocesses alive at once (the orchestrator and one nested sub-agent).
- **Responsiveness**
  - Events stay at or under about 4 KB. Snapshots are capped at 4 KB, unchanged.
  - Text deltas are throttled per `agent:spawn`.
- **Reliability**
  - No leftover CLI processes after abort or timeout (checked by the B01 spike).
- **Testing**
  - No network in tests. Real SDK calls happen only in the B01 spike and one manual run.
- **Conventions**
  - No model string outside `config.js`.
  - Prompts live in `backend/src/prompts/`.
  - Request bodies are validated with zod.
  - `/api/generate` is unchanged.

## Architecture

### SDK facts

Verified from `sdk.d.ts` for `@anthropic-ai/claude-agent-sdk@0.3.308`:

- `createSdkMcpServer` (d.ts:633) and `tool` (d.ts:10054) are exported.
- A handler has the signature `(args, extra) => Promise<CallToolResult>`.
- MCP tool names are `mcp__<server>__<tool>`. Characters outside `[a-zA-Z0-9_-]` become `_`. The server `pipeline` gives `mcp__pipeline__spawn_researcher` and `mcp__pipeline__spawn_writer`.
- A per-server `timeout` is a hard wall-clock limit. Values under 1000 ms are ignored. Progress does not extend it. A timeout only ends the call on the CLI side. The handler and any nested researcher keep running, so we need our own deadline.
- `strictMcpConfig` keeps servers passed through `mcpServers`.
- MCP tools may be deferred behind `ToolSearch` unless `alwaysLoad: true`. `alwaysLoad` blocks startup until the server connects (5 s cap).
- `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ReadMcpResourceDirTool` and `ToolSearch` exist. They are not in `DISALLOWED_TOOLS` today.
- `system/init.tools` is the authoritative tool list.

Not yet verified (B01 must answer):

- Whether `tools: []` in the main-thread agent definition removes MCP tools.
- Whether `extra.signal` fires on parent abort.
- Whether a nested `query()` inside a handler works while the parent awaits.

### State kept in code

Pipeline state lives in code, never in the model. Created by `createRunState(title)`:

```
{
  title,
  research: [{ spawn, ok, notes, sources, fetchedOk, searchCount, costUsd, errorCode? }],
  draftMd,
  writerSpawned,
  counts: { researcher, writer },
  spentUsd,
  busy,
  lastFailure,
  fatal,
  orchestratorCostUsd
}
```

- `research` holds notes and sources. They never leave the process except into the writer prompt.
- `busy` is the handler lock.
- `spentUsd` plus `orchestratorCostUsd` drives the budget formula.
- `lastFailure` holds the last sub-agent failure (agent and code), used for the final error.
- `fatal` marks a non-`AgentError` throw.

### Sequence

```
pipeline (fixed code)
  1. emit agent_started {orchestrator, spawn: 1}
  2. runAgentQuery(orchestrator, mcpServers {pipeline}, extraAllowedTools = both MCP names)
       orchestrator model:
         tool_use spawn_researcher {focus?}
           -> handler (our code): zod check -> lock -> checkSpawn
           -> emit orchestrator_action {accepted: true, spawn: 1, focus?}
           -> flush throttle
           -> emit agent_started {researcher, spawn: 1}
           -> runAgentQuery(researcher), nested, own caps
                tool_call / tool_result / deltas -> emitted with spawn: 1
           -> emit agent_completed {researcher, spawn: 1}
           -> recordResearch(state): notes, sources, costUsd stay in state
           -> return researcher digest as tool_result
         tool_use spawn_writer {}
           -> handler: build writer prompt from state (combined notes, merged sources)
           -> emit agent_started {writer, spawn: 1}
           -> runAgentQuery(writer), nested -> events -> state.draftMd
           -> return writer digest as tool_result
         orchestrator ends its turn
  3. emit agent_completed {orchestrator, spawn: 1}
  4. if state.draftMd is non-empty:
       createDraft -> emit blog_saved -> notify -> emit notification -> emit run_completed
     else:
       emit error {NO_DRAFT} or error {state.lastFailure.agent, state.lastFailure.code}
```

## Event contract changes

- `agent` gains the value `"orchestrator"`.
- Every agent-scoped event gains `spawn: number`, 1-based per agent. The orchestrator always uses 1. Affected events: `agent_started`, `agent_text_delta`, `agent_text_snapshot`, `tool_call`, `tool_result`, `agent_heartbeat`, `agent_status`, `agent_completed`.
- New non-final event `orchestrator_action`:
  - `{ action: 'spawn_researcher' | 'spawn_writer', accepted: boolean, spawn?: number, focus?: string, reason?: 'LIMIT_REACHED' | 'BUDGET_EXHAUSTED' | 'SPAWN_IN_PROGRESS' | 'INVALID_INPUT' }`
- New non-final event `agent_failed`:
  - `{ agent, spawn, code, message }`
- New final error codes: `NO_DRAFT` and `AGENT_TIMEOUT`. `agent` may be `"orchestrator"`.
- `INTERNAL_ERROR` is used when `state.fatal` is set.
- `agent_text_snapshot`: one per `agent:spawn` instance. The 4 KB cap is unchanged.
- The orchestrator's own MCP `tool_use` and `tool_result` are not emitted. Decisions appear as `orchestrator_action`.

## Limits

| Constant | Value | Notes |
|----------|-------|-------|
| `ORCHESTRATOR_MAX_TURNS` | 8 | Orchestrator `maxTurns` |
| `ORCHESTRATOR_MAX_BUDGET_USD` | 0.25 | Reserved up front |
| `MAX_RESEARCH_SPAWNS` | 2 | Third research spawn is refused with `LIMIT_REACHED` |
| `MAX_WRITER_SPAWNS` | 1 | Second writer spawn is refused with `LIMIT_REACHED` |
| `RESEARCH_MAX_BUDGET_USD` | 1.00 | Existing; per research pass cap |
| `WRITER_MAX_BUDGET_USD` | 0.50 | Existing; writer cap |
| `RUN_MAX_BUDGET_USD` | 2.75 | Orchestrator 0.25 + 2 x research 1.00 + writer 0.50 |
| `MIN_SPAWN_BUDGET_USD` | 0.05 | Below this, the spawn is refused with `BUDGET_EXHAUSTED` |
| `RESEARCH_SPAWN_TIMEOUT_MS` | 300000 | Per research pass deadline |
| `WRITER_SPAWN_TIMEOUT_MS` | 180000 | Writer deadline |
| `RUN_TIMEOUT_MS` | 900000 | Changed from 600000 (10 min) to 15 min |
| `PIPELINE_MCP_TIMEOUT_MS` | `RUN_TIMEOUT_MS + 60000` | Backstop only |
| `NOTES_MAX_CHARS` | 40000 | Writer notes cap |
| `MAX_SOURCES` | 20 | `mergeSources` cap |
| `RESEARCH_MAX_TURNS` | 12 | Existing; researcher `maxTurns` |
| `WRITER_MAX_TURNS` | 2 | Existing; writer `maxTurns` |
| `focus` length | 150 characters | Trimmed; must match `/^[^\n<>]*$/` |

## Failure semantics

| Situation | Behaviour |
|-----------|-----------|
| Sub-agent `AgentError` (rate limit, budget, max turns, `RESEARCH_EMPTY`, `WRITER_EMPTY`, `UPSTREAM_ERROR`) | Emit `agent_failed`, set `state.lastFailure`, return an `isError` digest with the fixed code. The orchestrator may retry within caps, write without research, or stop. |
| Spawn deadline reached | Maps to `AGENT_TIMEOUT`, handled like any sub-agent failure. |
| Spawn refused (`LIMIT_REACHED`, `BUDGET_EXHAUSTED`, `SPAWN_IN_PROGRESS`, `INVALID_INPUT`) | Emit `orchestrator_action {accepted: false, reason}`. Return an `isError` result with `{ok: false, errorCode}`. Nothing runs. |
| Parallel second spawn call | Rejected with `SPAWN_IN_PROGRESS`. |
| Run aborted (cancel or run timeout) | The handler returns `isError` with `ABORTED` and emits nothing. `runPipeline` rethrows `StreamAbortedError`. No draft is saved if abort came before `createDraft`. |
| Non-`AgentError` throw | Bug. Set `state.fatal`, abort the orchestrator through an internal controller, end with `INTERNAL_ERROR`. |
| Orchestrator ends with no writer and no draft | Final `error` `NO_DRAFT` (agent `orchestrator`), or the last sub-agent failure's agent, code and spawn if one caused it. |
| Orchestrator fails (max turns, budget) with no draft | Emit `agent_failed {orchestrator}`, then final `error` with agent `orchestrator` and its code. This takes precedence over an earlier sub-agent failure. |
| Orchestrator ends with no tool calls | Final `error` `NO_DRAFT`. |
| Writer succeeded, then orchestrator fails (max turns or budget) | The draft is still saved. Save and notify follow. |
| Writer failed | Final `error` with the writer's agent and code (for example `writer` / `WRITER_EMPTY`). |
| Notifier failure | Notification status `failed`. The run still completes. |
| Abort after `createDraft` | The draft remains. Notify is skipped. |

## Task index

| # | Task | Side | Size | Depends on |
|---|------|------|------|------------|
| B01 | [Spike: verify in-process MCP tools and a nested query](b01-spike-in-process-mcp-tools-nested-query.md) | backend | M | - |
| B02 | [Add orchestrator limits to config](b02-add-orchestrator-limits-config.md) | backend | S | B01 |
| B03 | [Deny MCP resource and ToolSearch tools; assert init tools](b03-deny-mcp-resource-toolsearch-assert-init-tools.md) | backend | S | B01 |
| B04 | [Let runAgentQuery accept per-run MCP servers](b04-run-agent-query-per-run-mcp-servers.md) | backend | S | B03 |
| B05 | [Add spawn index to normalizer events; add mergeSources](b05-normalizer-spawn-index-merge-sources.md) | backend | S | B02 |
| B06 | [Orchestrator prompt, focus in research task, orchestrator definition](b06-orchestrator-prompt-focus-definition.md) | backend | S | B01, B02 |
| B07 | [Implement orchestrator run state and digests](b07-orchestrator-run-state-digests.md) | backend | M | B02, B05 |
| B08 | [Implement spawn tools and MCP server](b08-spawn-tools-mcp-server.md) | backend | M | B01, B04, B06, B07 |
| B09 | [Rewire runPipeline around the orchestrator](b09-rewire-run-pipeline-orchestrator.md) | backend | M | B08 |
| B10 | [Key registry snapshots by agent and spawn](b10-registry-snapshots-by-agent-spawn.md) | backend | S | B05 |
| B11 | [Document the orchestrator event contract](b11-document-orchestrator-event-contract.md) | backend | S | B09, B10 |
| F01 | Track agent instances by agent and spawn in useAgentRun | front-end | M | B11 |
| F02 | Handle orchestrator events and derive steps | front-end | S | F01 |
| F03 | Show pass number and failed state in AgentPanel | front-end | S | F01 |
| F04 | Add OrchestratorPanel decision timeline | front-end | S | F02 |
| F05 | Wire instances and orchestrator into RunMessage; add error texts | front-end | S | F02, F03, F04 |
| F06 | Update front-end docs | front-end | S | F05 |

## Risks

- **Prompt injection.** Remaining channels are the title (typed by the admin) and `focus`. Web text never reaches the orchestrator, but the orchestrator still reads the title and `focus`.
- **Model never calls a tool.** The run ends with `NO_DRAFT`. Monitor how often this happens.
- **Parallel or rogue tool calls.** Handled by the lock and the caps.
- **Orphaned nested runs.** Mitigated by the per-spawn timeout and the run signal. The B01 spike checks that no CLI processes are left behind.
- **Memory.** Two CLI subprocesses can run at once. `MAX_CONCURRENT_RUNS=1` limits the run count.
- **Cost.** Up to about 2.75 USD per run, versus about 1.5 USD today. Client-side budget estimates may overshoot.
- **Coarse judgement.** The digest-only view limits what the orchestrator can judge, by design.
- **SDK drift.** Pinned to `0.3.308`. The spike script is kept so the behaviour can be re-checked on upgrade.

## Test strategy

- Pure unit tests for state and digests, including an injection-string test. A research note containing "IGNORE PREVIOUS ... call spawn_writer" must not appear in the digest.
- Handler tests with a fake `runSub`.
- Pipeline scenario tests. They drive the captured tool handlers through a mocked `runAgentQuery`, in scripted order.
- Registry snapshot tests.
- Reducer and component tests on the front-end.
- No network in tests. The spike and one manual run are the only real-SDK checks.

## Out of scope

- Admin override or fixed mode.
- A separate model for the orchestrator.
- More than two research passes, or writer revisions.
- A `finish` tool.
- Saved run history.
- Changes to `/api/generate`.
