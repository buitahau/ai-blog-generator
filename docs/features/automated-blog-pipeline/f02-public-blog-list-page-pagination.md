# F02 - Build public blog list page with pagination

- **Side:** front-end
- **Size:** S
- **Status:** todo
- **Depends on:** [F01 - Add routing, public/admin layouts and shared MarkdownView](f01-routing-layouts-shared-markdown-view.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/api/blogs.js` exports `listBlogs` and `getBlog`, with shared error normalising.
- `pages/BlogListPage.jsx`:
  - antd `List` of `Card`s and `Pagination`, synced with `?page=`.
  - States: Skeleton, Empty, and an error `Alert` with Retry.
  - Changing the page aborts the previous request.
- Consumes `GET /api/blogs`.

## Acceptance criteria
- [ ] `/?page=2` loads page 2.
- [ ] A card links to the detail page.
- [ ] An out-of-range page shows the empty state.

## Verification

- Tests with mocked fetch: list, page change, error with Retry.
- Manual: 12 published posts give 2 pages.

## API contract

Consumes `GET /api/blogs`. See [B03](b03-public-blogs-read-api.md).
