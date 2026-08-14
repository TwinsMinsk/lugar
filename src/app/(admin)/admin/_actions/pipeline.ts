'use server';

import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db/client';
import { leadStatuses, leads } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Editing the sales pipeline.
 *
 * Owner-only under `settings.write`: a stage is not a piece of content, it is
 * the shape of everyone's CRM. Renaming one is safe at any time — nothing in
 * the code compares status slugs, only the flags — but removing one is not,
 * which is why archiving demands somewhere for the leads to go.
 */
export type PipelineResult = { ok: true } | { ok: false; error: string };

/** Steps of 100, so inserting between two stages is one UPDATE. */
const STEP = 100;

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * A slug nobody has to think about.
 *
 * It is an internal key — it appears in no URL and in no comparison — but a
 * readable one keeps the table legible for whoever debugs this later, which a
 * random id would not.
 */
function slugFor(label: string): string {
  const base = [...label.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `etap-${Date.now().toString(36)}`;
}

async function context() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

const labelSchema = z.object({
  ru: z.string().trim().min(1).max(60),
  es: z.string().trim().max(60).optional(),
  en: z.string().trim().max(60).optional(),
});

const createSchema = z.object({
  label: labelSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function createStage(input: z.input<typeof createSchema>): Promise<PipelineResult> {
  const { user: actor } = await requireCapability('settings.write');

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { label, color } = parsed.data;

  // Appended to the end. Where a new stage belongs in the funnel is a decision,
  // and guessing it wrong silently reorders someone's board.
  const [last] = await db
    .select({ sortOrder: leadStatuses.sortOrder })
    .from(leadStatuses)
    .orderBy(sql`${leadStatuses.sortOrder} desc`)
    .limit(1);

  let slug = slugFor(label.ru);
  const [taken] = await db
    .select({ id: leadStatuses.id })
    .from(leadStatuses)
    .where(eq(leadStatuses.slug, slug))
    .limit(1);
  if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const [created] = await db
    .insert(leadStatuses)
    .values({
      slug,
      label,
      color: color ?? '#8a8a8a',
      sortOrder: (last?.sortOrder ?? 0) + STEP,
    })
    .returning({ id: leadStatuses.id });

  await recordAudit({
    actorUserId: actor.id,
    action: 'pipeline.stage_created',
    entityType: 'lead_status',
    entityId: created!.id,
    after: { label, slug },
    ...(await context()),
  });

  return { ok: true };
}

const updateSchema = z.object({
  id: z.uuid(),
  label: labelSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isWon: z.boolean(),
  isLost: z.boolean(),
});

export async function updateStage(input: z.input<typeof updateSchema>): Promise<PipelineResult> {
  const { user: actor } = await requireCapability('settings.write');

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { id, label, color, isWon, isLost } = parsed.data;

  // Won and lost are mutually exclusive. A stage that is both makes every
  // conversion number computed from these flags meaningless.
  if (isWon && isLost) return { ok: false, error: 'won_and_lost' };

  const [existing] = await db
    .select({ id: leadStatuses.id, label: leadStatuses.label })
    .from(leadStatuses)
    .where(eq(leadStatuses.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: 'not_found' };

  await db
    .update(leadStatuses)
    // Terminal is derived, not asked. Won and lost are the ends of the funnel,
    // and letting the two disagree is how a closed lead keeps being counted as
    // open — the dashboard's "no movement" number would quietly include it.
    .set({ label, color, isWon, isLost, isTerminal: isWon || isLost, updatedAt: sql`now()` })
    .where(eq(leadStatuses.id, id));

  await recordAudit({
    actorUserId: actor.id,
    action: 'pipeline.stage_updated',
    entityType: 'lead_status',
    entityId: id,
    before: { label: existing.label },
    after: { label, isWon, isLost },
    ...(await context()),
  });

  return { ok: true };
}

/**
 * Make a stage the one new leads land on.
 *
 * A partial unique index allows only one, so the swap happens inside a
 * transaction — clearing the old first and setting the new second, never the
 * other way round.
 */
export async function setDefaultEntry(id: string): Promise<PipelineResult> {
  const { user: actor } = await requireCapability('settings.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [stage] = await db
    .select({ id: leadStatuses.id, archivedAt: leadStatuses.archivedAt })
    .from(leadStatuses)
    .where(eq(leadStatuses.id, id))
    .limit(1);
  if (!stage) return { ok: false, error: 'not_found' };
  if (stage.archivedAt) return { ok: false, error: 'archived' };

  await db.transaction(async (tx) => {
    await tx
      .update(leadStatuses)
      .set({ isDefaultEntry: false })
      .where(and(eq(leadStatuses.isDefaultEntry, true), ne(leadStatuses.id, id)));
    await tx.update(leadStatuses).set({ isDefaultEntry: true }).where(eq(leadStatuses.id, id));
  });

  await recordAudit({
    actorUserId: actor.id,
    action: 'pipeline.entry_changed',
    entityType: 'lead_status',
    entityId: id,
    ...(await context()),
  });

  return { ok: true };
}

/** Swap a stage with its neighbour. Keyboard-operable, no dragging required. */
export async function moveStage(id: string, direction: 'up' | 'down'): Promise<PipelineResult> {
  await requireCapability('settings.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const stages = await db
    .select({ id: leadStatuses.id, sortOrder: leadStatuses.sortOrder })
    .from(leadStatuses)
    .where(isNull(leadStatuses.archivedAt))
    .orderBy(asc(leadStatuses.sortOrder));

  const index = stages.findIndex((stage) => stage.id === id);
  if (index === -1) return { ok: false, error: 'not_found' };

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= stages.length) return { ok: true };

  const moving = stages[index]!;
  const neighbour = stages[target]!;

  await db.transaction(async (tx) => {
    await tx
      .update(leadStatuses)
      .set({ sortOrder: neighbour.sortOrder })
      .where(eq(leadStatuses.id, moving.id));
    await tx
      .update(leadStatuses)
      .set({ sortOrder: moving.sortOrder })
      .where(eq(leadStatuses.id, neighbour.id));
  });

  return { ok: true };
}

const archiveSchema = z.object({ id: z.uuid(), moveTo: z.uuid().optional() });

/**
 * Remove a stage from the board.
 *
 * Archived, never deleted: `leads.status_id` is a restricted foreign key, and
 * the history of closed deals still points at it. Leads sitting on the stage
 * must be given somewhere to go first — silently sweeping them to the entry
 * stage would resurrect finished work as new enquiries.
 */
export async function archiveStage(input: z.input<typeof archiveSchema>): Promise<PipelineResult> {
  const { user: actor } = await requireCapability('settings.write');

  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { id, moveTo } = parsed.data;

  const [stage] = await db.select().from(leadStatuses).where(eq(leadStatuses.id, id)).limit(1);
  if (!stage) return { ok: false, error: 'not_found' };
  if (stage.isDefaultEntry) return { ok: false, error: 'is_entry' };

  const active = await db
    .select({ id: leadStatuses.id })
    .from(leadStatuses)
    .where(isNull(leadStatuses.archivedAt));
  if (active.length <= 1) return { ok: false, error: 'last_stage' };

  const [held] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.statusId, id), isNull(leads.deletedAt)));
  const leadCount = held?.count ?? 0;

  if (leadCount > 0) {
    if (!moveTo) return { ok: false, error: 'needs_target' };
    if (moveTo === id) return { ok: false, error: 'invalid_input' };
    const [target] = await db
      .select({ id: leadStatuses.id })
      .from(leadStatuses)
      .where(and(eq(leadStatuses.id, moveTo), isNull(leadStatuses.archivedAt)))
      .limit(1);
    if (!target) return { ok: false, error: 'unknown_target' };
  }

  const requestContext = await context();

  await db.transaction(async (tx) => {
    if (leadCount > 0 && moveTo) {
      await tx
        .update(leads)
        .set({ statusId: moveTo, statusChangedAt: sql`now()`, lastActivityAt: sql`now()` })
        .where(and(eq(leads.statusId, id), isNull(leads.deletedAt)));
    }
    await tx
      .update(leadStatuses)
      .set({ archivedAt: sql`now()`, isDefaultEntry: false })
      .where(eq(leadStatuses.id, id));

    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'pipeline.stage_archived',
        entityType: 'lead_status',
        entityId: id,
        before: { label: stage.label },
        after: { movedLeads: leadCount, moveTo: moveTo ?? null },
        ...requestContext,
      },
      tx,
    );
  });

  return { ok: true };
}

/** Bring an archived stage back, at the end of the funnel. */
export async function restoreStage(id: string): Promise<PipelineResult> {
  const { user: actor } = await requireCapability('settings.write');
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'invalid_input' };

  const [last] = await db
    .select({ sortOrder: leadStatuses.sortOrder })
    .from(leadStatuses)
    .where(isNull(leadStatuses.archivedAt))
    .orderBy(sql`${leadStatuses.sortOrder} desc`)
    .limit(1);

  const restored = await db
    .update(leadStatuses)
    .set({ archivedAt: null, sortOrder: (last?.sortOrder ?? 0) + STEP })
    .where(and(eq(leadStatuses.id, id), sql`${leadStatuses.archivedAt} is not null`))
    .returning({ id: leadStatuses.id });

  if (restored.length === 0) return { ok: false, error: 'not_found' };

  await recordAudit({
    actorUserId: actor.id,
    action: 'pipeline.stage_restored',
    entityType: 'lead_status',
    entityId: id,
    ...(await context()),
  });

  return { ok: true };
}
