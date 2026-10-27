# B13 - Document per-agent models, the agent spec and LOG_LEVEL

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B05 - Build the pipeline MCP server from AGENT_SPECS](b05-build-pipeline-mcp-server-from-agent-specs.md), [B06 - Read turn caps from the spec in runPipeline](b06-read-turn-caps-from-spec-in-run-pipeline.md), [B10 - Lower noisy non-fatal logs to warn](b10-lower-noisy-non-fatal-logs-to-warn.md), [B11 - Add debug logs for agent init and startup models](b11-add-debug-logs-for-agent-init-and-startup-models.md), [B12 - Block raw console use in backend/src with ESLint](b12-block-raw-console-use-with-eslint.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- `backend/README.md` env table:
  - `ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL`, `WRITER_MODEL`: optional, fall back to `MODEL` (`ANTHROPIC_MODEL` or `DEFAULT_MODEL`).
  - `LOG_LEVEL`: `silent|error|warn|info|debug`, default `info`. Fatal startup errors always print.
  - `[agent stderr]` is logged at `warn`. It needs `LOG_LEVEL` `warn` or lower; `debug` is needed for `Agent init:`.
- `backend/CLAUDE.md`. This task owns these lines; r25 and r27 edit the same file after it.
  - Layout lines for `config.js`.
  - Layout line for `definitions.js`: `AGENT_SPECS` is the single source of truth.
  - Layout line for `tools.js`: built from the specs.
  - New layout lines for `lib/logger.js` and `validation/spawnArgsSchema.js`.
  - The model rule names `AGENT_MODELS`.
  - The error-logging line: errors are "logged with `logger.error`".
  - New rule: "Use `logger`, never `console.*`, in `src/`. Never log options or env objects."
- Root `README.md`: where it tells readers to look for `[agent stderr]`, add the same note: "needs `LOG_LEVEL` `warn` or lower (`debug` for `Agent init:`)".
- In `docs/features/orchestrator-pipeline/00-requirement.md`, mark decision (g) as replaced, with a link to [platform-hardening D10](../platform-hardening/00-requirement.md#decisions).
- Edits to `backend/README.md` run after r12 and r21; r25, r27, r28 and r32 edit the same files after this task.

## Acceptance criteria
- [ ] Every env var added by B01 and B07 (`ORCHESTRATOR_MODEL`, `RESEARCHER_MODEL`, `WRITER_MODEL`, `LOG_LEVEL`) appears in both `backend/.env.example` and the README env table.
- [ ] No line in `backend/CLAUDE.md` still says "Import `MODEL`" for agents, or refers to `console.error` as the logging method.
- [ ] The root `README.md` note on `[agent stderr]` says it needs `LOG_LEVEL` `warn` or lower.

## Verification

- Review the diff.
- `grep -n "console.error\|LOG_LEVEL\|WRITER_MODEL" backend/CLAUDE.md backend/README.md` shows the updated lines.

## API contract

None. Documentation only.
