# B11 - Add debug logs for agent init and startup models

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B02 - Use each agent's model in AGENTS and runAgentQuery](b02-use-each-agent-model-in-agents-and-run-agent-query.md), [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md), [B10 - Lower noisy non-fatal logs to warn](b10-lower-noisy-non-fatal-logs-to-warn.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In the `system/init` branch of `backend/src/services/agents/runAgentQuery.js`, add `logger.debug('Agent init:', agentName, message.model, message.tools)`.
  - Log only these three values. Never log the options, the env, the whole message, or the prompt.
- In the `listen` callback of `backend/src/server.js`, add `logger.info('Models:', AGENT_MODELS)`.
- Files: `backend/src/services/agents/runAgentQuery.js`, `backend/src/server.js`, `backend/test/runAgentQuery.test.js`.

## Acceptance criteria
- [ ] At `debug`, each agent query prints one `Agent init:` line that shows the model and the tools.
- [ ] At `info`, no `Agent init:` line is printed.
- [ ] A test asserts that the debug call arguments do not contain the `ANTHROPIC_API_KEY` value.

## Verification

- Unit test with a mocked init message.
- Manual check: set `WRITER_MODEL` to a different valid model and `LOG_LEVEL=debug`, then start an admin run (`POST /api/admin/runs`). Confirm that the writer's `Agent init` line shows that model. This settles the which-model-wins question (Q3 in the requirement).

## API contract

None. Logging only.
