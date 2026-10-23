import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

let db;

// Lazy so importing this module (and tests) never requires DATABASE_URL.
export function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is not set');
    db = drizzle(neon(process.env.DATABASE_URL), { schema });
  }
  return db;
}
