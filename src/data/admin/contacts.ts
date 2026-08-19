import 'server-only';

import { and, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  consentRecords,
  contacts,
  leadStatuses,
  leads,
  projects,
  whatsappMessages,
} from '@/db/schema';
import type { Locale } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Reading contacts.
 *
 * A lead is one enquiry; a contact is the person behind it. Until this existed
 * the only way to see someone's history was to open each of their leads in
 * turn and reconstruct it by hand — which is exactly when a manager rings a
 * customer to ask a question the customer already answered in March.
 */
export type ContactRow = {
  id: string;
  fullName: string | null;
  phoneE164: string;
  email: string | null;
  city: string | null;
  source: string;
  waOptIn: boolean;
  lastInboundAt: Date | null;
  lastSeenAt: Date;
  leadCount: number;
  lastLeadAt: Date | null;
};

const MAX_LIMIT = 100;

function encodeCursor(row: { lastSeenAt: Date; id: string }): string {
  return `${row.lastSeenAt.toISOString()}|${row.id}`;
}

function decodeCursor(raw: string): { lastSeenAt: Date; id: string } | null {
  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;
  const lastSeenAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(lastSeenAt.getTime()) || id.length === 0) return null;
  return { lastSeenAt, id };
}

export async function listContacts(
  filter: { q?: string; cursor?: string; limit?: number; archived?: boolean } = {},
) {
  await requireCapability('crm.read');

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT);
  const conditions: SQL[] = [
    isNull(contacts.deletedAt),
    filter.archived ? isNotNull(contacts.archivedAt) : isNull(contacts.archivedAt),
  ];

  const term = filter.q?.trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    const escaped = term.replace(/[%_\\]/g, (match) => `\\${match}`);
    const parts: SQL[] = [ilike(contacts.fullName, `%${escaped}%`)];
    if (term.includes('@')) parts.push(ilike(contacts.email, `%${escaped}%`));
    // Digits only, so a number found in a call log matches however it was typed.
    if (digits.length >= 4) parts.push(sql`${contacts.phoneE164} like ${'%' + digits + '%'}`);
    const search = or(...parts);
    if (search) conditions.push(search);
  }

  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  if (cursor) {
    conditions.push(
      sql`(${contacts.lastSeenAt}, ${contacts.id}) < (${cursor.lastSeenAt}, ${cursor.id})`,
    );
  }

  const rows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      phoneE164: contacts.phoneE164,
      email: contacts.email,
      city: contacts.city,
      source: contacts.source,
      waOptIn: contacts.waOptIn,
      lastInboundAt: contacts.lastInboundAt,
      lastSeenAt: contacts.lastSeenAt,
      // Aliased inner table, outer column named in full: interpolating the
      // column object renders a bare `id` that binds to the subquery's own
      // table and silently counts nothing.
      leadCount: sql<number>`(
        select count(*)::int from leads l
         where l.contact_id = contacts.id and l.deleted_at is null and l.archived_at is null
      )`,
      lastLeadAt: sql<Date | null>`(
        select max(l.created_at) from leads l
         where l.contact_id = contacts.id and l.deleted_at is null and l.archived_at is null
      )`,
    })
    .from(contacts)
    .where(and(...conditions))
    .orderBy(desc(contacts.lastSeenAt), desc(contacts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: page as ContactRow[],
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
  };
}

export type ContactDetail = {
  id: string;
  fullName: string | null;
  phoneE164: string;
  phoneCountry: string | null;
  email: string | null;
  city: string | null;
  preferredLocale: Locale;
  source: string;
  waOptIn: boolean;
  lastInboundAt: Date | null;
  notes: string | null;
  createdAt: Date;
  /** Set when the client is out of the working list. The card stays reachable. */
  archivedAt: Date | null;
  leads: Array<{
    id: string;
    publicId: string;
    createdAt: Date;
    service: string | null;
    statusLabel: Record<string, string>;
    statusColor: string;
  }>;
  projects: Array<{
    id: string;
    code: string;
    title: string;
    stage: string;
    contractValueEur: number | null;
    dueAt: Date | null;
  }>;
  consents: Array<{
    id: string;
    purpose: string;
    granted: boolean;
    policyVersion: string;
    createdAt: Date;
  }>;
  messageCount: number;
};

export async function getContact(contactId: string): Promise<ContactDetail | null> {
  await requireCapability('crm.read');

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!contact) return null;

  const leadRows = await db
    .select({
      id: leads.id,
      publicId: leads.publicId,
      createdAt: leads.createdAt,
      service: leads.service,
      statusLabel: leadStatuses.label,
      statusColor: leadStatuses.color,
    })
    .from(leads)
    .innerJoin(leadStatuses, eq(leadStatuses.id, leads.statusId))
    .where(and(eq(leads.contactId, contactId), isNull(leads.deletedAt)))
    .orderBy(desc(leads.createdAt));

  const projectRows = await db
    .select({
      id: projects.id,
      code: projects.code,
      title: projects.title,
      stage: projects.stage,
      contractValueEur: projects.contractValueEur,
      dueAt: projects.dueAt,
    })
    .from(projects)
    .where(and(eq(projects.contactId, contactId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));

  /**
   * Consent is append-only, and the whole trail is shown.
   *
   * Under GDPR the question is not "does this person consent" but "what did
   * they agree to, when, and to which version of the text" — a single current
   * flag cannot answer that, and a withdrawal is a new row rather than an edit.
   */
  const consentRows = await db
    .select({
      id: consentRecords.id,
      purpose: consentRecords.purpose,
      granted: consentRecords.granted,
      policyVersion: consentRecords.policyVersion,
      createdAt: consentRecords.createdAt,
    })
    .from(consentRecords)
    .where(eq(consentRecords.contactId, contactId))
    .orderBy(desc(consentRecords.createdAt));

  const [messages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.contactId, contactId));

  return {
    id: contact.id,
    fullName: contact.fullName,
    phoneE164: contact.phoneE164,
    phoneCountry: contact.phoneCountry,
    email: contact.email,
    city: contact.city,
    preferredLocale: contact.preferredLocale as Locale,
    source: contact.source,
    waOptIn: contact.waOptIn,
    lastInboundAt: contact.lastInboundAt,
    notes: contact.notes,
    createdAt: contact.createdAt,
    archivedAt: contact.archivedAt,
    leads: leadRows.map((row) => ({
      ...row,
      statusLabel: (row.statusLabel ?? {}) as Record<string, string>,
    })),
    projects: projectRows,
    consents: consentRows.map((row) => ({ ...row, id: String(row.id) })),
    messageCount: messages?.count ?? 0,
  };
}
