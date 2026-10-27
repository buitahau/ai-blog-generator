# B03 - Move spawn-tool argument schemas to validation

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Create `backend/src/validation/spawnArgsSchema.js`.
- Move these from `backend/src/services/orchestrator/tools.js` (found by name; line numbers shift), unchanged:
  - `FOCUS_MAX`
  - `focusSchema`
  - `researcherSpawnArgs` (was `researcherArgs`)
  - `writerSpawnArgs` (was `writerArgs`)
- Add the loose MCP shapes:
  - `researcherToolShape = { focus: z.string().optional() }`
  - `writerToolShape = {}`
- Export all of them.
- Keep the comment that explains why the MCP shape is loose: the strict check happens in the handler ([orchestrator-pipeline b01 spike Q11](../orchestrator-pipeline/b01-spike-findings.md)).
- `tools.js` imports from the new file.

## Acceptance criteria
- [ ] No zod schema is declared in `tools.js`.
- [ ] `orchestratorTools.test.js` passes unchanged, including the `INVALID_INPUT` and focus tests.

## Verification

- `npm test`.
- `npm run lint`.

## API contract

None. Internal module move.
