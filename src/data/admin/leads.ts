import 'server-only';

import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  contacts,
  leadActivities,
  leadStatuses,
  leadTasks,
  leads,
  projectFiles,
  user,
} from '@/db/schema';
import type { Locale } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Reading the CRM.
 *
 * Leads have been captured since the public site went up; this is what makes
 * them reachable. Every export here begins with a capability check — content
 * editors have no `crm.read` at all, because a lead row is a name, a phone
 * number and a home address in the making, and the person who edits copy has no
 * business reading it.
 */

export type LeadListRow = {
  id: string;
  publicId: string;
  createdAt: Date;
  lastActivityAt: Date;
  statusId: string;
  statusLabel: Record<string, string>;
  statusColor: string;
  isTerminal: boolean;
  contactName: string | null;
  contactPhone: string;
  city: string | null;
  service: string | null;
  locale: Locale;
  utmSource: string | null;
  assignedToId: string | null;
  assigneeEmail: string | null;
  isDuplicateHint: boolean;
};

export type LeadFilter = {
  statusId?: string;
  assignedToId?: string;
  /** Free text: public id, name, or any part of a phone number. */
  q?: string;
  cursor?: string;
  limit?: number;
};

export type LeadPage = { rows: LeadListRow[]; nextCursor: string | null };

const MAX_LIMIT = 100;

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;
  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null;
  return { createdAt, id };
}

/**
 * Build the free-text predicate.
 *
 * A phone is matched on digits only, so "+34 600 55" and "34600 55" find the
 * same contact — nobody types a number back the way it was stored. The search
 * is a suffix-tolerant contains rather than a prefix match because staff
 * usually have the last few digits from a missed call.
 */
function searchCondition(raw: string): SQL | undefined {
  const term = raw.trim();
  if (term.length === 0) return undefined;

  const digits = term.replace(/\D/g, '');
  const escaped = term.replace(/[%_\\]/g, (match) => `\\${match}`);

  const parts: SQL[] = [
    ilike(leads.publicId, `%${escaped}%`),
    ilike(contacts.fullName, `%${escaped}%`),
  ];
  if (digits.length >= 4) {
    parts.push(sql`${contacts.phoneE164} like ${'%' + digits + '%'}`);
  }
  return or(...parts);
}

/**
 * One page of leads, newest first.
 *
 * Keyset, not OFFSET: leads arrive while someone is paging, and with OFFSET a
 * row inserted between two page loads pushes everything down — the reader
 * silently skips a lead, which for a sales inbox means losing a customer.
 */
export async function listLeads(filter: LeadFilter = {}): Promise<LeadPage> {
  await requireCapability('crm.read');

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT);

  const conditions: SQL[] = [isNull(leads.deletedAt)];
  if (filter.statusId) conditions.push(eq(leads.statusId, filter.statusId));
  if (filter.assignedToId === 'none') {
    conditions.push(isNull(leads.assignedToId));
  } else if (filter.assignedToId) {
    conditions.push(eq(leads.assignedToId, filter.assignedToId));
  }

  const search = filter.q ? searchCondition(filter.q) : undefined;
  if (search) conditions.push(search);

  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  if (cursor) {
    conditions.push(sql`(${leads.createdAt}, ${leads.id}) < (${cursor.createdAt}, ${cursor.id})`);
  }

  const rows = await db
    .select({
      id: leads.id,
      publicId: leads.publicId,
      createdAt: leads.createdAt,
      lastActivityAt: leads.lastActivityAt,
      statusId: leads.statusId,
      statusLabel: leadStatuses.label,
      statusColor: leadStatuses.color,
      isTerminal: leadStatuses.isTerminal,
      contactName: contacts.fullName,
      contactPhone: contacts.phoneE164,
      city: leads.city,
      service: leads.service,
      locale: leads.locale,
      utmSource: leads.utmSource,
      assignedToId: leads.assignedToId,
      assigneeEmail: user.email,
      duplicateOf: leads.possibleDuplicateOfId,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(leadStatuses, eq(leadStatuses.id, leads.statusId))
    .leftJoin(user, eq(user.id, leads.assignedToId))
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: page.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      createdAt: row.createdAt,
      lastActivityAt: row.lastActivityAt,
      statusId: row.statusId,
      statusLabel: (row.statusLabel ?? {}) as Record<string, string>,
      statusColor: row.statusColor,
      isTerminal: row.isTerminal,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      city: row.city,
      service: row.service,
      locale: row.locale as Locale,
      utmSource: row.utmSource,
      assignedToId: row.assignedToId,
      assigneeEmail: row.assigneeEmail,
      isDuplicateHint: row.duplicateOf !== null,
    })),
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/** Counts per status, for the filter bar. Cheap enough to run unfiltered. */
export async function countLeadsByStatus(): Promise<Record<string, number>> {
  await requireCapability('crm.read');

  const rows = await db
    .select({ statusId: leads.statusId, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(isNull(leads.deletedAt))
    .groupBy(leads.statusId);

  return Object.fromEntries(rows.map((row) => [row.statusId, row.count]));
}

export type LeadStatusRow = {
  id: string;
  slug: string;
  label: Record<string, string>;
  color: string;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
  isTerminal: boolean;
};

export async function listLeadStatuses(): Promise<LeadStatusRow[]> {
  await requireCapability('crm.read');

  const rows = await db
    .select()
    .from(leadStatuses)
    .where(isNull(leadStatuses.archivedAt))
    .orderBy(leadStatuses.sortOrder);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: (row.label ?? {}) as Record<string, string>,
    color: row.color,
    sortOrder: row.sortOrder,
    isWon: row.isWon,
    isLost: row.isLost,
    isTerminal: row.isTerminal,
  }));
}

/** Everyone a lead can be assigned to — content editors have no CRM access. */
export async function listAssignees(): Promise<Array<{ id: string; email: string; name: string }>> {
  await requireCapability('crm.read');

  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.banned, false))
    .orderBy(user.email);

  return rows
    .filter((row) => row.role === 'owner' || row.role === 'manager')
    .map(({ id, email, name }) => ({ id, email, name }));
}

export type LeadDetail = {
  id: string;
  publicId: string;
  createdAt: Date;
  statusId: string;
  assignedToId: string | null;
  locale: Locale;
  service: string | null;
  city: string | null;
  comment: string | null;
  budgetBand: string | null;
  pageContext: string | null;
  blockContext: string | null;
  projectSlug: string | null;
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    referrer: string | null;
    landingFirst: string | null;
    landingLast: string | null;
  };
  contact: {
    id: string;
    fullName: string | null;
    phoneE164: string;
    email: string | null;
    city: string | null;
    waOptIn: boolean;
    lastInboundAt: Date | null;
  };
  duplicateOf: { id: string; publicId: string } | null;
  activities: Array<{
    id: string;
    kind: string;
    actorType: string;
    actorEmail: string | null;
    body: string | null;
    payload: unknown;
    occurredAt: Date;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    completedAt: Date | null;
    assigneeEmail: string | null;
  }>;
  files: Array<{ id: string; originalFilename: string | null; sizeBytes: number }>;
};

export async function getLead(leadId: string): Promise<LeadDetail | null> {
  await requireCapability('crm.read');

  const [row] = await db
    .select()
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);

  if (!row) return null;
  const lead = row.leads;
  const contact = row.contacts;

  const [duplicate] = lead.possibleDuplicateOfId
    ? await db
        .select({ id: leads.id, publicId: leads.publicId })
        .from(leads)
        .where(eq(leads.id, lead.possibleDuplicateOfId))
        .limit(1)
    : [];

  const activityRows = await db
    .select({
      id: leadActivities.id,
      kind: leadActivities.kind,
      actorType: leadActivities.actorType,
      body: leadActivities.body,
      payload: leadActivities.payload,
      occurredAt: leadActivities.occurredAt,
      actorEmail: user.email,
    })
    .from(leadActivities)
    .leftJoin(user, eq(user.id, leadActivities.actorUserId))
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.occurredAt))
    .limit(200);

  const taskRows = await db
    .select({
      id: leadTasks.id,
      title: leadTasks.title,
      dueAt: leadTasks.dueAt,
      completedAt: leadTasks.completedAt,
      assigneeEmail: user.email,
    })
    .from(leadTasks)
    .leftJoin(user, eq(user.id, leadTasks.assigneeId))
    .where(eq(leadTasks.leadId, leadId))
    .orderBy(leadTasks.completedAt, leadTasks.dueAt);

  const fileRows = await db
    .select({
      id: projectFiles.id,
      originalFilename: projectFiles.originalFilename,
      sizeBytes: projectFiles.sizeBytes,
    })
    .from(projectFiles)
    .where(and(eq(projectFiles.leadId, leadId), eq(projectFiles.status, 'attached')));

  return {
    id: lead.id,
    publicId: lead.publicId,
    createdAt: lead.createdAt,
    statusId: lead.statusId,
    assignedToId: lead.assignedToId,
    locale: lead.locale as Locale,
    service: lead.service,
    city: lead.city,
    comment: lead.comment,
    budgetBand: lead.budgetBand,
    pageContext: lead.pageContext,
    blockContext: lead.blockContext,
    projectSlug: lead.projectSlug,
    attribution: {
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      utmContent: lead.utmContent,
      utmTerm: lead.utmTerm,
      referrer: lead.referrer,
      landingFirst: lead.landingUrlFirst,
      landingLast: lead.landingUrlLast,
    },
    contact: {
      id: contact.id,
      fullName: contact.fullName,
      phoneE164: contact.phoneE164,
      email: contact.email,
      city: contact.city,
      waOptIn: contact.waOptIn,
      lastInboundAt: contact.lastInboundAt,
    },
    duplicateOf: duplicate ?? null,
    activities: activityRows.map((activity) => ({
      id: String(activity.id),
      kind: activity.kind,
      actorType: activity.actorType,
      actorEmail: activity.actorEmail,
      body: activity.body,
      payload: activity.payload,
      occurredAt: activity.occurredAt,
    })),
    tasks: taskRows.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      completedAt: task.completedAt,
      assigneeEmail: task.assigneeEmail,
    })),
    files: fileRows,
  };
}
