'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { contacts, leadActivities, leads, whatsappOutbox } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';
import { whatsapp } from '@/lib/whatsapp';

/**
 * Sending WhatsApp from the CRM.
 *
 * Nothing here talks to Meta. A message is queued into the outbox and the
 * worker delivers it, because the send has to survive this request failing —
 * and because a staff member clicking twice must not produce two messages that
 * a network retry then turns into four.
 */
export type WhatsAppResult = { ok: true } | { ok: false; error: string };

/** Same margin as the worker and the renderer, in one place. */
const WINDOW_MARGIN_SQL = sql`now() - interval '23 hours 55 minutes'`;

async function loadLead(leadId: string) {
  const [row] = await db
    .select({
      id: leads.id,
      contactId: leads.contactId,
      phoneE164: contacts.phoneE164,
      waOptIn: contacts.waOptIn,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  return row ?? null;
}

const textSchema = z.object({
  leadId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Queue a free-form reply.
 *
 * Legal only inside the 24-hour service window, which is re-checked here rather
 * than trusted from the page: the window may well have closed while the message
 * was being typed.
 */
export async function sendWhatsAppText(input: z.input<typeof textSchema>): Promise<WhatsAppResult> {
  const { user: actor } = await requireCapability('whatsapp.send');

  const parsed = textSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId, body } = parsed.data;

  if (!whatsapp().canSendProgrammatically) return { ok: false, error: 'not_configured' };

  const lead = await loadLead(leadId);
  if (!lead) return { ok: false, error: 'not_found' };
  if (!lead.waOptIn) return { ok: false, error: 'no_consent' };

  const [open] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, lead.contactId),
        sql`${contacts.lastInboundAt} is not null and ${contacts.lastInboundAt} > ${WINDOW_MARGIN_SQL}`,
      ),
    )
    .limit(1);
  if (!open) return { ok: false, error: 'window_closed' };

  await db.transaction(async (tx) => {
    await tx.insert(whatsappOutbox).values({
      leadId,
      contactId: lead.contactId,
      toPhoneE164: lead.phoneE164,
      purpose: 'manual_reply',
      kind: 'text',
      bodyText: body,
      requiresWindow: true,
    });

    await tx.insert(leadActivities).values({
      leadId,
      contactId: lead.contactId,
      kind: 'wa_out',
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

const templateSchema = z.object({
  leadId: z.uuid(),
  name: z.string().trim().min(1).max(128),
  language: z.string().trim().min(2).max(8),
  variables: z.record(z.string(), z.string().max(300)).optional(),
});

/**
 * Queue an approved template.
 *
 * The only thing that can legally start a conversation outside the window. No
 * window check — that is the entire point of a template.
 */
export async function sendWhatsAppTemplate(
  input: z.input<typeof templateSchema>,
): Promise<WhatsAppResult> {
  const { user: actor } = await requireCapability('whatsapp.send');

  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { leadId, name, language, variables } = parsed.data;

  if (!whatsapp().canSendProgrammatically) return { ok: false, error: 'not_configured' };

  const lead = await loadLead(leadId);
  if (!lead) return { ok: false, error: 'not_found' };
  if (!lead.waOptIn) return { ok: false, error: 'no_consent' };

  await db.transaction(async (tx) => {
    await tx.insert(whatsappOutbox).values({
      leadId,
      contactId: lead.contactId,
      toPhoneE164: lead.phoneE164,
      purpose: 'manual_template',
      kind: 'template',
      templateName: name,
      templateLanguage: language,
      templateVariables: variables ?? {},
      requiresWindow: false,
    });

    await tx.insert(leadActivities).values({
      leadId,
      contactId: lead.contactId,
      kind: 'wa_out',
      actorType: 'user',
      actorUserId: actor.id,
      body: `Шаблон: ${name}`,
    });

    await tx
      .update(leads)
      .set({ lastActivityAt: sql`now()` })
      .where(eq(leads.id, leadId));
  });

  return { ok: true };
}

/**
 * Put a dead-lettered message back in the queue.
 *
 * Owner-only. A dead letter is a message that already failed every attempt, so
 * retrying it is a decision someone has to take deliberately after fixing
 * whatever caused it — usually an unapproved or paused template.
 */
export async function requeueOutboxMessage(outboxId: string): Promise<WhatsAppResult> {
  await requireCapability('whatsapp.requeue');
  if (!z.uuid().safeParse(outboxId).success) return { ok: false, error: 'invalid_input' };

  const [row] = await db
    .select({ id: whatsappOutbox.id, status: whatsappOutbox.status })
    .from(whatsappOutbox)
    .where(eq(whatsappOutbox.id, outboxId))
    .limit(1);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'dead' && row.status !== 'blocked_window') {
    return { ok: false, error: 'not_dead' };
  }

  await db
    .update(whatsappOutbox)
    .set({
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: sql`now()`,
      deadLetteredAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(eq(whatsappOutbox.id, outboxId));

  return { ok: true };
}

/**
 * Take a message out of the queue without sending it.
 *
 * The counterpart to requeue, for the case the owner has instead: a message
 * sitting in `blocked_window` or `dead` that should simply not go — the
 * customer was already called, or the alert is stale. Today the only way out of
 * that state is to retry it.
 *
 * `skipped`, never a DELETE. A message that was queued is part of what the
 * business did about an enquiry, and the row is the proof of what was and was
 * not sent to a customer. `sent` is refused outright for the same reason: it is
 * already in someone's phone, and nothing here can take it back.
 */
export async function cancelOutboxMessage(outboxId: string): Promise<WhatsAppResult> {
  await requireCapability('whatsapp.requeue');
  if (!z.uuid().safeParse(outboxId).success) return { ok: false, error: 'invalid_input' };

  const [row] = await db
    .select({ id: whatsappOutbox.id, status: whatsappOutbox.status })
    .from(whatsappOutbox)
    .where(eq(whatsappOutbox.id, outboxId))
    .limit(1);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'sent') return { ok: false, error: 'already_sent' };
  if (row.status === 'skipped') return { ok: true };
  // `claimed` means the worker is holding it right now; cancelling underneath
  // it would race the send itself.
  if (row.status === 'claimed') return { ok: false, error: 'in_flight' };

  await db.update(whatsappOutbox).set({ status: 'skipped' }).where(eq(whatsappOutbox.id, outboxId));

  return { ok: true };
}
