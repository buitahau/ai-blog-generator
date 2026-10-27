# r32 - Rollback and manual deploy path

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r31 - CD workflow: deploy on merge to master](r31-cd-workflow-deploy-on-merge-to-master.md), [r28 - Deploy section in the backend README](r28-deploy-section-in-backend-readme.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Document how to roll back and deploy by hand, and add a re-deploy trigger.

- `backend/README.md` `## Deploy` (the section r28 adds), new subsection "Releases and rollback":
  - List releases: `fly releases -a <app>`. Each release shows the image it ran.
  - Roll back to a previous image: `fly deploy --image <previous image ref> -a <app>`. Take the image ref from `fly releases` (check the column or flag on the installed flyctl with `fly releases --help`).
  - If the installed flyctl has a dedicated rollback subcommand, document it here instead; check `fly releases --help` and the flyctl docs. Do not document a command that was not checked.
  - Note: the `release_command` in `fly.toml` runs again on rollback. It is safe, because migrations already applied are skipped.
- Worker rollback:
  - Preferred: `npx wrangler rollback` (to the previous version), or `npx wrangler rollback <version-id>` (verify the version list with `npx wrangler deployments list` or `npx wrangler versions list` on the installed wrangler).
  - Alternative: check out the previous good commit and redeploy it with the manual command below.
- Manual deploy (same commands CI runs):
  - Backend: `cd backend && flyctl deploy --remote-only`, with `FLY_API_TOKEN` in the environment.
  - Frontend: `cd frontend && npm ci && npm run build && npx wrangler deploy --var API_ORIGIN:https://<app>.fly.dev`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.
- Before any deploy, check for an active run. A deploy stops the only machine, and an active run is aborted with `SERVER_SHUTDOWN`: `curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" https://<domain>/api/admin/runs/active` should return `{ "runId": null }`.
- Migration caveat: migrations are forward-only. A rolled-back backend must tolerate the newer schema, so write additive migrations (add columns and tables; make new columns nullable or defaulted). Drop or rename in two steps: ship code that stops using the column, then remove the column in a later release.
- Rolling back the backend while the Worker is newer (or the reverse) must still work: keep `/api/*` contracts compatible across one release.
- `workflow_dispatch` for re-deploys:
  - Add `workflow_dispatch:` to the `on:` trigger in `.github/workflows/ci.yml`.
  - Both deploy jobs use `if: github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')`. Dispatch from any other branch does nothing.
- Link from `backend/README.md` to [setup-cd.md](../docs/features/platform-hardening/setup-cd.md) for first-time setup.

Files:

- `backend/README.md` (Deploy section: rollback and manual deploy)
- `.github/workflows/ci.yml` (`workflow_dispatch` trigger and gate)

## Acceptance criteria

- [ ] The Deploy section has the rollback and manual deploy commands.
- [ ] Every command in the section was checked against the installed `flyctl` and `wrangler` help output (versions noted in the PR).
- [ ] The migration caveat is written as above.
- [ ] `workflow_dispatch` is added to `ci.yml`.
- [ ] Both deploy jobs are still gated to `refs/heads/master`, and dispatch from another branch does not deploy.

## Verification

- Run `fly releases --help`, `fly deploy --help` and `npx wrangler rollback --help` and `npx wrangler deployments list --help` (or `versions list`) on the pinned versions. Fix any command that differs.
- `actionlint .github/workflows/ci.yml`.
- Dispatch from a non-master branch (should show the deploy jobs skipped), then from `master` (should deploy). Do the `master` dispatch only as a deliberate re-deploy.

## API contract

None. Documentation and workflow trigger only.
