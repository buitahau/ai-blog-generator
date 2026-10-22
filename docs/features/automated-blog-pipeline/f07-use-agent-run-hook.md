# F07 - Implement useAgentRun hook

- **Side:** front-end
- **Size:** M
- **Status:** todo
- **Depends on:** [F06 - Make SSE client generic and add runs API](f06-generic-sse-client-runs-api.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

`hooks/useAgentRun.js`:

- A reducer turns events into state:
  - `runId`, `title`, `status`.
  - `steps`: `{research, write, save, notify}`.
  - `agents`: `{researcher: {status, text, tools: [...], heartbeat, retrying, usage, costUsd}, writer: {...}}`.
  - `blog`, `notification`, `error`, `totalCostUsd`.
  - Plus session history.
- `rAF` batching for `agent_text_delta`.
- Auto-reconnect with `lastEventId`, up to 3 times, with backoff.
- On mount, `getActiveRun()` reattaches to a run in progress.
- `start(title)` and `cancel()`.
- Unmount only unsubscribes.
- Superseded-subscription guard.
- Reducer handles `agent_text_snapshot` by replacing `agents[agent].text`.
- `agent_status` with state `'failed'` sets the agent status.
- A `NOT_FOUND` from `subscribeRun` on reattach clears the stored run id and returns to idle without an error.
- `UNAUTHORIZED` is passed to the guard.

## Acceptance criteria
- [ ] Many deltas in one frame produce at most one state update per frame.
- [ ] `tool_result` attaches to its `toolUseId`.
- [ ] Remounting during a run replays the full state.
- [ ] A 409 surfaces as an error.
- [ ] A replay that starts with `agent_text_snapshot` and then deltas yields the full text without duplication.
- [ ] A stale runId on reattach (404) ends in idle, not error.

## Verification

- `useAgentRun.test.js` with `api/runs` mocked:
  - Event sequence produces a state snapshot.
  - Fake-rAF batching.
  - Reconnect id.
  - Unmount does not call `cancelRun`.
  - Reattach via `getActiveRun`.

## API contract

None. Consumes the `api/runs` client from [F06](f06-generic-sse-client-runs-api.md), which implements the [B10](b10-run-registry-admin-run-sse-endpoints.md) contract.
