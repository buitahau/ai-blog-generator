# F02 - Handle orchestrator events and derive steps

- **Side:** front-end
- **Size:** S
- **Depends on:** [F01 - Track agent instances by agent and spawn in useAgentRun](f01-track-agent-instances-by-spawn.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`hooks/useAgentRun.js`:

- Add `decisions: []`.
  - Each `orchestrator_action` event is appended as `{action, accepted, spawn, focus, reason}`.
- `agent_failed` sets that instance's status to `failed`.
  - `agent_failed` is not terminal.
- Steps:
  - New first step `plan` tracks the orchestrator.
  - `research`:
    - `active` while any researcher is running.
    - `done` if any researcher succeeded.
    - `failed` if all researchers failed.
    - `skipped` if the orchestrator completed with no researcher.
  - `write` follows the same rules for the writer.
- Final error codes `NO_DRAFT` and `AGENT_TIMEOUT` are archived like the others.

## Acceptance criteria
- [ ] One reducer test per step rule.
- [ ] One reducer test for rejected actions.

## Verification

- `useAgentRun.test.js`.
- `npm test`.

## API contract

Consumes the orchestrator events from [B11](b11-document-orchestrator-event-contract.md): `orchestrator_action` (non-final), `agent_failed` (non-final), and the final error codes `NO_DRAFT` and `AGENT_TIMEOUT`, with `error.agent` possibly `orchestrator`.
