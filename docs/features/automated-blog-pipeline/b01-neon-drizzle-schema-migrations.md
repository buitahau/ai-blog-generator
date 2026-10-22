# B01 - Add Neon + Drizzle schema, client and migrations

- **Side:** backend
- **Size:** M
- **Status:** todo
- **Depends on:** none
- **Requirement:** [Automated blog pipeline](00-requirement.md)

## Description

- Add `drizzle-orm` and `@neondatabase/serverless`. Dev dependencies: `drizzle-kit` and `@electric-sql/pglite`.
- `backend/drizzle.config.js`: `defineConfig({ dialect: 'postgresql', schema: './src/db/schema.js', out: './drizzle', dbCredentials: { url: process.env.DATABASE_URL } })`.
- Schema:
  - `pgEnum` `blog_status` with values `'draft'` and `'published'`.
  - Table `blogs`:
    - `id`: identity primary key.
    - `slug`: text, unique.
    - `title`, `excerpt`, `content_md`, `topic`.
    - `sources`: jsonb, default `'[]'`.
    - `status`: `blog_status`.
    - `run_id`: uuid.
    - `created_at`, `updated_at`: timestamptz, default `now()`.
    - `published_at`: timestamptz, nullable.
  - Index on `(status, published_at desc)`.
- `src/db/client.js` has a lazy `getDb()` that returns `drizzle(neon(DATABASE_URL))`. Importing the module must not require the env var.
- Scripts: `db:generate` = `drizzle-kit generate`; `db:migrate` = `node scripts/migrate.js`, which calls `migrate(drizzle(neon(DATABASE_URL)), { migrationsFolder: 'drizzle' })` from `drizzle-orm/neon-http/migrator` (mirrors the PGlite helper, which uses `drizzle-orm/pglite/migrator`).
- `assertConfig()` also requires `DATABASE_URL`.
- `test/helpers/pgliteDb.js` creates a PGlite Drizzle instance that applies the migrations in `drizzle/`.
- Update `.env.example` and the README.

## Acceptance criteria
- [ ] `db:generate` produces a committed SQL migration.
- [ ] `db:migrate` applies it to a Neon branch.
- [ ] Tests import the config and DB modules without `DATABASE_URL`.
- [ ] The PGlite helper builds the schema from the same migration files.
- [ ] `npm ci` succeeds on Linux.

## Verification

- Against a Neon dev branch: `DATABASE_URL=… npm run db:migrate`, then `psql "$DATABASE_URL" -c '\d blogs'` shows the columns, enum, and indexes.
- `npm test` with the new `test/db.test.js` inserting and selecting via PGlite.

## API contract

None.
