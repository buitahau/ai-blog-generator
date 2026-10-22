# F04 - Add admin token login and route guard

- **Side:** front-end
- **Size:** S
- **Status:** resolved
- **Depends on:** [F01 - Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/api/auth.js`:
  - Stores the token in `sessionStorage`: `getToken`, `setToken`, `clearToken`.
  - `checkToken()` calls `GET /api/admin/session`.
- `src/api/admin.js` sends `Authorization: Bearer` on every admin call. On 401 it clears the token and rejects with `{code:'UNAUTHORIZED', message}`. It never navigates, because `src/api` stays pure calls. `RequireAdmin` (or an `onUnauthorized` handler in `useAdminSession`) redirects to `/admin/login?next=<current path>`.
- `components/RequireAdmin.jsx`.
- `pages/AdminLoginPage.jsx`: antd `Form` with `Input.Password`. A wrong token shows `message.error` and is not stored.

## Acceptance criteria
- [x] `/admin/generate` without a token redirects to `/admin/login?next=…`, and returns there after login.
- [x] Logout clears the token.
- [x] The token never appears in `localStorage`, URLs, or logs.

## Verification

- Tests with mocked fetch:
  - Redirect.
  - Successful check navigates to `next`.
  - Wrong token.
  - A later 401: `api/admin.js` rejects with `UNAUTHORIZED` and clears the token without navigating; the guard redirects, keeping `?next=`.

## API contract

Consumes `GET /api/admin/session`. See [B04](b04-admin-token-auth-middleware.md).
