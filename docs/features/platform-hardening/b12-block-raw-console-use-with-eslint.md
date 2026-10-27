# B12 - Block raw console use in backend/src with ESLint

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [B08 - Send services logging through the logger](b08-send-services-logging-through-logger.md), [B09 - Send app, routes and server logging through the logger](b09-send-app-routes-and-server-logging-through-logger.md), [B10 - Lower noisy non-fatal logs to warn](b10-lower-noisy-non-fatal-logs-to-warn.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/eslint.config.js`, set `'no-console': 'error'` for `src/**`. Leave `scripts/**` and `test/**` alone.
- Add `// eslint-disable-next-line no-console` above the three fatal lines in `backend/src/server.js`.
- `backend/src/lib/logger.js` gets a file-level disable.
- From this task on, lint and CI reject raw `console` in `backend/src`. The backend CI job from [r16](r16-ci-workflow-with-backend-job.md) runs this lint.

## Acceptance criteria
- [ ] `npm run lint` passes.
- [ ] Adding `console.log('x')` to any file in `src/services` makes lint fail.
- [ ] The r16 backend CI job fails on a raw `console` call in `backend/src`.

## Verification

- Run `npm run lint` before the change and after it.
- Make the temporary edit with `console.log('x')` in a `src/services` file, confirm that lint fails, then revert it.

## API contract

None. Tooling only.
