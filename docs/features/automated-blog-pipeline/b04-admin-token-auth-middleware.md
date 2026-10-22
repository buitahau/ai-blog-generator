# B04 - Add admin token auth middleware

- **Side:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** none
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/middleware/requireAdmin.js` reads `Authorization: Bearer <token>`.
- Compares `sha256(given)` with `sha256(ADMIN_TOKEN)` using `crypto.timingSafeEqual`.
- `GET /api/admin/session` sits behind this middleware and returns `204`.
- `assertConfig()` requires `ADMIN_TOKEN` to be at least 32 characters.
- Update `.env.example` and the README.

## Acceptance criteria
- [x] Missing header, wrong scheme, wrong token, and empty `ADMIN_TOKEN` all return 401.
- [x] The token is never logged.
- [x] Config tests still import without the env var.

## Verification

- `curl -i localhost:3001/api/admin/session` returns 401.
- `curl -i -H "Authorization: Bearer $ADMIN_TOKEN" localhost:3001/api/admin/session` returns 204.
- `test/requireAdmin.test.js`.

## API contract

- `GET /api/admin/session` with a valid Bearer token: `204`.
- Missing or wrong token: `401` `{error:{code:'UNAUTHORIZED',message}}`.
