# B05 - Expose admin blogs management API

- **Side:** backend
- **Size:** S
- **Status:** resolved
- **Depends on:** [B02 - Implement blogs repository and slug helper](b02-blogs-repository-slug-helper.md), [B04 - Add admin token auth middleware](b04-admin-token-auth-middleware.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/routes/adminBlogs.js`, mounted at `/api/admin/blogs`, behind `requireAdmin`.
- Use `validateQuery` from B03 with the shared pagination schema (page >= 1, pageSize 1-50, default 10) plus `status` (draft|published, optional). Validate `:id` with a params schema as a positive integer (`z.coerce.number().int().positive()`), stored on `res.locals.params`.
- Update the README.

## Acceptance criteria
- [x] All routes return 401 without a token.
- [x] After publish, the post appears in `GET /api/blogs`.
- [x] After unpublish, the post disappears from `GET /api/blogs`.
- [x] `:id` of abc, 0, -1 or 1.5 returns 400 `VALIDATION_ERROR`.
- [x] `pageSize=51` returns 400.

## Verification

- `curl` with the Bearer token: `-X POST .../blogs/1/publish`, then `curl localhost:3001/api/blogs` lists the post.
- `supertest` with a mocked repo.

## API contract

- `GET /api/admin/blogs?status=draft|published&page&pageSize`
  - `200` `{items:[{id,slug,title,excerpt,status,createdAt,publishedAt}],total,page,pageSize}`
- `GET /api/admin/blogs/:id`
  - Full record including `contentMd`, `sources`, `topic`, `runId`.
- `POST /api/admin/blogs/:id/publish` and `POST /api/admin/blogs/:id/unpublish`
  - `200` updated record. Idempotent.
- `DELETE /api/admin/blogs/:id`
  - `204`.
- Errors: `401` `UNAUTHORIZED`, `404` `NOT_FOUND`, `400` `VALIDATION_ERROR`.
