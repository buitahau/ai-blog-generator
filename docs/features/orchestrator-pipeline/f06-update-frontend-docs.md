# F06 - Update front-end docs

- **Side:** front-end
- **Size:** S
- **Depends on:** [F05 - Wire instances and orchestrator into RunMessage and add error texts](f05-wire-instances-orchestrator-runmessage-error-texts.md)
- **Requirement:** [Orchestrator pipeline](00-requirement.md)

## Description

- Update `frontend/CLAUDE.md`:
  - The `useAgentRun` line describes `instances`.
  - The new component is listed.
- Update `frontend/README.md` if it describes run steps.

## Acceptance criteria
- [ ] The docs match the implemented reducer state shape.

## Verification

- Review against `useAgentRun.js`.
- `npm run lint`.

## API contract

None.
