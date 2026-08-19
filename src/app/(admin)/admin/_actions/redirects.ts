'use server';

import { eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { tags } from '@/data/cache-tags';
import { db } from '@/db/client';
import { redirects } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';
import { failFromZod } from './_result';
import { redirectPathSchema, wouldLoop, type RedirectMap } from '@/lib/redirects';

/**
 * Redirect administration.
 *
 * Most rows here are written automatically when a slug changes. This screen
 * exists for the rest: URLs from a previous site, a printed leaflet, an ad
 * campaign — paths that never existed in this CMS and so can never be inferred.
 */
export type RedirectResult = { ok: true } | { ok: false; error: string };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

async function activeMap(): Promise<RedirectMap> {
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

const createSchema = z.object({
  fromPath: redirectPathSchema,
  toPath: redirectPathSchema,
  permanent: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

export async function createRedirect(input: z.input<typeof createSchema>): Promise<RedirectResult> {
  const { user: actor } = await requireCapability('seo.write');

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return failFromZod(parsed.error);
  }
  const { fromPath, toPath, permanent, note } = parsed.data;

  if (wouldLoop(await activeMap(), fromPath, toPath)) return { ok: false, error: 'loop' };

  const context = await requestContext();
  const statusCode = permanent ? 301 : 302;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(redirects)
        .values({
          fromPath,
          toPath,
          statusCode,
          note: note && note.length > 0 ? note : null,
          createdBy: actor.id,
        })
        .onConflictDoUpdate({
          target: redirects.fromPath,
          set: { toPath, statusCode, isActive: true, note: note ?? null },
        });

      await recordAudit(
        {
          actorUserId: actor.id,
          action: 'redirect.created',
          entityType: 'redirect',
          after: { fromPath, toPath, statusCode },
          ...context,
        },
        tx,
      );
    });
  } catch {
    return { ok: false, error: 'save_failed' };
  }

  updateTag(tags.redirects());
  return { ok: true };
}

export async function setRedirectActive(id: string, isActive: boolean): Promise<RedirectResult> {
  const { user: actor } = await requireCapability('seo.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [row] = await db.select().from(redirects).where(eq(redirects.id, id)).limit(1);
  if (!row) return { ok: false, error: 'not_found' };

  // Re-enabling can complete a cycle that was broken while it was off.
  if (isActive && wouldLoop(await activeMap(), row.fromPath, row.toPath)) {
    return { ok: false, error: 'loop' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(redirects).set({ isActive }).where(eq(redirects.id, id));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: isActive ? 'redirect.enabled' : 'redirect.disabled',
        entityType: 'redirect',
        entityId: id,
        after: { fromPath: row.fromPath, toPath: row.toPath },
        ...context,
      },
      tx,
    );
  });

  updateTag(tags.redirects());
  return { ok: true };
}

/**
 * Delete a rule.
 *
 * Deleting is offered as well as disabling because a redirect written for a
 * typo'd slug is noise, not history. Disabling is the safer default and is what
 * the UI leads with.
 */
export async function deleteRedirect(id: string): Promise<RedirectResult> {
  const { user: actor } = await requireCapability('seo.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [row] = await db.select().from(redirects).where(eq(redirects.id, id)).limit(1);
  if (!row) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.delete(redirects).where(eq(redirects.id, id));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'redirect.deleted',
        entityType: 'redirect',
        entityId: id,
        before: { fromPath: row.fromPath, toPath: row.toPath },
        ...context,
      },
      tx,
    );
  });

  updateTag(tags.redirects());
  return { ok: true };
}
