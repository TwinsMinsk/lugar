import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { rateLimits } from '@/db/schema';

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * Fixed window rather than sliding: for a lead form on a small business site
 * the burst allowance at a window boundary is irrelevant, and a single atomic
 * upsert is far cheaper — and far easier to reason about — than maintaining a
 * sorted set of timestamps.
 *
 * Failure is deliberately open. If the limiter itself errors, the submission
 * proceeds: losing a genuine enquiry because a counter table was briefly
 * unavailable is a worse outcome than admitting one spam message.
 */
export type RateLimitResult = { allowed: boolean; remaining: number };

export async function consumeRateLimit(
  keys: string[],
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (keys.length === 0) return { allowed: true, remaining: limit };

  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);

  try {
    let worstRemaining = limit;

    for (const key of keys) {
      const [row] = await db
        .insert(rateLimits)
        .values({ key, windowStart, count: 1, expiresAt })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });

      const used = row?.count ?? 1;
      worstRemaining = Math.min(worstRemaining, Math.max(0, limit - used));
      if (used > limit) return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: worstRemaining };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/** Housekeeping for expired windows. Runs from the scheduled maintenance job. */
export async function pruneRateLimits(): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, new Date()))
    .returning({ key: rateLimits.key });
  return deleted.length;
}

/** Current count for a key, without consuming. Used by tests. */
export async function peekRateLimit(key: string, windowSeconds: number): Promise<number> {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  return row?.count ?? 0;
}
