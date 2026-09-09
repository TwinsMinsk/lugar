'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { parsePhoneNumberWithError } from 'libphonenumber-js/max';
import { z } from 'zod';

import { db } from '@/db/client';
import {
  consentRecords,
  contacts,
  formSubmissions,
  leadActivities,
  leads,
  leadTasks,
  projects,
  whatsappMessages,
  whatsappOutbox,
} from '@/db/schema';
import { auditRequestContext, recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Editing a contact.
 *
 * Deliberately narrow. The phone number is the natural key the whole CRM joins
 * on and the one the WhatsApp webhook matches against, so it is not editable
 * here: changing it would silently detach the person from their own history
 * and from any inbound message that follows. A wrong number is a new contact.
 *
 * Consent is not editable either, at any level. It is an append-only record of
 * what the customer agreed to, and a staff member who can flip it is a staff
 * member who can manufacture permission after the fact.
 */
export type ContactResult = { ok: true } | { ok: false; error: string };

/**
 * Everything a contact action records, and nothing else.
 *
 * A contact row is personal data end to end — name, email, city, free-text
 * notes — so the entry says which fields a person touched and never what they
 * were changed from or to. `audit.ts` sets this rule for every caller ("never
 * a second copy of customer personal data"), and this is the one table where
 * following it literally matters: an audit log an owner can read must not
 * become the place a deleted customer's details survive.
 */
async function auditContact(
  actorUserId: string,
  action: string,
  contactId: string,
  extra: Record<string, unknown> | null,
  tx?: Parameters<typeof recordAudit>[1],
) {
  const context = await auditRequestContext();
  await recordAudit(
    {
      actorUserId,
      action,
      entityType: 'contact',
      entityId: contactId,
      after: extra,
      ...context,
    },
    tx,
  );
}

const updateSchema = z.object({
  id: z.uuid(),
  fullName: z.string().trim().max(200).optional(),
  email: z.email().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function updateContact(input: z.input<typeof updateSchema>): Promise<ContactResult> {
  const { user: actor } = await requireCapability('crm.write');

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { id, fullName, email, city, notes } = parsed.data;

  // Read before writing so "not found" is answered outside the transaction: a
  // `return` inside the callback cannot abort the action, and the audit row
  // has to commit with the update rather than after a change that rolled back.
  const [before] = await db
    .select({
      fullName: contacts.fullName,
      email: contacts.email,
      city: contacts.city,
      notes: contacts.notes,
    })
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .limit(1);
  if (!before) return { ok: false, error: 'not_found' };

  const next = {
    fullName: fullName === '' ? null : (fullName ?? null),
    email: email === '' ? null : (email ?? null),
    city: city === '' ? null : (city ?? null),
    notes: notes === '' ? null : (notes ?? null),
  };
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (field) => next[field] !== before[field],
  );

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ ...next, updatedAt: sql`now()` })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
    // Field names, never values — see `auditContact`. Joined rather than left
    // as an array because the journal renders an array as its length, and
    // "fields: 2" answers none of the question a reader came with.
    await auditContact(actor.id, 'contact.updated', id, { fields: changed.join(', ') }, tx);
  });

  return { ok: true };
}

const mergeSchema = z.object({
  keepId: z.uuid(),
  /**
   * The other card, named by its number rather than picked from a list.
   *
   * The phone is the key this CRM joins on and the thing the owner is looking
   * at on the other card; a select of every contact would be the wrong shape
   * for something done once in a while against a list that only grows.
   */
  mergePhone: z.string().trim().min(3).max(40),
});

/**
 * Two records, one person.
 *
 * The phone number is the natural key the whole CRM joins on, and it is not
 * editable, so a duplicate only exists when the same person wrote from a second
 * number. Until now the panel could show both and do nothing about it: their
 * enquiries, their WhatsApp history and their consent stayed split across two
 * cards, and the person who called about "my kitchen" existed twice with half a
 * story each.
 *
 * Everything the second record carries is moved rather than copied, in one
 * transaction, so there is no window where a lead belongs to a contact that has
 * already been deleted. What moves is every table with a `contact_id`: the
 * enquiries and their form submissions, the timeline, tasks, projects, the
 * WhatsApp queue and message history — and the consent records, which are the
 * one thing that must never be recreated, only carried.
 *
 * The kept record's own details win. Merging is not the place to reconcile two
 * spellings of a name: the owner picks which card survives, and the other one's
 * notes are appended rather than dropped, because a note nobody chose to delete
 * should not disappear because two rows became one.
 *
 * The merged record is soft-deleted, like any other contact deletion — its
 * audit history references it, and `consent_records` cascades from `contacts`,
 * so a real DELETE would destroy the evidence that someone agreed to be
 * contacted. That evidence has just been moved anyway; the row stays for the
 * trail.
 */
export async function mergeContacts(input: z.input<typeof mergeSchema>): Promise<ContactResult> {
  const { user: actor } = await requireCapability('crm.delete');

  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { keepId, mergePhone } = parsed.data;

  // Normalised the same way the public form normalises what a customer types,
  // so "+34 624 52 73 03", "624527303" and "0034624527303" all find the same
  // card — the owner is copying a number off a screen, not typing a key.
  let phoneE164: string;
  try {
    const parsedPhone = parsePhoneNumberWithError(mergePhone, {
      defaultCountry: 'ES',
      extract: false,
    });
    if (!parsedPhone.isValid()) throw new Error('invalid');
    phoneE164 = parsedPhone.format('E.164');
  } catch {
    return { ok: false, error: 'phone_invalid' };
  }

  const [keep] = await db
    .select({ id: contacts.id, notes: contacts.notes, phoneE164: contacts.phoneE164 })
    .from(contacts)
    .where(and(eq(contacts.id, keepId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!keep) return { ok: false, error: 'not_found' };

  const [merge] = await db
    .select({ id: contacts.id, notes: contacts.notes, phoneE164: contacts.phoneE164 })
    .from(contacts)
    .where(and(eq(contacts.phoneE164, phoneE164), isNull(contacts.deletedAt)))
    .limit(1);
  if (!merge) return { ok: false, error: 'merge_not_found' };
  if (merge.id === keepId) return { ok: false, error: 'same_contact' };

  const mergeId = merge.id;

  const combinedNotes = [
    keep.notes,
    merge.notes ? `Из объединённой карточки ${merge.phoneE164}: ${merge.notes}` : null,
  ]
    .filter((part): part is string => Boolean(part && part.trim() !== ''))
    .join('\n\n');

  await db.transaction(async (tx) => {
    for (const table of [
      leads,
      formSubmissions,
      leadActivities,
      leadTasks,
      projects,
      consentRecords,
      whatsappMessages,
      whatsappOutbox,
    ]) {
      await tx.update(table).set({ contactId: keepId }).where(eq(table.contactId, mergeId));
    }

    await tx
      .update(contacts)
      .set({ notes: combinedNotes === '' ? null : combinedNotes, updatedAt: sql`now()` })
      .where(eq(contacts.id, keepId));

    await tx
      .update(contacts)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(contacts.id, mergeId));

    // Two entries, because two records changed and a reader looking at either
    // one has to find out what happened to it. Phone numbers rather than names:
    // the number is the key this CRM joins on, and it is the thing the owner
    // will recognise.
    await auditContact(actor.id, 'contact.merged', keepId, { absorbed: merge.phoneE164 }, tx);
    await auditContact(actor.id, 'contact.merged_away', mergeId, { into: keep.phoneE164 }, tx);
  });

  return { ok: true };
}

/**
 * Level 1 — out of the client list.
 *
 * Nothing about the person's history changes: their leads, their timeline and
 * their consent records stay exactly where they were. This is a working list
 * getting shorter, not a record being erased.
 */
export async function archiveContact(contactId: string): Promise<ContactResult> {
  const { user: actor } = await requireCapability('crm.write');
  if (!z.uuid().safeParse(contactId).success) return { ok: false, error: 'invalid_input' };

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!existing) return { ok: false, error: 'not_found' };

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    await auditContact(actor.id, 'contact.archived', contactId, null, tx);
  });

  return { ok: true };
}

/** Undo level 1. */
export async function restoreContact(contactId: string): Promise<ContactResult> {
  const { user: actor } = await requireCapability('crm.write');
  if (!z.uuid().safeParse(contactId).success) return { ok: false, error: 'invalid_input' };

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!existing) return { ok: false, error: 'not_found' };

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ archivedAt: null, updatedAt: sql`now()` })
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    await auditContact(actor.id, 'contact.restored', contactId, null, tx);
  });

  return { ok: true };
}

/**
 * Level 2 — out of the CRM entirely.
 *
 * Still a soft delete, and this one is not squeamishness: `consent_records`
 * cascades from `contacts`, so a real DELETE would destroy the evidence that
 * the person agreed to be contacted — the one record that exists specifically
 * to be produced later, and the one the GDPR request would ask for.
 *
 * Refused while the person still has enquiries in the working lists. Deleting
 * the client under a live lead would leave that lead pointing at a name nobody
 * can open, so the enquiries are archived first, deliberately.
 */
export async function deleteContact(contactId: string): Promise<ContactResult> {
  const { user: actor } = await requireCapability('crm.delete');
  if (!z.uuid().safeParse(contactId).success) return { ok: false, error: 'invalid_input' };

  const [contact] = await db
    .select({ id: contacts.id, archivedAt: contacts.archivedAt })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!contact) return { ok: false, error: 'not_found' };
  if (!contact.archivedAt) return { ok: false, error: 'not_archived' };

  const [live] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.contactId, contactId), isNull(leads.deletedAt), isNull(leads.archivedAt)));
  if ((live?.count ?? 0) > 0) return { ok: false, error: 'has_active_leads' };

  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
    // The one entry that has to outlive what it describes: `audit_log` holds
    // `entityId` as plain text with no foreign key, so this row survives the
    // contact it names — which is the point of recording a deletion.
    await auditContact(actor.id, 'contact.deleted', contactId, null, tx);
  });

  return { ok: true };
}
