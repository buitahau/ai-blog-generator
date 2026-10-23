# B01 - Spike: verify in-process MCP tools and a nested query

- **Side:** backend
- **Size:** M
- **Depends on:** none
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- Throwaway script `backend/scripts/orchestrator-spike.js`, following the pattern of `scripts/agent-smoke.js`.
  - Needs a real `ANTHROPIC_API_KEY`. Run manually. Not part of `npm test`.
- Build an in-process MCP server `pipeline` with:
  - `tool('spawn_researcher', ..., {focus: z.string().max(150).optional()}, handler)` (the spike keeps `max(150)` on purpose, to answer question 11; the production schema is loose, see B08)
  - `tool('spawn_writer', ..., {}, handler)` (empty shape)
  - `alwaysLoad: true`
- The `spawn_researcher` handler runs a real nested `runAgentQuery('researcher')` with `maxTurns: 3`.
- Record the findings in `docs/features/orchestrator-pipeline/b01-spike-findings.md`. Answer questions 1-11 with evidence (log excerpt) for each:
  1. Runtime: `typeof createSdkMcpServer` and `typeof tool`.
  2. Exact `init.tools` for the orchestrator with `tools: []`, `allowedTools: [both MCP names]`, `mcpServers: {pipeline}`, `strictMcpConfig: true`, `permissionMode: 'dontAsk'`, and `DISALLOWED_TOOLS` plus the four new names. Confirm only the two MCP tools appear.
  3. Run with `agent: 'orchestrator'` once with `AgentDefinition.tools` holding the two MCP names, and once with `tools: []`. Which one exposes the tools?
     - If neither is clean, decide: drop `agent` for the orchestrator and pass `systemPrompt: ORCHESTRATOR_SYSTEM` instead.
  4. A nested `query()` inside the handler works while the parent awaits. Record which parent messages arrive.
  5. Server `timeout: 2000` with a 5 s handler: what the orchestrator receives, and whether the handler keeps running (expected: yes).
  6. Abort the parent `abortController` mid-handler:
     - Does `extra.signal` fire?
     - Does the nested query stop when given the run signal?
     - Are any CLI processes left (`ps -ef | grep claude`)?
  7. Prompt the model to call `spawn_researcher` twice in one turn: are the handlers concurrent?
  8. A handler that throws vs. one that returns `isError: true`: what does the model see?
  9. The shape of the orchestrator's user `tool_result` message. Confirm the normalizer drops it.
  10. Exact `init.tools` for the researcher and the writer with today's options (`tools`, `allowedTools`, `disallowedTools`, `strictMcpConfig`). B03 uses these recorded lists as its expected sets and test fixtures. Do not assume `['WebSearch','WebFetch']` and `[]`.
  11. Call `spawn_researcher` with a `focus` longer than 150 characters while the schema says `max(150)`: does the MCP layer reject it before the handler runs? What does the model see? (Expected: yes, rejected, no handler call. This is why B08 uses a loose schema and validates in the handler.)

## Acceptance criteria
- [ ] `b01-spike-findings.md` answers questions 1-11 with yes/no and evidence for each.
- [ ] The findings name the chosen orchestrator config: `agent` with `def.tools`, or `systemPrompt`.
- [ ] The findings end with a go/no-go verdict and a list of follow-up edits to B03, B04, B06 and B08. No-go cases, with the action for each:
  - nested `query()` deadlocks or fails inside a handler: stop and revisit the design.
  - `extra.signal` never fires: B08 relies on the run signal and the spawn timeout only.
  - CLI processes are left after abort: add explicit cleanup before B08 starts.
  - Neither orchestrator config exposes only the two MCP tools: stop.
- [ ] B02, B03, B04, B06 and B08 are not started until the verdict is recorded.
- [ ] The script is excluded from `npm test` and needs `ANTHROPIC_API_KEY`.

## Verification

- `node scripts/orchestrator-spike.js` exits 0 and prints `init.tools` and the event timeline.
- The `ps` check after the abort case shows no leftover CLI processes.

## API contract

None. Throwaway spike script; no API change.
