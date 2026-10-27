# r17 - Front-end CI job

- **Status:** TBD
- **Side:** front-end
- **Size:** S
- **Depends on:** [r16 - CI workflow with backend job](r16-ci-workflow-with-backend-job.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- Add a `frontend` job to the same `.github/workflows/ci.yml`.
- Same setup as the backend job, with `frontend/package-lock.json` as the cache path and `frontend` as the working directory.
- Steps: `npm ci`, lint, test, build, and a non-blocking audit (D8).
- Note for CD: the deploy jobs from [r31](r31-cd-workflow-deploy-on-merge-to-master.md) build on this job. `deploy-frontend` needs `frontend`, so a lint, test or build failure here blocks the Worker deploy.

Files:

- `.github/workflows/ci.yml`

## Acceptance criteria

- [ ] The PR check is green.
- [ ] A lint error turns the check red.
- [ ] The build step runs.

## Verification

- Push a change with an unused variable in `frontend/src/`, confirm the failure, then revert.

## API contract

None.
