# F08 - Build admin chat page with live agent activity

- **Side:** front-end
- **Size:** M
- **Status:** resolved
- **Depends on:** [F01 - Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md), [F04 - Add admin token login and route guard](f04-admin-token-login-route-guard.md), [F07 - Implement useAgentRun hook](f07-use-agent-run-hook.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

`pages/AdminGeneratePage.jsx`, plus `components/agent/RunMessage.jsx`, `AgentPanel.jsx`, and `ToolCallItem.jsx`.

- The message list scrolls. The title input is fixed at the bottom. Enter submits.
- `RunMessage`:
  - Steps: Research -> Write -> Save draft -> Notify.
  - `AgentPanel` per agent:
    - Status `Tag` and `Spin`.
    - "Waiting on WebFetch… 45 s" from heartbeats.
    - "Retrying (rate limit)" from `agent_status`.
  - `Collapse` of tool calls: query or URL, with linked result titles.
  - Live text box with max height: plain `pre-wrap` while streaming, `MarkdownView` on completion.
  - Turns, tokens, cost.
  - Final "Open draft" button, linking to `/admin/blogs?highlight=id`.
  - Telegram notification `Tag`:
    - `sent`: success.
    - `skipped`: default. Tooltip "Telegram not configured".
    - `failed`: warning, with a readable message per `errorCode`. Never blocks "Open draft".
- Cancel button.
- Errors shown in an `Alert` that names the agent.
- Error-code sets move to `constants/errors.js`. New codes: `AGENT_MAX_TURNS`, `AGENT_BUDGET_EXCEEDED`, `RESEARCH_EMPTY`, `RUN_TIMEOUT`, `SERVER_SHUTDOWN` -> error `Alert` with Retry; `RUN_IN_PROGRESS` (409) -> warning `Alert` "A run is already in progress" with a "Show it" action that reattaches through `getActiveRun()`; `UNAUTHORIZED` -> no `Alert` (the guard redirects to login); `NOT_FOUND` (stale run on reattach) -> no `Alert`, quiet reset to idle.
- Auto-scroll only when the user is at the bottom.
- `aria-live="polite"`.
- Doc updates (describe as steps; do not edit CLAUDE.md in this task):
  - In `frontend/CLAUDE.md`, move the error-code list from "Codes handled in App.jsx" to `constants/errors.js` with the new codes, and remove "App.jsx is the only page".
  - Update the front-end part of the root `CLAUDE.md` Layout (`pages/`, `layouts/`, `components/agent/`, `api/stream.js`, `api/runs.js`, `api/auth.js`, `api/admin.js`, `api/blogs.js`, `constants/errors.js`).

## Acceptance criteria
- [ ] The UI stays responsive during a run: scrolling, opening and closing panels, and typing in the input all work. Send is disabled while a run is active.
- [x] Every tool call and result is visible.
- [ ] Leaving and returning reattaches to the run.
- [x] Cancel shows an info `Alert`.
- [x] No raw HTML is rendered.

## Verification

- Component tests with mocked hook states: researching with 2 tools and a heartbeat, writing and streaming, completed, error, cancelled.
- Component tests for a `RUN_IN_PROGRESS` warning with the reattach action, and for a stale-run `NOT_FOUND` showing no `Alert`.
- Manual end-to-end:
  - Log in and submit a title.
  - Watch the WebSearch and WebFetch calls, then the writer text stream.
  - See "Draft saved" and the Telegram status.
  - Switch to Blogs and back mid-run. The run reattaches.
  - DevTools Performance shows no long tasks over 200 ms.

## API contract

None. Consumes the `useAgentRun` hook from [F07](f07-use-agent-run-hook.md), which uses the [B10](b10-run-registry-admin-run-sse-endpoints.md) contract.
