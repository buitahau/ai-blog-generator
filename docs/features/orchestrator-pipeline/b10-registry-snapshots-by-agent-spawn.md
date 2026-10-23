# B10 - Key registry snapshots by agent and spawn

- **Side:** backend
- **Size:** S
- **Depends on:** [B05 - Add spawn index to normalizer events; add mergeSources](b05-normalizer-spawn-index-merge-sources.md)
- **Requirement:** [Orchestrator-driven pipeline (option B)](00-requirement.md)

## Description

- In `runRegistry.js`, key `evictedText` by `${agent}:${spawn ?? 1}`.
- `backlogFor` emits one `agent_text_snapshot {agent, spawn, text, upToId}` per key.

## Acceptance criteria
- [ ] Two researcher spawns with evicted deltas give two snapshots, each with the correct text.
- [ ] Old events without `spawn` are treated as spawn 1.

## Verification

- `test/adminRuns.test.js` or a registry test, using a small `bufferMax`.

## API contract

`agent_text_snapshot` is now `{agent, spawn, text, upToId}`, one per `agent:spawn` instance. The 4 KB cap is unchanged. See the requirement's Event contract changes.
