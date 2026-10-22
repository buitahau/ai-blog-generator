# F03 - Build public blog detail page

- **Side:** front-end
- **Size:** S
- **Status:** todo
- **Depends on:** [F01 - Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `pages/BlogDetailPage.jsx`:
  - Title and date.
  - `MarkdownView`.
  - A "Sources" list with external links (`noopener noreferrer`).
  - Missing post: antd `Result` 404.
  - Sets `document.title`.
- Consumes `GET /api/blogs/:slug`.

## Acceptance criteria
- [ ] Content is sanitized.
- [ ] A 404 does not crash the page.
- [ ] Back navigation keeps the list page number.

## Verification

- Tests with mocked fetch: 200 with sources, 404, network error.
- Manual: a draft slug shows the 404.

## API contract

Consumes `GET /api/blogs/:slug`. See [B03](b03-public-blogs-read-api.md).
