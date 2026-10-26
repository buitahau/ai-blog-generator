# F02 - Handle orchestrator events and derive steps

- **Side:** front-end
- **Status:** resolved
- **Size:** S
- **Depends on:** [F01 - Track agent instances by agent and spawn in useAgentRun](f01-track-agent-instances-by-spawn.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

`hooks/useAgentRun.js`:

- Add `decisions: []`.
  - Each `orchestrator_action` event is appended as `{action, accepted, spawn, focus, reason}`.
- `agent_failed` sets that instance's status to `failed`.
  - `agent_failed` is not terminal.
  - After an empty result the order is `agent_completed`, then `agent_failed`. The instance ends `failed`.
- `agent_status {state:'failed'}` marks the instance failed only; the step state is always derived from the instances (rules below), never set directly.
- Steps:
  - New first step `plan` tracks the orchestrator: `active` while it runs, `done` on `agent_completed`, `failed` on `agent_failed {orchestrator}` or a final `error` with agent `orchestrator`.
  - `research`:
    - `active` while any researcher is running.
    - `done` if any researcher succeeded.
    - `failed` if all researchers failed.
    - `skipped` if the orchestrator completed with no researcher.
  - `write` follows the same rules for the writer.
- Final error codes `NO_DRAFT` and `AGENT_TIMEOUT` are archived like the others.

## Acceptance criteria
- [x] One reducer test per step rule.
- [x] One reducer test for rejected actions.
- [x] One reducer test for the `plan` step failing on `agent_failed {orchestrator}`.
- [x] One reducer test: pass 1 fails, pass 2 succeeds, `research` is `done`.

## Verification

- `useAgentRun.test.js`.
- `npm test`.

## API contract

Consumes the orchestrator events from [B11](b11-document-orchestrator-event-contract.md): `orchestrator_action` (non-final), `agent_failed` (non-final), and the final error codes `NO_DRAFT` and `AGENT_TIMEOUT`, with `error.agent` possibly `orchestrator`.
