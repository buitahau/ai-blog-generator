# r31 - CD workflow: deploy on merge to master

- **Status:** TBD
- **Side:** backend
- **Size:** M
- **Depends on:** [r16 - CI workflow with backend job](r16-ci-workflow-with-backend-job.md), [r17 - Front-end CI job](r17-front-end-ci-job.md), [r29 - Fly.io backend packaging](r29-fly-io-backend-packaging.md), [r30 - Cloudflare Worker for frontend and API proxy](r30-cloudflare-worker-frontend-and-api-proxy.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Deploy on push to `master`, after CI passes (D9).

- Side note: the `deploy-frontend` job is front-end work. It is in this task because it shares `ci.yml` and the `needs` graph with `deploy-backend`, so the Side is backend.
- Choice: deploy jobs are added to `.github/workflows/ci.yml`, not to a separate `deploy.yml` with `workflow_run`. The deploy jobs use `needs: [backend, frontend]`, which is simpler and keeps one workflow run per commit. A failed test in either CI job blocks both deploys.
- Gate for every deploy job: `if: github.event_name == 'push' && github.ref == 'refs/heads/master'`. PRs and other branches never deploy. `workflow_dispatch` is added by r32 and must keep the same `master` gate.
- Jobs:
  - `deploy-backend`:
    - `needs: [backend, frontend]`, `environment: production`.
    - `concurrency: { group: deploy-backend, cancel-in-progress: false }`.
    - Steps: `actions/checkout`, `superfly/flyctl-actions/setup-flyctl`, then `flyctl deploy --remote-only` in `backend/`, with `FLY_API_TOKEN` from the environment secret.
    - Post-deploy smoke: `curl -fsS "$API_ORIGIN/api/health"`, retried a few times with a short sleep.
    - Use a deploy-scoped token: `fly tokens create deploy`.
  - `deploy-frontend`:
    - `needs: deploy-backend`, `environment: production`.
    - `concurrency: { group: deploy-frontend, cancel-in-progress: false }`.
    - Steps: `actions/checkout`, `actions/setup-node` (Node 22, cache `frontend/package-lock.json`), `npm ci` and `npm run build` in `frontend/`, then `cloudflare/wrangler-action` with `deploy` in `frontend/` and `command: deploy --var API_ORIGIN:${{ vars.API_ORIGIN }}`.
    - Fail fast if `vars.API_ORIGIN` is empty, so the Worker is never deployed with no origin.
    - Post-deploy smoke: `curl -fsS` on the Worker URL (`/`) and on `$API_ORIGIN` through the Worker's `/api/health`, retried a few times. The Worker URL comes from the wrangler-action `deployment-url` output (verify the output name at implementation).
- Secrets and variables, referenced exactly as written:
  - Environment `production` secrets: `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN` (Workers edit scope), `CLOUDFLARE_ACCOUNT_ID`.
  - Environment `production` variable: `API_ORIGIN` (the Fly origin, `https://<app>.fly.dev`).
  - CI jobs use no secrets.
- Pinning: every action is pinned to a full release tag (for example `actions/checkout@v4.x.y`), resolved at implementation. The requirement wrote `superfly/flyctl-actions/setup-flyctl@master`. That conflicts with the full-tag rule, so the tag wins; `@master` is not used.
- Secrets are never echoed: no `set -x`, no `echo` of a secret, no secret in a URL. GitHub masks the values, but do not rely on that.
- Permissions: `contents: read` at the workflow level.

Sketch (the real file follows the existing r16 and r17 jobs):

```yaml
deploy-backend:
  needs: [backend, frontend]
  if: github.event_name == 'push' && github.ref == 'refs/heads/master'
  runs-on: ubuntu-latest
  environment: production
  concurrency: { group: deploy-backend, cancel-in-progress: false }
  steps:
    - uses: actions/checkout@<full tag>
    - uses: superfly/flyctl-actions/setup-flyctl@<full tag>
    - run: flyctl deploy --remote-only
      working-directory: backend
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
deploy-frontend:
  needs: deploy-backend
  if: github.event_name == 'push' && github.ref == 'refs/heads/master'
  environment: production
  concurrency: { group: deploy-frontend, cancel-in-progress: false }
  # steps: checkout, setup-node, npm ci, npm run build, wrangler-action deploy
```

Files:

- `.github/workflows/ci.yml` (modified: deploy jobs added)

## Acceptance criteria

- [ ] A merge to `master` runs CI, then `deploy-backend`, then `deploy-frontend`, in that order.
- [ ] A PR runs CI only; neither deploy job runs.
- [ ] A failing backend or frontend test or lint blocks both deploys.
- [ ] A failed `deploy-backend` blocks `deploy-frontend`.
- [ ] No secret is printed in the logs, and no secret is in the repo.
- [ ] Every action is pinned to a full tag.
- [ ] Both deploy jobs use `environment: production`, and the `if` is limited to `master`.
- [ ] Both post-deploy smoke steps run and fail the job when they fail.

## Verification

- `actionlint .github/workflows/ci.yml` and a read of the `needs` and `if` graph.
- `act push -W .github/workflows/ci.yml -j deploy-backend -n` (dry run) to check that the job is selected on `push` and skipped on `pull_request`. Dry run does not contact Fly or Cloudflare.
- Live check: open a PR, confirm the deploy jobs are skipped. Then merge a trivial change to `master` and watch CI, then `deploy-backend`, then `deploy-frontend`.
- A live "failing test blocks deploy" run needs a push to `master` with a failing test. Do not do this on the real repo; if it must be shown, use a throwaway copy of the repo. The `needs` graph is the check otherwise.
- Do not widen the `if` on a throwaway branch to test the deploy.

## API contract

None.
