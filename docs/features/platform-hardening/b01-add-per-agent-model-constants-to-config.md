# B01 - Add per-agent model constants to config

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/config.js`, under `MODEL`, add `const modelFrom = (name) => process.env[name]?.trim() || MODEL;`.
- Export `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL` and `WRITER_MODEL`, each read with `modelFrom`.
- Export `AGENT_MODELS = Object.freeze({ orchestrator, researcher, writer })`.
- Update the comment above `MODEL`.
- No model string other than `DEFAULT_MODEL`.
- In `backend/.env.example`, add `ORCHESTRATOR_MODEL=`, `RESEARCHER_MODEL=` and `WRITER_MODEL=` under `ANTHROPIC_MODEL=`.
- `MODEL` stays as the fallback for each agent. Pending decision D1 does not change this task.
- Files: `backend/src/config.js`, `backend/.env.example`, `backend/test/config.test.js`.

## Acceptance criteria
- [ ] With no overrides, all three models equal `MODEL`.
- [ ] `WRITER_MODEL='  x  '` gives `'x'`.
- [ ] `WRITER_MODEL='   '` gives `MODEL`.
- [ ] `AGENT_MODELS` is frozen and has exactly three keys.
- [ ] `grep -rnE "claude-(opus|sonnet|haiku)" backend/src` matches only `config.js`. (A plain `claude-` grep also matches `@anthropic-ai/claude-agent-sdk`.)

## Verification

- In `config.test.js`, the cases set `process.env.WRITER_MODEL`, call `vi.resetModules()`, re-import with `await import`, and restore the env in `afterEach`.
- `npm test`.

## API contract

None. Internal config constants.
