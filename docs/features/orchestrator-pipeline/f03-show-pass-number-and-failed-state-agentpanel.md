# F03 - Show pass number and failed state in AgentPanel

- **Side:** front-end
- **Size:** S
- **Depends on:** [F01 - Track agent instances by agent and spawn in useAgentRun](f01-track-agent-instances-by-spawn.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`components/agent/AgentPanel.jsx`:

- Takes props `{agent, spawn, instance}`.
- Title:
  - `Researcher` for spawn 1.
  - `Researcher (pass 2)` otherwise.
- Add `Orchestrator` to `TITLES`.
- A failed instance shows `<Text type="danger">` with the failure message.

## Acceptance criteria
- [ ] The title is correct for spawn 1 and spawn 2.
- [ ] The failed tag and the failure message render.

## Verification

- Component test with Testing Library.
- `npm test`.

## API contract

None. Renders the instance state produced by [F01](f01-track-agent-instances-by-spawn.md) from the [B11](b11-document-orchestrator-event-contract.md) events.
