# F05 - Wire instances and orchestrator into RunMessage and add error texts

- **Side:** front-end
- **Size:** S
- **Depends on:** [F02 - Handle orchestrator events and derive steps](f02-handle-orchestrator-events-derive-steps.md), [F03 - Show pass number and failed state in AgentPanel](f03-show-pass-number-and-failed-state-agentpanel.md), [F04 - Add OrchestratorPanel decision timeline](f04-orchestrator-decision-timeline-panel.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`components/agent/RunMessage.jsx`:

- Renders `OrchestratorPanel`, then `order.filter(k => !k.startsWith('orchestrator')).map(AgentPanel)`.
- `STEP_ITEMS` has `plan` first.
- `AGENT_LABEL` adds `orchestrator`.

`constants/errors.js`:

- Adds messages for the new codes:
  - `NO_DRAFT`: "The orchestrator finished without a draft."
  - `AGENT_TIMEOUT`: message TBD.
- Neither code is retryable.

## Acceptance criteria
- [ ] `AdminGeneratePage.test.jsx` covers a two-pass run: two researcher panels and a timeline.
- [ ] `AdminGeneratePage.test.jsx` covers a `NO_DRAFT` run: an error Alert is shown and there is no "Open draft".

## Verification

- `npm test`.
- Manual run in `npm run dev` against the backend.

## API contract

Consumes the [B11](b11-document-orchestrator-event-contract.md) events and error codes. `NO_DRAFT` and `AGENT_TIMEOUT` are final error codes; `error.agent` may be `orchestrator`.
