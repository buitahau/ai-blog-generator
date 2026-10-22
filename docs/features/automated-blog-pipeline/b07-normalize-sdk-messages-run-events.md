# B07 - Normalize SDK messages into compact run events

- **Side:** backend
- **Size:** M
- **Status:** resolved
- **Depends on:** [B06 - Add Agent SDK runner with hardened options](b06-agent-sdk-runner-hardened-options.md) (types and the recorded fixtures in `test/fixtures/agent/*.jsonl`)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

`src/services/agents/normalize.js` exports `createNormalizer(agent)`, which maps SDK messages to run events:

- `stream_event` with `content_block_delta` / `text_delta` -> `agent_text_delta {agent, text}`.
- `assistant` `tool_use` (WebSearch/WebFetch) -> `tool_call {agent, toolUseId, name, input: {query} | {url}}`. The WebFetch `prompt` is dropped.
- `user` `tool_result` plus `tool_use_result` -> `tool_result {agent, toolUseId, name, ok, results?: [{title, url, snippet?}], summary?}`.
  - At most 10 items. Snippets are 200 characters max.
- `tool_progress` heartbeat -> `agent_heartbeat {agent, toolName, elapsedSec}`.
- `system`/`api_retry` (attempt, max_retries, error) -> `agent_status {agent, state:'retrying', category, attempt}`; an `assistant` message with `error` set (terminal synthetic error) -> `agent_status {agent, state:'failed', category}` (the final error itself comes from B06's mapping). Note: check field names against the installed SDK's .d.ts.
- `system` init is ignored (debug log).
- Unknown types are ignored.

Also exports `collectSources(messages)`, which returns deduplicated `[{title, url}]` from WebSearch and WebFetch results, max 20.

## Acceptance criteria
- [x] Each `tool_call` gets exactly one matching `tool_result` (`ok: false` with `errorCode` on failure).
- [x] No event exceeds ~4 KB.
- [x] Unknown or malformed messages never throw.

## Verification

- Tests load the B06 fixtures (`.jsonl`), plus hand-made cases for retry, heartbeat and malformed messages.
- Snapshot the events, assert the size cap, and test `collectSources` deduplication.

## API contract

None. Internal normalizer. Event shapes are defined in [B10](b10-run-registry-admin-run-sse-endpoints.md).
