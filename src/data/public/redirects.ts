import 'server-only';

import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db/client';
import { redirects } from '@/db/schema';
import { followRedirect, type RedirectMap, type RedirectTarget } from '@/lib/redirects';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

/**
 * Serving the redirect table.
 *
 * Redirects are resolved **only after a path fails to resolve to a document**,
 * never before. That ordering is the whole design: a live page always wins over
 * a historical redirect, so an old entry can never shadow a page later created
 * at the same URL, and slug history is safe to keep forever.
 *
 * Doing this in `proxy.ts` instead would put a lookup on every request to every
 * URL and would give the stale entry priority over the real page — the opposite
 * of what slug history should do.
 */

/**
 * The whole active map, cached as one entry.
 *
 * One row per slug rename, so this stays at tens of rows for the life of the
 * site; loading it whole costs less than a per-path query and — unlike a cache
 * keyed by the requested path — cannot be grown by outside traffic hitting
 * random 404s.
 */
async function getRedirectMap(): Promise<RedirectMap> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.redirects());

  const rows = await db
    .select({
      fromPath: redirects.fromPath,
      toPath: redirects.toPath,
      statusCode: redirects.statusCode,
    })
    .from(redirects)
    .where(eq(redirects.isActive, true));

  const map: RedirectMap = {};
  for (const row of rows) {
    map[row.fromPath] = {
      to: row.toPath,
      permanent: row.statusCode !== 302 && row.statusCode !== 307,
    };
  }
  return map;
}

export async function resolveRedirect(path: string): Promise<RedirectTarget | null> {
  return followRedirect(await getRedirectMap(), path);
}
