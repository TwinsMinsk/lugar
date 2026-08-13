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
const createClient = () =>
  postgres(env.DATABASE_URL, {
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
