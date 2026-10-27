# B10 - Lower noisy non-fatal logs to warn

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B08 - Send services logging through the logger](b08-send-services-logging-through-logger.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Change these to `logger.warn`:
  - `[agent stderr]` in `backend/src/services/agents/runAgentQuery.js`
  - temp dir cleanup in `runAgentQuery.js`
  - `notification failed` (does not fail the run) in `backend/src/services/pipeline.js`
- Pending decision D6 (recommended default: fetch notifier): r24 deletes `telegramMcp.js` before this task, and the Telegram logs go with it. The redaction-test change moves to r23 (its AC asserts that something was logged). If D6 is rejected:
  - also change the `telegram-mcp: stderr` and notification-attempt-failed calls in `notifier/telegramMcp.js` to `logger.warn`;
  - update `backend/test/telegramNotifier.test.js` so that its `stderrSpy` collects both `console.warn` and `console.error`. Otherwise the "does not contain TOKEN" assertion passes with nothing logged.

## Acceptance criteria
- [ ] At `LOG_LEVEL=error`, these three lines are hidden, and real errors still print. (If D6 is rejected: these five.)

## Verification

- `npm test`.

## API contract

None. Logging only.
