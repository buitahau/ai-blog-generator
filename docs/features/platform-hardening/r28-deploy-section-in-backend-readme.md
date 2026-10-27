# r28 - Deploy section in the backend README

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** [r04 - Add TRUST_PROXY config](r04-add-trust-proxy-config.md), [r27 - Fix backend and root docs (removed endpoint, rate limits, TRUST_PROXY)](r27-fix-backend-and-root-docs.md), [r29 - Fly.io backend packaging](r29-fly-io-backend-packaging.md), [r30 - Cloudflare Worker for frontend and API proxy](r30-cloudflare-worker-frontend-and-api-proxy.md)
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

Add a `## Deploy` section to `backend/README.md`. This is documentation only (D7).

- Recommended production path: a Cloudflare Worker that serves the SPA and proxies `/api/*` to the backend on Fly.io (see [r29](r29-fly-io-backend-packaging.md) to [r33](r33-one-time-setup-runbook.md)). The nginx example below is the generic alternative for a single host.
- The backend does not serve `frontend/dist` and has no CORS. Put both behind one origin.
- nginx example (the `X-Forwarded-For` line is added here: without it, `TRUST_PROXY` has nothing to read):

  ```nginx
  # SPA
  root .../frontend/dist;
  try_files $uri /index.html;

  # API (SSE)
  location /api/ {
      proxy_pass http://127.0.0.1:3001;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_buffering off;
      proxy_read_timeout 1h;
      gzip off;
  }
  ```

- Set `TRUST_PROXY` to the number of proxy hops. The hop count depends on topology; see [r33](r33-one-time-setup-runbook.md). With the single nginx above it is 1; with the Worker in front of Fly it is measured in r33.
- Run `npm run db:migrate` before start.
- SIGTERM stops the server gracefully, within 10 s.
- Link to this section from `frontend/README.md:31`.

Files:

- `backend/README.md`
- `frontend/README.md`

## Acceptance criteria

- [ ] The section covers the SPA fallback.
- [ ] The section covers SSE unbuffering.
- [ ] The section covers `TRUST_PROXY`, and says the hop count depends on topology (see r33).
- [ ] The section covers the single origin.
- [ ] The section names the Worker + Fly path as the recommended production path, and nginx as the alternative.
- [ ] The nginx example sets `X-Forwarded-For`.
- [ ] The link from `frontend/README.md:31` works.

## Verification

- A reviewer follows the nginx snippet locally: `npm run build`, nginx in Docker. A deep link to `/admin/generate` loads, and a run streams live.

## API contract

None. Documentation only.
