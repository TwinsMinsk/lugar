import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import journal from '../../../../drizzle/meta/_journal.json';
import { db } from '@/db/client';
import { env } from '@/env';

/**
 * What "healthy" means for this deploy.
 *
 * Railway used to point its health check at `/robots.txt`, which is a static
 * file: a release whose database was unreachable, or whose migrations had not
 * run, answered that check instantly and was rolled out — and then served 500s
 * to visitors. A health check that cannot fail is a health check that does
 * nothing.
 *
 * Two questions, both of which have to be answered before a release should
 * take traffic:
 *
 *  1. Is the database reachable at all.
 *  2. Has every migration this build expects actually been applied. The
 *     expected count comes from the journal compiled into the bundle rather
 *     than from the `drizzle/` folder, which the standalone output does not
 *     carry — a file read would fail in exactly the environment this runs in.
 *
 * Deliberately not checked: object storage. A health check runs on a schedule
 * and a write round-trip against the bucket on every poll is a cost with no
 * new information — `npm run preflight` does that once, before a deploy, where
 * it belongs.
 *
 * The body is JSON and says which check failed, because the point of a red
 * health check is that somebody can read it and know where to look.
 */
// No route segment config here: `dynamic` was removed in this version when
// Cache Components is enabled — the build refuses it outright — and it is not
// needed anyway, since a handler that queries the database outside a
// `'use cache'` scope is dynamic already.
const EXPECTED_MIGRATIONS = journal.entries.length;

export async function GET() {
  const checks: Record<string, string> = {};

  try {
    await db.execute(sql`select 1`);
    checks.database = 'ok';
  } catch (error) {
    checks.database = error instanceof Error ? error.message : 'unreachable';
    return NextResponse.json({ status: 'error', checks }, { status: 503 });
  }

  try {
    const [row] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    const applied = Number(row?.count ?? 0);
    checks.migrations = `${applied}/${EXPECTED_MIGRATIONS}`;
    if (applied < EXPECTED_MIGRATIONS) {
      return NextResponse.json({ status: 'error', checks }, { status: 503 });
    }
  } catch (error) {
    // The table is created by the first migration, so its absence means none
    // have run — which is a failure, not a missing feature.
    checks.migrations = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ status: 'error', checks }, { status: 503 });
  }

  checks.storage = env.STORAGE_DRIVER === 'local' ? 'local' : 's3';

  return NextResponse.json({ status: 'ok', checks }, { headers: { 'cache-control': 'no-store' } });
}
