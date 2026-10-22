import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) {
  console.error('Config error: missing DATABASE_URL. Set it in backend/.env (see .env.example).');
  process.exit(1);
}

await migrate(drizzle(neon(process.env.DATABASE_URL)), {
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
});
console.log('Migrations applied.');
