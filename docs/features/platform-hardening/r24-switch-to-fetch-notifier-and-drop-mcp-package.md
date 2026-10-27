# r24 - Switch to the fetch notifier and drop the MCP package

> **Pending decision D6.** This task applies only if D6 (replace the Telegram MCP package with a Bot API fetch) is approved. If D6 is rejected (keep MCP): this task is skipped. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r23 - Bot API fetch notifier](r23-bot-api-fetch-notifier.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In the import at the top of `backend/src/services/notifier/index.js`, import from `./telegramBotApi.js`.
- Delete `backend/src/services/notifier/telegramMcp.js` and `backend/test/telegramNotifier.test.js`.
- Run `npm uninstall telegram-chat-bot-mcp` in `backend/`.
- Keep `@modelcontextprotocol/sdk`. It is a peer dependency of the Agent SDK.

Files:

- `backend/src/services/notifier/index.js`
- `backend/src/services/notifier/telegramMcp.js` (delete)
- `backend/test/telegramNotifier.test.js` (delete)
- `backend/package.json` and `backend/package-lock.json`

## Acceptance criteria

- [ ] `grep -rn "telegram-chat-bot-mcp\|telegramMcp" backend --exclude-dir=node_modules` returns nothing.
- [ ] `npm ci && npm test` pass.

## Verification

- The same grep and test commands.
- One end-to-end run with Telegram configured.

## API contract

None. The notifier contract is unchanged (see r23).
