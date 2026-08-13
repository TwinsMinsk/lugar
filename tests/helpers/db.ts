import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { db } from '@/db/client';

/**
 * Test-database helpers.
 *
 * Integration tests run against a dedicated `lugar_test` database on the same
 * local Postgres, created on demand. Using a separate database rather than a
 * transaction-per-test matters here: several invariants under test are
 * DEFERRABLE-free constraint violations that abort the surrounding
 * transaction, so a shared outer transaction would poison subsequent
 * assertions.
 */
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? 'postgresql://lugar:lugar@localhost:5432/postgres';

function testDatabaseName(): string {
  const url = new URL(process.env.DATABASE_URL!);
  return url.pathname.replace(/^\//, '');
}

let migrated = false;

export async function migrateTestDatabase(): Promise<void> {
  if (migrated) return;

  const name = testDatabaseName();
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  const runner = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(runner), { migrationsFolder: './drizzle' });
  } finally {
    await runner.end({ timeout: 5 });
  }

  migrated = true;
}

/** Empties every application table, leaving the schema and migrations intact. */
export async function resetTestDatabase(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  if (tables) {
    await db.execute(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
}
