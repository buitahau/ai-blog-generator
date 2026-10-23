# B11 - Send admin Telegram notification via the Bot API MCP server

- **Side:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** [B09 - Implement fixed-order research -> write -> save-draft pipeline](b09-fixed-order-research-write-save-pipeline.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- Add `@modelcontextprotocol/sdk` and `telegram-chat-bot-mcp@0.1.16` (exact pin; 0.1.17 fails `npm ci` on Linux and macOS because of its Windows-only rollup dependency).
- `src/services/notifier/telegramMcp.js` exports `createTelegramNotifier(config)`, which returns `{notify(blog)}`.
- Resolve the server bin with `createRequire(import.meta.url).resolve(...)`, not `npx`.
- Start the server with `StdioClientTransport({command: process.execPath, args: [binPath], env})`.
- Server env passed explicitly: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, LOG_LEVEL=WARN, LOG_ENABLE_CONSOLE=false. LOG_ENABLE_CONSOLE=false is required for correctness: the server's logger writes to stdout, which is the MCP JSON-RPC channel. StdioClientTransport merges this env over the MCP SDK's default environment (getDefaultEnvironment(): HOME, PATH, USER, SHELL, TERM, LOGNAME); it is "explicit keys merged with SDK safe defaults", not a strict allowlist, and none of the defaults are secrets. Never pass DEBUG_MCP. Use `stderr: 'pipe'` and read `transport.stderr` line by line through the `/bot\d+:[\w-]+/` redactor into `console.error`.
- Call only `send_telegram_text` with `{text}`:
  - Text: `"New draft ready for review: <title>\n<ADMIN_BASE_URL>/admin/blogs?highlight=<id>"`. Plain text, truncated to 4000 characters.
- An `isError` result or a non-success text maps to `failed`, with an errorCode:
  - `TELEGRAM_UNAUTHORIZED`: bad token.
  - `TELEGRAM_CHAT_NOT_FOUND`: wrong chat, or the admin never sent `/start` to the bot.
  - `TELEGRAM_TIMEOUT`.
  - `TELEGRAM_ERROR`.
- 15 s timeout (`TELEGRAM_NOTIFY_TIMEOUT_MS`).
- One retry only when no result came back, so there are no duplicate messages.
- Transport is closed in `finally`.
- If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing, return `skipped` without starting the server. This is not part of `assertConfig`.
- Wire as the default notifier in the pipeline (B09).
- Update:
  - `.env.example`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_NOTIFY_TIMEOUT_MS`, `ADMIN_BASE_URL`.
  - README:
    - BotFather, then `/start`, then `getUpdates` to get the chat id.
    - Bots can only message users or groups that started them.
    - The package is pinned. Check the changelog before upgrading.
    - Never set `DEBUG_MCP`.
    - The pinned 0.1.16 server keeps no log files; its stderr is redacted into the backend log. Do not upgrade to 0.1.17 (Windows-only dependency breaks installs).
    - Notification failures never fail a run.

## Acceptance criteria
- [x] `notify()` never throws. It returns `{status: 'sent' | 'failed' | 'skipped', errorCode?}`.
- [x] Only `send_telegram_text` is callable. Other tool names throw in a unit test.
- [x] The bot token never appears in our logs, SSE events, or the agent subprocess env. `/bot\d+:[\w-]+/` is redacted in logged server errors.
- [x] Exactly one Telegram message per completed run.
- [x] `npm ci` succeeds on Linux.
- [x] The transport is created with `stderr: 'pipe'`, and redacted stderr never contains the token.
- [x] The transport env contains `LOG_ENABLE_CONSOLE: 'false'`.

## Verification

- `test/telegramNotifier.test.js` with the MCP Client mocked:
  - Success: `sent`, and `callTool` args are `{name: 'send_telegram_text', arguments: {text}}`.
  - `isError` with `'Unauthorized'`: `failed` with `TELEGRAM_UNAUTHORIZED`.
  - `'chat not found'`: `TELEGRAM_CHAT_NOT_FOUND`.
  - Hang: `TELEGRAM_TIMEOUT` after one retry.
  - Missing env: `skipped`, with no transport started.
  - Token redaction.
  - Stderr redaction: a stderr line containing `bot123:ABC-def` is logged as `bot<redacted>`.
  - Transport env has `LOG_ENABLE_CONSOLE: 'false'` and no `DEBUG_MCP`, `ANTHROPIC_API_KEY`, `DATABASE_URL` or `ADMIN_TOKEN`; stderr is `'pipe'`.
- Manual:
  1. Create a bot with @BotFather.
  2. The admin sends `/start` to the bot.
  3. Get the chat id: `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"`.
  4. Set the env vars and run the B10 curl.
  5. The SSE stream shows `notification {"channel":"telegram","status":"sent"}`, and the admin gets a real push with a working link.
  6. With a wrong `TELEGRAM_CHAT_ID`: `failed` with `TELEGRAM_CHAT_NOT_FOUND`, and the run still ends with `run_completed`.

## API contract

None. Internal notifier interface. The `notification` event is defined in [B10](b10-run-registry-admin-run-sse-endpoints.md).
