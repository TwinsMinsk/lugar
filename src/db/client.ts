import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/env';
import * as schema from './schema';

/**
 * Postgres connection.
 *
 * Pool sizing is deliberate and small. Railway Postgres has a finite
 * `max_connections` shared across every service, and the outbox worker runs as
 * a second service with its own pool. Web (5) + worker (3) leaves ample
 * headroom; an unbounded default pool times replica count is the classic way
 * this stack falls over under a traffic spike.
 *
 * In development Next.js hot-reloads modules on every edit, which would leak a
 * new pool per reload — so the client is cached on globalThis there.
 */
/**
 * Which database to talk to.
 *
 * Prerendering reads published content, so `next build` needs the database —
 * and a Railway build container cannot reach the private network the database
 * lives on. Pointing DATABASE_URL at the public proxy would fix the build and
 * tax every runtime query with a trip out of the network and back, forever, to
 * solve a problem that only exists for a few minutes during a build.
 *
 * So the build gets its own connection string when one is provided, and
 * everything else keeps the private address. `NEXT_PHASE` is set by Next itself
 * and is only ever `phase-production-build` while building.
 */
function connectionString(): string {
  const buildUrl = env.DATABASE_URL_BUILD;
  if (buildUrl && process.env.NEXT_PHASE === 'phase-production-build') return buildUrl;
  return env.DATABASE_URL;
}

const createClient = () =>
  postgres(connectionString(), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // Railway's private network (postgres.railway.internal) has reported DNS
    // flakiness; a bounded retry beats a hard boot failure.
    max_lifetime: 60 * 30,
    // `prepare: false` is only required behind PgBouncer in transaction mode.
    // Railway Postgres is unpooled by default, so prepared statements stay on.
    onnotice: () => {},
  });

type Sql = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as { __lugarSql?: Sql };

const sql: Sql = globalForDb.__lugarSql ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__lugarSql = sql;
}

export const db = drizzle(sql, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { sql as pgClient, schema };
