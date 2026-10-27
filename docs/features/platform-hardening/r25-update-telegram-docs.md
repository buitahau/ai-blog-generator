# r25 - Update Telegram docs

> **Pending decision D6.** This task applies only if D6 (replace the Telegram MCP package with a Bot API fetch) is approved. If D6 is rejected (keep MCP): this task is skipped. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r24 - Switch to the fetch notifier and drop the MCP package](r24-switch-to-fetch-notifier-and-drop-mcp-package.md), [B13 - Document per-agent models, the agent spec and LOG_LEVEL](b13-document-per-agent-models-agent-spec-and-log-level.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- `backend/README.md`, the Telegram section: describe the direct Bot API call. Drop the pin, and the `LOG_ENABLE_CONSOLE` and `DEBUG_MCP` notes.
- `backend/README.md` (the timeout text, line 33 today): the timeout is a plain per-request timeout, without the 3 s server margin.
- `backend/CLAUDE.md:26`: update the description, and list the new file.
- `backend/src/config.js`, the comment on `TELEGRAM_NOTIFY_TIMEOUT_MS`: update it.
- Under decision 2 in `docs/features/automated-blog-pipeline/00-requirement.md`, add one line: "Superseded by platform-hardening D6."

Files:

- `backend/README.md`
- `README.md`
- `backend/CLAUDE.md`
- `backend/src/config.js`
- `docs/features/automated-blog-pipeline/00-requirement.md`

## Acceptance criteria

- [ ] No doc mentions `telegram-chat-bot-mcp`, except the historical decision text.

## Verification

- `grep -rn "telegram-chat-bot-mcp\|LOG_ENABLE_CONSOLE" --exclude-dir=node_modules .`

## API contract

None.
