/**
 * Migrations, run before `next build` reads the schema.
 *
 * The deploy order on Railway is: build → pre-deploy → start. Migrations live
 * in the pre-deploy step, which is the right place for them at *runtime* — a
 * failed migration blocks the release instead of shipping a mismatch.
 *
 * But `next build` prerenders pages, and prerendering runs the real queries
 * against the real database over the public proxy. So the build reads the
 * schema a step *before* the migration that the same commit depends on. Adding
 * a column and a query that uses it in one commit therefore failed the build
 * with `column documents.archived_at does not exist` — the code was correct,
 * the ordering was not.
 *
 * This runs the same migrations against the build-time connection, so the
 * schema is current by the time anything is prerendered. It is wired as npm's
 * `prebuild`, which means it happens for `npm run build` wherever that runs.
 *
 * Deliberately a no-op unless DATABASE_URL_BUILD is set. That variable means
 * exactly "the database this build talks to", and it is set only where a build
 * genuinely prerenders against a deployed database — never locally, where
 * `npm run build` is run by the end-to-end suite and must not touch anything.
 *
 * The pre-deploy migration stays where it is. Migrations are idempotent, so it
 * becomes a fast no-op after this, and it remains the safety net for a deploy
 * whose build had no database to reach.
 */
import './load-env';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL_BUILD?.trim();

if (!url) {
  console.log('prebuild: DATABASE_URL_BUILD is not set — nothing to migrate before the build.');
  process.exit(0);
}

const sql = postgres(url, { max: 1, connect_timeout: 30, onnotice: () => {} });

try {
  const started = Date.now();
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log(`prebuild: migrations applied in ${Date.now() - started}ms.`);
} catch (error) {
  // Fail the build. A build that prerenders against a schema it does not match
  // produces pages that are wrong in ways nothing downstream can detect.
  console.error('prebuild: migration failed, refusing to build against a stale schema:', error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
