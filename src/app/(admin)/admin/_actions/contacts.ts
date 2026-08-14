'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { contacts } from '@/db/schema';
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

const updateSchema = z.object({
  id: z.uuid(),
  fullName: z.string().trim().max(200).optional(),
  email: z.email().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function updateContact(input: z.input<typeof updateSchema>): Promise<ContactResult> {
  await requireCapability('crm.write');

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { id, fullName, email, city, notes } = parsed.data;

  const updated = await db
    .update(contacts)
    .set({
      fullName: fullName === '' ? null : (fullName ?? null),
      email: email === '' ? null : (email ?? null),
      city: city === '' ? null : (city ?? null),
      notes: notes === '' ? null : (notes ?? null),
      updatedAt: sql`now()`,
    })
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .returning({ id: contacts.id });

  if (updated.length === 0) return { ok: false, error: 'not_found' };
  return { ok: true };
}
