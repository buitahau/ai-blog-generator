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
- `patchAgent(state, data)` derives the key from the event.
  - Only `agent_started` creates an instance. Other events for an unknown key are ignored (or buffered, if the existing replay rule requires it). This prevents a phantom `researcher:1` panel.
  - It does not reset an existing instance on `agent_started`, per the replay rule.
  - The final `error` event carries `spawn` (B09). Use it to mark that instance failed; if `spawn` is absent, do not patch any instance.
  - `agent_status {state:'failed'}` updates the instance only. It does not set the step state; step derivation belongs to F02.
- Keep `components/agent/RunMessage.jsx` and `AdminGeneratePage.test.jsx` working in this task: update `RunMessage` minimally to read `instances`/`order` (for example `instances['researcher:1']`), so the UI does not break until F05 replaces it.
- `pending` text deltas and `text_batch` are keyed by the same key.
- `agent_text_snapshot` uses `spawn` to pick its instance.
- Events that lack `spawn` are treated as spawn 1.

## Acceptance criteria
- [ ] Two researcher spawns give two instances, in `order`.
- [ ] Events without `spawn` map to `:1`.
- [ ] A snapshot replaces only its own instance's text.
- [ ] The existing reconnect and dedupe tests still pass.
- [ ] An event for an unknown instance does not create it.
- [ ] A final `error` without `spawn` does not create or patch an instance.
- [ ] `AdminGeneratePage.test.jsx` still passes.

## Verification

- Update `useAgentRun.test.js`.
- `npm test`.

## API contract

Consumes `GET /api/admin/runs/:runId/events` as documented in [B11](b11-document-orchestrator-event-contract.md). Agent-scoped events carry `spawn:number`, and the orchestrator agent is `orchestrator`.
