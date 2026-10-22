# B02 - Implement blogs repository and slug helper

- **Side:** backend
- **Size:** M
- **Status:** todo
- **Depends on:** [B01 - Add Neon + Drizzle schema, client and migrations](b01-neon-drizzle-schema-migrations.md)
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

`src/db/blogsRepo.js` exports `createBlogsRepo(db)`, which takes the DB instance as a parameter so it can be injected. It provides:

- `createDraft({title, excerpt, contentMd, topic, sources, runId})`
- `getById`
- `getPublishedBySlug`
- `listPublished({page, pageSize})`
- `listAll({status, page, pageSize})` returns `{items, total, page, pageSize}`
- `setStatus(id, status)`: sets or clears `published_at`, bumps `updated_at`
- `remove(id)`

Slug uniqueness:

- Insert; on a unique violation retry with -2, -3… up to 5 times. Detect with `const code = err?.cause?.code ?? err?.code; code === '23505'`, because drizzle-orm >= 0.44 wraps driver errors in DrizzleQueryError with the driver error in .cause.
- No check-then-insert race.

`src/lib/slug.js` exports `slugify()`:

- NFD normalization, strip diacritics, `đ` -> `d`.
- kebab-case.
- Max 80 characters.
- Fallback `'post'`.

The default `blogsRepo` is bound to `getDb()`.

## Acceptance criteria
- [ ] `listPublished` never returns drafts.
- [ ] Publish sets `published_at`. Unpublish clears it.
- [ ] `slugify('Tối ưu Đà Nẵng!')` = `'toi-uu-da-nang'`. Duplicates get `-2`.
- [ ] Out-of-range pages return empty items with the correct total.

## Verification

- `npm test` with `test/blogsRepo.test.js` (PGlite) and `test/slug.test.js`, covering pagination, status filter, publish timestamps, collision retry, and Vietnamese titles.
- The collision test runs on PGlite through the real Drizzle error path, not a hand-made error object.

## API contract

None. Internal repository interface.
