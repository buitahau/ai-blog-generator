# B01 spike findings

Run with `node scripts/orchestrator-spike.js [q1 q2 ...]` against the gateway in `ANTHROPIC_BASE_URL` (see Setup), model `claude-opus-5-5`, SDK `@anthropic-ai/claude-agent-sdk` 0.3.308. Times are seconds since the scenario started. Raw logs were captured in the session scratchpad; excerpts below.

## Verdict: GO

Chosen orchestrator config: **`agent: 'orchestrator'` with `AgentDefinition.tools` listing the two MCP names** (`systemPrompt` also works and is the fallback). `AgentDefinition.tools: []` hides the MCP tools, see Q3 and the B04 follow-up.

## Answers

1. **Runtime.** `typeof createSdkMcpServer` = `function`, `typeof tool` = `function`.

2. **Orchestrator `init.tools`** (`tools: []`, `allowedTools` = both MCP names, `mcpServers: {pipeline}`, `strictMcpConfig`, `dontAsk`, `DISALLOWED_TOOLS`; no `agent`, `systemPrompt` instead):
   `["mcp__pipeline__spawn_researcher","mcp__pipeline__spawn_writer"]`. Yes, only the two MCP tools.

3. **`agent` with `def.tools` = MCP names vs `tools: []`.**
   - `def.tools` = both MCP names: `init.tools = ["mcp__pipeline__spawn_researcher","mcp__pipeline__spawn_writer"]` (exposes them).
   - `def.tools = []`: `init.tools = []` (exposes nothing).
   - Decision: use `def.tools` with the MCP names. `systemPrompt` is the fallback.

4. **Nested `query()` inside a handler: yes, works.** Handler started at 3.0 s, nested researcher ran 3 turns / $0.26 and finished at 42.7 s (nested `init.tools = ["WebSearch","WebFetch"]`). Parent messages while it ran: only a `tool_progress` at 32.9 s. After the handler returned, the `user` tool_result arrived, then the final assistant text and `result`.

5. **Server `timeout: 2000`, 5 s handler.** At 49.6 s the orchestrator received `tool_result`, `is_error: true`, text `MCP server "pipeline" tool "spawn_researcher" timed out after 2s`. The handler **kept running** and finished at 52.6 s (`handler kept running to completion: true`). So the spawn timeout must be enforced inside the handler.

6. **Abort mid-handler.**
   - Parent `abortController.abort()` at 15.0 s: the pending tool_result became `"The tool call was interrupted before a result was received..."`; the stream threw `Claude Code process aborted by user`.
   - `extra.signal` **fired**, about 2 s after the abort (17.0 s).
   - The nested query stopped with `StreamAbortedError` (17.0 s). Caveat: the spike aborted the run signal and passed that signal to the nested query. It did not test the nested query driven by `extra.signal` alone.
   - Leftover processes: none. `ps -eo args | grep -E 'claude-agent-sdk|blog-run-|spike-'` returned 0 after the abort. A plain `grep claude` only shows the interactive Claude Code sessions on the machine.

7. **Two `spawn_researcher` calls in one turn: not concurrent.** Both `tool_use` blocks arrived at 60.2 s, but handler `b` started only after `a` ended (63.2 s); peak concurrent handlers = 1. Calls are serialized by the SDK or CLI. The `state.busy` lock stays as defence in depth.

8. **Throw vs `isError`.**
   - Handler throws `Error('INTERNAL-DETAIL-4711 boom')`: the model sees `tool_result` `is_error: true` with the **raw message text** (`INTERNAL-DETAIL-4711 boom`) and repeats it. A thrown error leaks internals to the model.
   - Handler returns `{isError: true, content: [...]}`: the model sees exactly the returned text (`{"ok":false,"errorCode":"UPSTREAM_ERROR"}`).
   - Handlers must never throw; always return fixed-text `isError` results.

9. **Orchestrator `user` tool_result shape.** `message.content = [{ type: 'tool_result', tool_use_id, content: [{ type: 'text', text }] }]`, with `is_error: true` only on errors. On the MCP timeout and abort paths, `content` is a plain string instead of an array. Normalizer: by reading `normalize.js`, `handleUser` only emits events for ids in `pending`, which are filled only for `TRACKED_TOOLS` (web tools), so MCP results are dropped. Not exercised against the live stream in this spike.

10. **Researcher and writer `init.tools` with today's options.**
    - researcher: `["WebSearch","WebFetch"]`
    - writer: `[]`
    - orchestrator: the two MCP names (Q2/Q3).

11. **`focus` > 150 chars with `max(150)`: yes, rejected before the handler.** Handler calls = 0. The model sees `MCP error -32602: Input validation error: Invalid arguments for tool spawn_researcher: [ { "origin": "string", "code": "too_big", "maximum": 150, ... "path": ["focus"] } ]`. That includes schema details, which is why B08 uses a loose schema and validates in the handler.

12. **Error `result` and exit code: the stream throws after yielding the `result`.** For `error_max_turns` (maxTurns 1, 12.4 s) and `error_max_budget_usd` (maxBudgetUsd 0.0001, 15.8 s) the `result` message arrived with `is_error: true`, then the iterator threw `Claude Code returned an error result: Reached maximum number of turns (1)` / `Reached maximum budget ($0.0001)`. The text differs from `process exited with code N`, but the behaviour is the one `runAgentQuery` already handles (keeps the result-derived error and cost).

## Setup notes (affect every run)

- `ANTHROPIC_BASE_URL` was added to `backend/.env` and `.env.example`, and `runAgentQuery` now forwards it to the CLI child (its env is an allowlist).
- `http://api.nanostack.si/v1/anthropic` does not work: the http URL 308-redirects to https, and `https://api.nanostack.si/v1/anthropic/v1/messages` returns 405 (every agent call failed with `API Error: 405 Method Not Allowed`). `https://api.nanostack.si/anthropic` works (200), so that is the value used.
- Two early q8/q11 runs were stopped by a safety classifier (`model_refusal_fallback` to a model that does not exist on the gateway) before any tool call, caused by the prompt wording. They were rerun with milder prompts. If this shows up in production runs, the orchestrator task text is the first suspect.

## Second run: Claude Max subscription, no gateway

`SPIKE_AUTH=subscription node scripts/orchestrator-spike.js` (local Claude Code login via `CLAUDE_CONFIG_DIR`, no API key, no `ANTHROPIC_BASE_URL`) gave the same answers for Q1-Q12: same `init.tools` sets, nested query works (27 s), MCP timeout leaves the handler running, `extra.signal` fires on abort, no leftover processes, calls serialized, thrown text leaks, `-32602` rejection with 0 handler calls, stream throws after error results. The 405/classifier-fallback quirks seen on the gateway did not appear. The verdict is unchanged.

## Follow-up edits

- **B03:** use the recorded sets as fixtures: researcher `['WebSearch','WebFetch']`, writer `[]`, orchestrator the two MCP names.
- **B04:** `definitions.js` currently has `orchestrator.tools: []` with the MCP tools granted through `extraAllowedTools`. Per Q3 that exposes **no** tools when `agent` is used, because `runAgentQuery` passes the definition through. Either put the two MCP names in `AGENTS.orchestrator.tools` (they are already filtered out of the `tools` option and kept in `allowedTools`), or switch the orchestrator to `systemPrompt`. Check with a live run before relying on it.
- **B06:** no change; the orchestrator's `tool_result` is dropped by the normalizer as designed (confirm with a live fixture).
- **B08:** (a) never throw from a handler, return fixed-text `isError` results (Q8); (b) enforce the spawn timeout inside the handler, since the MCP timeout leaves the handler running (Q5); (c) keep the loose schema plus in-handler validation (Q11); (d) pass `AbortSignal.any([run, spawn timeout, extra.signal])` to the nested query (Q6); (e) the `busy` lock is defence in depth since calls are serialized (Q7).
