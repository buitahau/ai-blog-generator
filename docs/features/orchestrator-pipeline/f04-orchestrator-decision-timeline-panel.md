# F04 - Add OrchestratorPanel decision timeline

- **Side:** front-end
- **Size:** S
- **Depends on:** [F02 - Handle orchestrator events and derive steps](f02-handle-orchestrator-events-derive-steps.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

New `components/agent/OrchestratorPanel.jsx`:

- antd `Card` + `Timeline`, one item per decision.
- Accepted items:
  - `Research (pass N)`, with the optional `focus` shown as `<Text type="secondary">`.
  - `Write`.
- Rejected decisions are shown in warning colour, with a reason label:
  - `LIMIT_REACHED` shows as "limit reached".
  - `BUDGET_EXHAUSTED` shows as "budget exhausted".
  - `SPAWN_IN_PROGRESS` shows as "another agent is running".
  - `INVALID_INPUT` shows as "invalid input".
  - An unknown reason shows the raw code.
- The orchestrator's streamed text is shown as plain text.
  - It reuses the `AgentPanel` box style via `theme.useToken()`.

## Acceptance criteria
- [ ] Renders both accepted and rejected items.
- [ ] `focus` renders as text only (no Markdown or HTML).

## Verification

- Component test.
- `npm test`.

## API contract

None. Renders the `decisions` state produced by [F02](f02-handle-orchestrator-events-derive-steps.md) from the [B11](b11-document-orchestrator-event-contract.md) `orchestrator_action` events.
