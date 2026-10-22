# B06 - Add Agent SDK runner with hardened options

- **Side:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** none
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- Add `@anthropic-ai/claude-agent-sdk`, pinned to an exact version.
- Read the `claude-api` skill and the Agent SDK TypeScript reference first.
- `src/services/agents/runAgentQuery.js` exports `runAgentQuery({agentName, agents, prompt, signal, limits, onMessage})`, which wraps `query()`:
  - `agent: agentName`, `agents`, `model: MODEL`.
  - `tools` and `allowedTools` = the agent's tools.
  - `disallowedTools` = file and shell tools.
  - `permissionMode: 'dontAsk'`. No `canUseTool`: it would never run, because pre-approved tools skip it and dontAsk denies everything else.
  - `settingSources: []`, `strictMcpConfig: true`, `mcpServers: {}`, `persistSession: false`.
  - `cwd` = `fs.mkdtemp(os.tmpdir()/blog-run-)`, removed in `finally`.
  - `env` = `{PATH, HOME: <tmp>, ANTHROPIC_API_KEY}`.
  - `maxTurns` and `maxBudgetUsd` from `limits`.
  - `includePartialMessages: true`.
  - `abortController` linked to `signal`.
  - stderr goes to `console.error`, never env.
  - Iterates messages and forwards each one to `onMessage`.
  - Resolves with the result message: `{resultText, subtype, numTurns, totalCostUsd, usage, stopReason}`.
- If `subtype === 'success'` and `is_error === true`, or on any error subtype, map by `api_error_status` first: 429 -> RATE_LIMITED, 529 -> OVERLOADED, anything else -> UPSTREAM_ERROR. If missing, use the last assistant message's `error` category: rate_limit -> RATE_LIMITED, overloaded -> OVERLOADED, otherwise UPSTREAM_ERROR. Log the `result`/`errors[]` text server-side only; never return it as resultText.
- Map result subtypes to `AgentError(code)`:
  - `error_max_turns` -> `AGENT_MAX_TURNS`
  - `error_max_budget_usd` -> `AGENT_BUDGET_EXCEEDED`
  - `error_during_execution` -> `UPSTREAM_ERROR`
  - Refusal stop -> `UPSTREAM_ERROR`
  - Abort -> `StreamAbortedError`, carrying `signal.reason` so callers can tell a cancel from a timeout.
- Add `RESEARCH_MAX_TURNS`, `RESEARCH_MAX_BUDGET_USD`, `WRITER_MAX_TURNS`, `WRITER_MAX_BUDGET_USD`, and `RUN_TIMEOUT_MS` to `config.js`.
- `scripts/agent-smoke.js --record <name>` writes the raw message stream to `test/fixtures/agent/<name>.jsonl`, after scrubbing: drop session_id/uuid, replace absolute temp paths with <tmp>, and assert no `sk-ant-` or ANTHROPIC_API_KEY value is present. Record at least researcher-search-fetch, researcher-tool-error, writer-text and api-error-success-is_error. Only scrubbed fixtures are committed.

## Acceptance criteria
- [x] No model string outside `config.js`.
- [x] `/api/generate` and its tests are unchanged and passing.
- [x] Subprocess env never contains `DATABASE_URL`, `ADMIN_TOKEN`, or `TELEGRAM_*`.
- [x] Temp dir is removed on success, error, and abort.
- [x] Raw SDK errors are logged only. Callers get `{code, message}`.
- [x] A success result with `is_error: true` throws `AgentError`, never resolves with its text.
- [x] The options passed to `query()` contain no `canUseTool`.

## Verification

- Unit tests with `vi.mock('@anthropic-ai/claude-agent-sdk')` returning fixture generators. They assert options (tools, permission mode, settingSources, env keys, model), result subtype mapping, abort, and temp-dir cleanup.
- Fixture tests: a success with `is_error` and 429 maps to RATE_LIMITED, and its `result` text appears neither in the return value nor in the error message.
- Manual smoke on the target host: `node scripts/agent-smoke.js "test"` runs the researcher once and prints the subtype and cost.

## API contract

None. Internal service interface.
