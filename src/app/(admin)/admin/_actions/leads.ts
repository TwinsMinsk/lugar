'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db/client';
import { leadActivities, leadAssignments, leadStatuses, leadTasks, leads } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * CRM mutations.
 *
 * Every change writes a `lead_activities` row in the same transaction. That
 * timeline is the business record — who moved this lead, when, and what was
 * said — and it has to be impossible for a status change to land without the
 * note explaining it.
 *
 * The audit log gets the operations that are about *access* rather than about
 * sales: exporting personal data, or deleting a lead. Mirroring every status
 * change into it as well would double the write for a fact the timeline already
 * holds, in the place nobody looks for it.
 */
export type LeadResult = { ok: true } | { ok: false; error: string };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

const statusSchema = z.object({ leadId: z.uuid(), statusId: z.uuid() });

export async function changeLeadStatus(input: z.input<typeof statusSchema>): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.write');

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId, statusId } = parsed.data;

  const [lead] = await db
    .select({ id: leads.id, statusId: leads.statusId })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false, error: 'not_found' };
  if (lead.statusId === statusId) return { ok: true };

  const [target] = await db
    .select({ id: leadStatuses.id, label: leadStatuses.label })
    .from(leadStatuses)
    .where(and(eq(leadStatuses.id, statusId), isNull(leadStatuses.archivedAt)))
    .limit(1);
  if (!target) return { ok: false, error: 'unknown_status' };

  const [previous] = await db
    .select({ label: leadStatuses.label })
    .from(leadStatuses)
    .where(eq(leadStatuses.id, lead.statusId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ statusId, statusChangedAt: sql`now()`, lastActivityAt: sql`now()` })
      .where(eq(leads.id, leadId));

    await tx.insert(leadActivities).values({
      leadId,
      kind: 'status_changed',
      actorType: 'user',
      actorUserId: actor.id,
      payload: {
        from: (previous?.label as { ru?: string } | undefined)?.ru ?? null,
        to: (target.label as { ru?: string }).ru ?? null,
      },
    });
  });

  return { ok: true };
}

const assignSchema = z.object({
  leadId: z.uuid(),
  /** Empty string means "unassign" — a real state, not a missing value. */
  assigneeId: z.string(),
});

export async function assignLead(input: z.input<typeof assignSchema>): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.write');

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId } = parsed.data;
  const assigneeId = parsed.data.assigneeId === '' ? null : parsed.data.assigneeId;

  const [lead] = await db
    .select({ id: leads.id, assignedToId: leads.assignedToId })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false, error: 'not_found' };
  if (lead.assignedToId === assigneeId) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ assignedToId: assigneeId, lastActivityAt: sql`now()` })
      .where(eq(leads.id, leadId));

    // A separate history table, not just an activity row: "who owned this lead
    // in March" is a question the timeline can answer only by replaying it.
    await tx.insert(leadAssignments).values({
      leadId,
      fromUserId: lead.assignedToId,
      toUserId: assigneeId,
      assignedByUserId: actor.id,
    });

    await tx.insert(leadActivities).values({
      leadId,
      kind: 'assigned',
      actorType: 'user',
      actorUserId: actor.id,
      payload: { to: assigneeId },
    });
  });

  return { ok: true };
}

const noteSchema = z.object({ leadId: z.uuid(), body: z.string().trim().min(1).max(4000) });

export async function addLeadNote(input: z.input<typeof noteSchema>): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.write');

  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId, body } = parsed.data;

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) return { ok: false, error: 'not_found' };

  await db.transaction(async (tx) => {
    await tx.insert(leadActivities).values({
      leadId,
      kind: 'note',
      actorType: 'user',
      actorUserId: actor.id,
      body,
    });
    await tx
      .update(leads)
      .set({ lastActivityAt: sql`now()` })
      .where(eq(leads.id, leadId));
  });

  return { ok: true };
}

const taskSchema = z.object({
  leadId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  /** A date, not a datetime: nobody schedules a callback to the minute. */
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  assigneeId: z.string().optional(),
});

export async function createLeadTask(input: z.input<typeof taskSchema>): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.write');

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId, title, dueOn, assigneeId } = parsed.data;

  // End of the chosen day in Madrid, where the studio works — a task due
  // "today" must not fall overdue at midnight UTC, which is 02:00 locally.
  const dueAt = dueOn ? new Date(`${dueOn}T21:59:59.000Z`) : null;

  await db.transaction(async (tx) => {
    await tx.insert(leadTasks).values({
      leadId,
      title,
      dueAt,
      assigneeId: assigneeId && assigneeId !== '' ? assigneeId : actor.id,
      createdById: actor.id,
    });
    await tx.insert(leadActivities).values({
      leadId,
      kind: 'task_created',
      actorType: 'user',
      actorUserId: actor.id,
      body: title,
    });
    await tx
      .update(leads)
      .set({ lastActivityAt: sql`now()` })
      .where(eq(leads.id, leadId));
  });

  return { ok: true };
}

export async function completeLeadTask(taskId: string): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.write');
  if (!z.uuid().safeParse(taskId).success) return { ok: false, error: 'invalid_input' };

  const [task] = await db.select().from(leadTasks).where(eq(leadTasks.id, taskId)).limit(1);
  if (!task) return { ok: false, error: 'not_found' };
  if (task.completedAt) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(leadTasks)
      .set({ completedAt: sql`now()` })
      .where(eq(leadTasks.id, taskId));
    if (task.leadId) {
      await tx.insert(leadActivities).values({
        leadId: task.leadId,
        kind: 'task_completed',
        actorType: 'user',
        actorUserId: actor.id,
        body: task.title,
      });
      await tx
        .update(leads)
        .set({ lastActivityAt: sql`now()` })
        .where(eq(leads.id, task.leadId));
    }
  });

  return { ok: true };
}

/**
 * Soft-delete a lead.
 *
 * Owner-only, and never a hard delete: the contact, the consent records and the
 * WhatsApp history all reference it, and erasing the row would either break
 * those or destroy the record of a consent that was genuinely given.
 */
export async function deleteLead(leadId: string): Promise<LeadResult> {
  const { user: actor } = await requireCapability('crm.delete');
  if (!z.uuid().safeParse(leadId).success) return { ok: false, error: 'invalid_input' };

  const [lead] = await db
    .select({ id: leads.id, publicId: leads.publicId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return { ok: false, error: 'not_found' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ deletedAt: sql`now()` })
      .where(eq(leads.id, leadId));
    await recordAudit(
      {
        actorUserId: actor.id,
        action: 'lead.deleted',
        entityType: 'lead',
        entityId: leadId,
        before: { publicId: lead.publicId },
        ...context,
      },
      tx,
    );
  });

  return { ok: true };
}
