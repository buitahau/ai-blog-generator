# F01 - Add routing, public/admin layouts and shared MarkdownView

- **Side:** front-end
- **Size:** M
- **Status:** todo
- **Depends on:** none
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- Add `react-router-dom`.
- Routes:
  - `/`
  - `/blogs/:slug`
  - `/admin/login`
  - `/admin/generate`
  - `/admin/blogs`
  - `*` renders an antd `Result` 404.
- `src/pages/` and `src/layouts/`:
  - `PublicLayout`.
  - `AdminLayout` with a Sider and a Menu: Generate, Blogs, Logout.
- Extract `components/MarkdownView.jsx` from `BlogOutput.jsx`.
- The old form page leaves the routes. Its tests still pass.
- Update the layout sections of the frontend `CLAUDE.md` and README.

## Acceptance criteria
- [ ] Deep links work in the Vite dev server.
- [ ] `MarkdownView` strips scripts, event handlers, and `javascript:` links.
- [ ] No `rehype-raw` and no `dangerouslySetInnerHTML`.

## Verification

- `npm test` with a `MarkdownView` XSS test and a router test that renders each route.
- `npm run dev`: `/admin/blogs` shows the admin layout. `/nope` shows the 404.

## API contract

None.
