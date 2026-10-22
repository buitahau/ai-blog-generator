# F05 - Build admin blogs management page

- **Side:** front-end
- **Size:** M
- **Status:** resolved
- **Depends on:** [F01 - Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md), [F04 - Add admin token login and route guard](f04-admin-token-login-route-guard.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `pages/AdminBlogsPage.jsx`:
  - antd `Table`: title, status `Tag`, dates, actions.
  - Status filter.
  - Server-side pagination.
  - Filter, pagination, and status are all synced to the URL.
- Actions:
  - Preview: `Drawer` with `MarkdownView` and sources.
  - Publish and Unpublish: `Popconfirm` with a loading state.
  - Delete: `Popconfirm`.
  - Link to the public page when published.
- `?highlight=<id>` opens that post's preview automatically.
- Consumes `/api/admin/blogs*`.

## Acceptance criteria
- [x] Publishing updates the row without a reload.
- [x] Errors show `message.error`.
- [x] The highlight link opens the preview.

## Verification

- Tests with mocked fetch: filter param, publish flow, delete confirm, preview sanitization, highlight.
- Manual: publish a draft and confirm it appears on `/`.

## API contract

Consumes the admin blogs endpoints. See [B05](b05-admin-blogs-management-api.md).
