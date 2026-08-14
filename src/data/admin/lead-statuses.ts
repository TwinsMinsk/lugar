import 'server-only';

import { asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { leadStatuses, leads } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Reading the pipeline definition.
 *
 * Kept apart from the lead queries because this is configuration, not data: it
 * changes rarely, and it is read by every board render.
 */
export type PipelineStage = {
  id: string;
  slug: string;
  label: Record<string, string>;
  color: string;
  sortOrder: number;
  isDefaultEntry: boolean;
  isWon: boolean;
  isLost: boolean;
  isTerminal: boolean;
  /** Live leads sitting on this stage. Archiving one with leads is refused. */
  leadCount: number;
};

export async function listPipeline(): Promise<PipelineStage[]> {
  await requireCapability('crm.read');

  const rows = await db
    .select({
      id: leadStatuses.id,
      slug: leadStatuses.slug,
      label: leadStatuses.label,
      color: leadStatuses.color,
      sortOrder: leadStatuses.sortOrder,
      isDefaultEntry: leadStatuses.isDefaultEntry,
      isWon: leadStatuses.isWon,
      isLost: leadStatuses.isLost,
      isTerminal: leadStatuses.isTerminal,
      /*
       * The inner table is aliased and the outer column is named in full.
       *
       * Interpolating the column object here renders a bare `id`, which binds
       * to the subquery's own table — the comparison becomes status_id = id,
       * is false for every row, and the count comes back 0 with no error. That
       * left the editor showing "заявок 0" on a stage that held leads, and the
       * archive control then took the no-leads path into a dead end.
       */
      leadCount: sql<number>`(
        select count(*)::int from leads l
         where l.status_id = lead_statuses.id and l.deleted_at is null
      )`,
    })
    .from(leadStatuses)
    .where(isNull(leadStatuses.archivedAt))
    .orderBy(asc(leadStatuses.sortOrder));

  return rows.map((row) => ({
    ...row,
    label: (row.label ?? {}) as Record<string, string>,
  }));
}

/** Archived stages, so the owner can see what was removed and what held it. */
export async function listArchivedStages(): Promise<
  Array<{ id: string; label: Record<string, string>; leadCount: number }>
> {
  await requireCapability('crm.read');

  const rows = await db
    .select({
      id: leadStatuses.id,
      label: leadStatuses.label,
      leadCount: sql<number>`(
        select count(*)::int from leads l where l.status_id = lead_statuses.id
      )`,
    })
    .from(leadStatuses)
    .where(sql`${leadStatuses.archivedAt} is not null`)
    .orderBy(asc(leadStatuses.sortOrder));

  return rows.map((row) => ({ ...row, label: (row.label ?? {}) as Record<string, string> }));
}

/** Whether any lead at all references this stage, archived rows included. */
export async function stageHasLeads(statusId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.statusId, statusId))
    .limit(1);
  return Boolean(row);
}
