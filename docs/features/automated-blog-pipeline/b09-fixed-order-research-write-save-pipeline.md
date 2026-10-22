# B09 - Implement fixed-order research -> write -> save-draft pipeline

- **Side:** backend
- **Size:** M
- **Status:** todo
- **Depends on:** [B02 - Implement blogs repository and slug helper](b02-blogs-repository-slug-helper.md), [B06 - Add Agent SDK runner with hardened options](b06-agent-sdk-runner-hardened-options.md), [B07 - Normalize SDK messages into compact run events](b07-normalize-sdk-messages-run-events.md), [B08 - Define researcher and writer agents and prompts](b08-researcher-writer-agents-prompts.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

`src/services/pipeline.js` exports `runPipeline({runId, title, signal, emit, repo, notifier})`:

1. Emit `agent_started` for the researcher.
   - `runAgentQuery` with the researcher.
   - Pipe messages through the normalizer. Keep the raw messages for `collectSources`.
   - Emit `agent_completed {agent, numTurns, costUsd, usage}`.
2. If the notes are empty, fail with `RESEARCH_EMPTY`.
   - Notes come only from a result that is success and not is_error (B06 guarantees this).
3. Writer: `runAgentQuery` with `buildWriterTask`. Emit `agent_completed`.
4. Parse the H1 into the title (fall back to the input title). Excerpt is the first paragraph without Markdown, up to 200 characters.
   - `repo.createDraft`.
   - Emit `blog_saved`.
5. `notifier.notify(blog)`. The default is a no-op that returns `skipped`.
   - Emit `notification {channel: 'telegram', status, errorCode?}`.
   - Waiting for the notification must not delay the saved draft.
6. Emit `run_completed`.

The registry (B10) emits `run_started`, `run_cancelled` and timeout errors; the pipeline does not. An abort before `createDraft` saves nothing. An abort after `createDraft` skips the notification, the draft remains, and `blog_saved` has already been emitted. The pipeline rethrows `StreamAbortedError` with the reason so the registry can choose the final event.

- Text deltas are throttled per agent before emit: flush every 100 ms or 1 KB, whichever comes first, and flush on `agent_completed`.

## Acceptance criteria
- [ ] The writer never starts before the researcher result.
- [ ] An agent error emits `error {agent, code, message}` and saves no draft.
- [ ] A notifier failure still completes the run.
- [ ] Total cost is included in `run_completed`.
- [ ] A cancel after `createDraft` leaves the draft and skips notify.
- [ ] The pipeline never emits `run_started` or `run_cancelled`.

## Verification

- Unit tests with `runAgentQuery`, the repo, and the notifier mocked:
  - Happy path: event order snapshot. `createDraft` args include `sources`.
  - Researcher `AGENT_BUDGET_EXCEEDED`: no writer call, no draft.
  - Abort during the writer: no draft.
  - Notifier throws: notification status `'failed'`, then `run_completed`.
  - Abort after `blog_saved`: draft exists, notify not called.
  - 1,000 deltas within 100 ms produce <= 2 emitted `agent_text_delta` events.

## API contract

None. Emits the run events defined in [B10](b10-run-registry-admin-run-sse-endpoints.md).
