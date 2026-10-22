# B03 - Expose public blogs read API

- **Side:** backend
- **Size:** S
- **Status:** todo
- **Depends on:** [B02 - Implement blogs repository and slug helper](b02-blogs-repository-slug-helper.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- `src/routes/blogs.js`, mounted at `/api/blogs`.
- zod query schema in `src/validation/blogsSchema.js` plus `validateQuery(schema)` in `middleware/validate.js`. It stores the parsed result on `res.locals.query` and never assigns `req.query`, which is getter-only in Express 5 and throws TypeError when assigned. Handlers read `res.locals.query`. Export `PAGE_SIZE_MAX = 50` and the shared pagination schema for B05.
- The route receives the repo as a parameter so it can be mocked.
- Update the README contract.

## Acceptance criteria
- [ ] Drafts are never visible.
- [ ] Unknown query params are rejected.
- [ ] Responses are camelCase.
- [ ] DB errors return `500 INTERNAL_ERROR` without internals.
- [ ] A test proves `validateQuery` works on Express 5 (no TypeError) and that defaults are applied.

## Verification

- `curl 'localhost:3001/api/blogs?page=1&pageSize=2'`
- A draft slug returns 404.
- `?pageSize=500` returns 400.
- `supertest` with `test/blogs.test.js` and a mocked repo.

## API contract

- `GET /api/blogs?page=1&pageSize=10`
  - `page >= 1`, `pageSize` 1-50, default 10.
  - `200` `{items:[{id,slug,title,excerpt,publishedAt}],total,page,pageSize}`
- `GET /api/blogs/:slug`
  - `200` `{id,slug,title,contentMd,sources:[{title,url}],publishedAt}`
  - Draft or missing: `404` `NOT_FOUND`.
- Bad query: `400` `VALIDATION_ERROR` with `details`.
