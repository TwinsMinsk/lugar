import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { redirects, user } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';
import { followRedirect, type RedirectMap } from '@/lib/redirects';

export type AdminRedirect = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
  /**
   * Where a visitor actually lands, after following any chain. Shown when it
   * differs from `toPath`, because a rule that looks right in isolation can
   * still send people somewhere else once another rule is added.
   */
  resolvesTo: string | null;
};

export async function listRedirects(): Promise<AdminRedirect[]> {
  await requireCapability('seo.write');

  const rows = await db
    .select({
      id: redirects.id,
      fromPath: redirects.fromPath,
      toPath: redirects.toPath,
      statusCode: redirects.statusCode,
      isActive: redirects.isActive,
      note: redirects.note,
      createdAt: redirects.createdAt,
      authorEmail: user.email,
    })
    .from(redirects)
    .leftJoin(user, eq(user.id, redirects.createdBy))
    .orderBy(desc(redirects.createdAt));

  const map: RedirectMap = {};
  for (const row of rows) {
    if (row.isActive) {
      map[row.fromPath] = {
        to: row.toPath,
        permanent: row.statusCode !== 302 && row.statusCode !== 307,
      };
    }
  }

  return rows.map((row) => {
    const resolved = row.isActive ? followRedirect(map, row.fromPath) : null;
    return {
      id: row.id,
      fromPath: row.fromPath,
      toPath: row.toPath,
      statusCode: row.statusCode,
      isActive: row.isActive,
      note: row.note,
      createdBy: row.authorEmail,
      createdAt: row.createdAt,
      resolvesTo: resolved && resolved.to !== row.toPath ? resolved.to : null,
    };
  });
}
