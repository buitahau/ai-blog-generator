# r23 - Bot API fetch notifier

> **Pending decision D6.** This task applies only if D6 (replace the Telegram MCP package with a Bot API fetch) is approved. If D6 is rejected (keep MCP): this task is skipped. It reverses decision 2 of the [automated-blog-pipeline](../automated-blog-pipeline/00-requirement.md) requirement. See [Platform hardening](00-requirement.md).

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** D6 approval, [B07 - Add LOG_LEVEL config and a logger module](b07-add-log-level-config-and-logger-module.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Create `backend/src/services/notifier/telegramBotApi.js`, exporting `createTelegramNotifier(config, { fetchImpl = fetch } = {})`.
- Same config as today: `botToken`, `chatId`, `adminBaseUrl`, and `timeoutMs` (default `TELEGRAM_NOTIFY_TIMEOUT_MS`).
- Move `buildText` and `redact` out of the MCP file, or re-export them from it.
- Request:
  - `POST https://api.telegram.org/bot${botToken}/sendMessage`
  - JSON body `{ chat_id, text, link_preview_options: { is_disabled: true } }`
  - `signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal].filter(Boolean))`
- Response mapping:

  | Outcome | Result |
  |---------|--------|
  | `ok: true` | `sent` |
  | 401 | `TELEGRAM_UNAUTHORIZED` |
  | 400 with `/chat not found/i` in the description, or 403 | `TELEGRAM_CHAT_NOT_FOUND` |
  | timeout (`TimeoutError`) | `TELEGRAM_TIMEOUT` |
  | parent abort | `TELEGRAM_TIMEOUT` (as today) |
  | anything else | `TELEGRAM_ERROR` |

- Retry once only when fetch rejects with `TypeError` (connection failed). Never retry after a response or a timeout.
- Contract kept:
  - never throws
  - `skipped` without a token or chat id
  - never log the URL or the token. Logs go through `redact`.
  - a failed attempt is logged with `logger.warn`, through `redact`.

Files:

- `backend/src/services/notifier/telegramBotApi.js` (new)
- `backend/test/telegramBotApi.test.js` (new)

## Acceptance criteria

- [ ] `telegramBotApi.test.js` uses a mocked `fetchImpl`, and covers each row of the mapping table.
- [ ] `skipped` is covered, without a token or chat id.
- [ ] One retry on `TypeError`, and no retry on timeout.
- [ ] An abort mid-request is covered.
- [ ] A test spies on the logger output for both `warn` and `error`, asserts that `bot<redacted>` was logged, and asserts that the token appears nowhere.

## Verification

- `npm test -- telegramBotApi`.
- Manual: with real `TELEGRAM_*` env, a run gives a notification event `sent`.

## API contract

- The notifier result is `sent`, `failed` or `skipped`, with error codes `TELEGRAM_UNAUTHORIZED`, `TELEGRAM_CHAT_NOT_FOUND`, `TELEGRAM_TIMEOUT` and `TELEGRAM_ERROR`. This is unchanged from today.
- Outbound call: Telegram Bot API `sendMessage`.
