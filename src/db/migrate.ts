/**
 * Migration runner.
 *
 * Run locally with `npm run db:migrate`. On Railway this is wired as the
 * service's **pre-deploy step**, so it executes between build and deploy with
 * access to the private network, and a failed migration blocks the release
 * rather than shipping a schema mismatch.
 *
 * Uses its own single-connection client and closes it, so the process exits
 * cleanly instead of hanging on an open pool.
 */
import '../../scripts/load-env';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const started = Date.now();
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log(`Migrations applied in ${Date.now() - started}ms.`);
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
