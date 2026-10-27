# r16 - CI workflow with backend job

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Create `.github/workflows/ci.yml`.
- Triggers: `push` and `pull_request`, on all branches.
- Job `backend`:
  - `runs-on: ubuntu-latest`
  - `actions/setup-node@v4` with `node-version: 22`, npm cache, and `cache-dependency-path: backend/package-lock.json`
  - job-level `defaults.run.working-directory: backend`
- Steps:
  1. `npm ci`
  2. `npm run lint`
  3. `npm test`
  4. `npm audit --omit=dev --audit-level=high`, with `continue-on-error: true` (D8)
- No secrets. Tests mock the SDK and use PGlite.

Files:

- `.github/workflows/ci.yml` (new)

## Acceptance criteria

- [ ] A PR shows a green `backend` check.
- [ ] A failing test turns the check red.
- [ ] A failing audit does not fail the job.

## Verification

- Push a branch and check the Actions tab.
- Optional: `act -j backend`.

## API contract

None.
