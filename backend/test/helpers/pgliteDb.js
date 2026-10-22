import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '../../src/db/schema.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// In-memory Postgres built from the same migration files that run on Neon.
export async function createPgliteDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, client };
}
