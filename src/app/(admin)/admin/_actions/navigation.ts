'use server';

import { and, asc, eq, max } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { MENUS } from '@/data/admin/navigation';
import { db } from '@/db/client';
import { navigationItems } from '@/db/schema';
import { LOCALES } from '@/i18n/routing';
import { recordAudit } from '@/lib/audit';
import { invalidatePublicPages } from '@/lib/cache-invalidation';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Menu editing.
 *
 * Items point at a document by id, never by slug, so renaming a page in one
 * locale cannot break the menu in another. The three link kinds are mutually
 * exclusive by construction — a discriminated union rather than three nullable
 * columns the caller might fill in together.
 */
export type NavigationResult = { ok: true } | { ok: false; error: string };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

const labelSchema = z
  .object(Object.fromEntries(LOCALES.map((locale) => [locale, z.string().trim().max(60).optional()])))
  .refine((value) => Boolean((value as Record<string, string>).ru?.trim()), {
    message: 'ru_required',
  });

/**
 * Where an item points.
 *
 * External URLs are restricted to http(s): a `javascript:` href in a menu is
 * stored XSS on every page of the site.
 */
const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), documentId: z.uuid() }),
  z.object({
    kind: z.literal('external'),
    externalUrl: z
      .string()
      .trim()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), { message: 'http_only' }),
  }),
  z.object({
    kind: z.literal('anchor'),
    anchor: z
      .string()
      .trim()
      .regex(/^#[a-z0-9-]{1,60}$/i, 'anchor_format'),
  }),
]);

function targetColumns(target: z.infer<typeof targetSchema>) {
  return {
    documentId: target.kind === 'document' ? target.documentId : null,
    externalUrl: target.kind === 'external' ? target.externalUrl : null,
    anchor: target.kind === 'anchor' ? target.anchor : null,
  };
}

const createSchema = z.object({
  menu: z.enum(MENUS),
  label: labelSchema,
  target: targetSchema,
});

export async function createNavigationItem(
  input: z.input<typeof createSchema>,
): Promise<NavigationResult> {
  const { user: actor } = await requireCapability('navigation.write');

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }
  const { menu, label, target } = parsed.data;

  const [highest] = await db
    .select({ value: max(navigationItems.sortOrder) })
    .from(navigationItems)
    .where(eq(navigationItems.menu, menu));

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.insert(navigationItems).values({
      menu,
      label,
      sortOrder: (highest?.value ?? 0) + 10,
      ...targetColumns(target),
    });

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'navigation.updated',
        entityType: 'navigation',
        after: { menu, added: label.ru },
        ...context,
      },
      tx,
    );
  });

  // The menu is in the layout, so every public route renders it.
  await invalidatePublicPages();
  return { ok: true };
}

const updateSchema = z.object({
  id: z.uuid(),
  label: labelSchema,
  target: targetSchema,
  isVisible: z.boolean(),
});

export async function updateNavigationItem(
  input: z.input<typeof updateSchema>,
): Promise<NavigationResult> {
  const { user: actor } = await requireCapability('navigation.write');

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }
  const { id, label, target, isVisible } = parsed.data;

  const [existing] = await db
    .select()
    .from(navigationItems)
    .where(eq(navigationItems.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(navigationItems)
      .set({ label, isVisible, ...targetColumns(target) })
      .where(eq(navigationItems.id, id));

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'navigation.updated',
        entityType: 'navigation',
        entityId: id,
        before: { label: (existing.label as { ru?: string }).ru, visible: existing.isVisible },
        after: { label: label.ru, visible: isVisible },
        ...context,
      },
      tx,
    );
  });

  // The menu is in the layout, so every public route renders it.
  await invalidatePublicPages();
  return { ok: true };
}

const moveSchema = z.object({
  id: z.uuid(),
  /** 1-based, as shown in the position control. */
  position: z.number().int().min(1).max(200),
});

/**
 * Move an item to an absolute position.
 *
 * Absolute rather than "up one" because that is what a keyboard user and a
 * screen reader can actually operate: the position control is a `<select>`
 * reading "3 из 7". The up/down buttons in the UI call this too, so there is
 * one reordering path rather than two that can disagree.
 *
 * Sort orders are renumbered on every move. The lists are a handful of items,
 * and contiguous numbering means the stored order always matches what was on
 * screen — no gap arithmetic to get subtly wrong.
 */
export async function moveNavigationItem(
  input: z.input<typeof moveSchema>,
): Promise<NavigationResult> {
  const { user: actor } = await requireCapability('navigation.write');

  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { id, position } = parsed.data;

  const [item] = await db
    .select()
    .from(navigationItems)
    .where(eq(navigationItems.id, id))
    .limit(1);
  if (!item) return { ok: false, error: 'not_found' };

  const siblings = await db
    .select({ id: navigationItems.id })
    .from(navigationItems)
    .where(eq(navigationItems.menu, item.menu))
    .orderBy(asc(navigationItems.sortOrder));

  const from = siblings.findIndex((row) => row.id === id);
  if (from === -1) return { ok: false, error: 'not_found' };

  const to = Math.min(Math.max(position - 1, 0), siblings.length - 1);
  if (to === from) return { ok: true };

  const reordered = [...siblings];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const [index, row] of reordered.entries()) {
      await tx
        .update(navigationItems)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(navigationItems.id, row.id));
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'navigation.updated',
        entityType: 'navigation',
        entityId: id,
        before: { position: from + 1 },
        after: { position: to + 1, menu: item.menu },
        ...context,
      },
      tx,
    );
  });

  // The menu is in the layout, so every public route renders it.
  await invalidatePublicPages();
  return { ok: true };
}

export async function deleteNavigationItem(id: string): Promise<NavigationResult> {
  const { user: actor } = await requireCapability('navigation.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [item] = await db
    .select()
    .from(navigationItems)
    .where(eq(navigationItems.id, id))
    .limit(1);
  if (!item) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    // Children would otherwise be orphaned into an invisible sub-tree.
    await tx.delete(navigationItems).where(eq(navigationItems.parentId, id));
    await tx.delete(navigationItems).where(eq(navigationItems.id, id));

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'navigation.updated',
        entityType: 'navigation',
        entityId: id,
        before: { menu: item.menu, removed: (item.label as { ru?: string }).ru },
        ...context,
      },
      tx,
    );
  });

  // The menu is in the layout, so every public route renders it.
  await invalidatePublicPages();
  return { ok: true };
}

/** Convenience for the up/down buttons, which are the common case. */
export async function nudgeNavigationItem(
  id: string,
  direction: 'up' | 'down',
): Promise<NavigationResult> {
  await requireCapability('navigation.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [item] = await db
    .select({ menu: navigationItems.menu })
    .from(navigationItems)
    .where(eq(navigationItems.id, id))
    .limit(1);
  if (!item) return { ok: false, error: 'not_found' };

  const siblings = await db
    .select({ id: navigationItems.id })
    .from(navigationItems)
    .where(and(eq(navigationItems.menu, item.menu)))
    .orderBy(asc(navigationItems.sortOrder));

  const index = siblings.findIndex((row) => row.id === id);
  if (index === -1) return { ok: false, error: 'not_found' };

  const target = direction === 'up' ? index : index + 2;
  return moveNavigationItem({ id, position: Math.min(Math.max(target, 1), siblings.length) });
}
