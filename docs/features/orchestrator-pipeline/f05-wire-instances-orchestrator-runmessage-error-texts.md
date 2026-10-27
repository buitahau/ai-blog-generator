# F05 - Wire instances and orchestrator into RunMessage and add error texts

- **Side:** front-end
- **Size:** S
- **Status:** resolved
- **Depends on:** [F02 - Handle orchestrator events and derive steps](f02-handle-orchestrator-events-derive-steps.md), [F03 - Show pass number and failed state in AgentPanel](f03-show-pass-number-and-failed-state-agentpanel.md), [F04 - Add OrchestratorPanel decision timeline](f04-orchestrator-decision-timeline-panel.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`components/agent/RunMessage.jsx`:

- Renders `OrchestratorPanel`, then `order.filter(k => !k.startsWith('orchestrator')).map(AgentPanel)`, passing `name`, `spawn` and `instance` (F03).
- `STEP_ITEMS` has `plan` first.
- `AGENT_LABEL` adds `orchestrator`.

`constants/errors.js`:

- Adds `NO_DRAFT` and `AGENT_TIMEOUT` to the retryable code set, like `RUN_TIMEOUT`, `RESEARCH_EMPTY` and `WRITER_EMPTY`. A new run may succeed because the orchestrator's choices vary.
- The alert shows the backend's `error.message` (fixed `MESSAGES` in B08/B09). The front-end holds no message strings for these codes; `constants/errors.js` only holds code sets.

## Acceptance criteria
- [x] `AdminGeneratePage.test.jsx` covers a two-pass run: two researcher panels and a timeline.
- [x] `AdminGeneratePage.test.jsx` covers a `NO_DRAFT` run: an error Alert is shown and there is no "Open draft".

## Verification

- `npm test`.
- Manual run in `npm run dev` against the backend.

## API contract

Consumes the [B11](b11-document-orchestrator-event-contract.md) events and error codes. `NO_DRAFT` and `AGENT_TIMEOUT` are final error codes; `error.agent` may be `orchestrator`.
