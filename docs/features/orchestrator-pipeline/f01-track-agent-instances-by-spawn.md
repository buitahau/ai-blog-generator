# F01 - Track agent instances by agent and spawn in useAgentRun

- **Side:** front-end
- **Size:** M
- **Depends on:** [B11](b11-document-orchestrator-event-contract.md) (SSE contract)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`hooks/useAgentRun.js`:

- Replace `agents: {researcher, writer}` with:
  - `instances: {[key]: agentState}`.
  - `order: [key]`.
- `key` is `${agent}:${spawn ?? 1}`, so `researcher:1`, `researcher:2`, `writer:1`, `orchestrator:1`.
- `patchAgent(state, data)` derives the key from the event, and creates the instance if it is missing.
  - It does not reset an existing instance on `agent_started`, per the replay rule.
- `pending` text deltas and `text_batch` are keyed by the same key.
- `agent_text_snapshot` uses `spawn` to pick its instance.
- Events that lack `spawn` are treated as spawn 1.

## Acceptance criteria
- [ ] Two researcher spawns give two instances, in `order`.
- [ ] Events without `spawn` map to `:1`.
- [ ] A snapshot replaces only its own instance's text.
- [ ] The existing reconnect and dedupe tests still pass.

## Verification

- Update `useAgentRun.test.js`.
- `npm test`.

## API contract

Consumes `GET /api/admin/runs/:runId/events` as documented in [B11](b11-document-orchestrator-event-contract.md). Agent-scoped events carry `spawn:number`, and the orchestrator agent is `orchestrator`.
