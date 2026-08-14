import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  contacts,
  leadActivities,
  leads,
  whatsappMessages,
  whatsappOutbox,
  whatsappWebhookEvents,
} from '@/db/schema';

/**
 * Turning a Meta webhook envelope into rows.
 *
 * Split from the route handler so the parsing rules can be tested directly.
 * The route's only job is the signature, the dedupe insert, and the status
 * code; everything about what the payload *means* lives here.
 */

export type ParsedEvent =
  | {
      kind: 'message';
      eventKey: string;
      wamid: string;
      phoneNumberId: string | null;
      from: string;
      messageType: string;
      body: string | null;
      timestamp: Date;
    }
  | {
      kind: 'status';
      eventKey: string;
      wamid: string;
      phoneNumberId: string | null;
      recipient: string | null;
      status: string;
      errorCode: number | null;
      timestamp: Date;
    }
  | {
      kind: 'template_status' | 'quality_update' | 'other';
      eventKey: string;
      wamid: null;
      phoneNumberId: string | null;
    };

type Envelope = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>;
  }>;
};

/** Meta sends unix seconds as a string. */
function toDate(value: unknown): Date {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date();
  return new Date(seconds * 1000);
}

function e164(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/**
 * Flatten an envelope into individual, separately-deduplicated events.
 *
 * One POST can carry several changes, and a status change carries its own key:
 * `sent`, `delivered` and `read` share a wamid but are three distinct events
 * that Meta retries independently. Keying on the wamid alone would drop two of
 * the three and leave the delivery timeline permanently stuck at "sent".
 */
export function parseEnvelope(payload: unknown): ParsedEvent[] {
  const envelope = payload as Envelope;
  const events: ParsedEvent[] = [];

  for (const entry of envelope?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      const phoneNumberId = metadata.phone_number_id ? String(metadata.phone_number_id) : null;

      if (change.field === 'messages') {
        for (const raw of (value.messages ?? []) as Array<Record<string, unknown>>) {
          const wamid = String(raw.id ?? '');
          if (!wamid) continue;
          const type = String(raw.type ?? 'unknown');
          const text = (raw.text ?? {}) as { body?: string };
          events.push({
            kind: 'message',
            eventKey: `msg:${wamid}`,
            wamid,
            phoneNumberId,
            from: e164(raw.from),
            messageType: type,
            body: type === 'text' ? (text.body ?? null) : null,
            timestamp: toDate(raw.timestamp),
          });
        }

        for (const raw of (value.statuses ?? []) as Array<Record<string, unknown>>) {
          const wamid = String(raw.id ?? '');
          const status = String(raw.status ?? '');
          if (!wamid || !status) continue;
          const errors = (raw.errors ?? []) as Array<{ code?: number }>;
          events.push({
            kind: 'status',
            eventKey: `st:${wamid}:${status}`,
            wamid,
            phoneNumberId,
            recipient: raw.recipient_id ? e164(raw.recipient_id) : null,
            status,
            errorCode: errors[0]?.code ?? null,
            timestamp: toDate(raw.timestamp),
          });
        }
        continue;
      }

      if (change.field === 'message_template_status_update') {
        const name = String(value.message_template_name ?? 'unknown');
        const event = String(value.event ?? 'unknown');
        events.push({
          kind: 'template_status',
          // Template approval flips back and forth over a template's life, so
          // the key includes the entry id to keep each transition distinct.
          eventKey: `tpl:${name}:${event}:${entry.id ?? 'x'}`,
          wamid: null,
          phoneNumberId,
        });
        continue;
      }

      if (change.field === 'phone_number_quality_update') {
        events.push({
          kind: 'quality_update',
          eventKey: `qual:${phoneNumberId ?? 'x'}:${String(value.event ?? 'unknown')}:${String(value.current_limit ?? '')}`,
          wamid: null,
          phoneNumberId,
        });
      }
    }
  }

  return events;
}

/**
 * Apply one already-persisted event.
 *
 * Runs after the response, so it must be safe to run late and safe to skip:
 * the raw envelope is already committed, and anything that fails here can be
 * replayed from `whatsapp_webhook_events` without asking Meta for it again.
 */
export async function applyEvent(event: ParsedEvent, eventId: bigint): Promise<void> {
  if (event.kind === 'message') {
    await db.transaction(async (tx) => {
      // Inbound is what opens the 24h service window, so the contact row is
      // created if this is someone who has never used the form.
      const [contact] = await tx
        .insert(contacts)
        .values({
          phoneE164: event.from,
          source: 'whatsapp_inbound',
          lastInboundAt: event.timestamp,
          waOptIn: true,
        })
        .onConflictDoUpdate({
          target: contacts.phoneE164,
          set: {
            lastInboundAt: event.timestamp,
            lastSeenAt: sql`now()`,
            // Writing to us is consent to be answered here.
            waOptIn: sql`true`,
          },
        })
        .returning({ id: contacts.id });

      const [openLead] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.contactId, contact!.id), isNull(leads.deletedAt)))
        .orderBy(desc(leads.createdAt))
        .limit(1);

      await tx
        .insert(whatsappMessages)
        .values({
          contactId: contact!.id,
          leadId: openLead?.id ?? null,
          direction: 'inbound',
          wamid: event.wamid,
          messageType: event.messageType,
          body: event.body,
          occurredAt: event.timestamp,
        })
        .onConflictDoNothing();

      if (openLead) {
        await tx.insert(leadActivities).values({
          leadId: openLead.id,
          contactId: contact!.id,
          kind: 'wa_in',
          actorType: 'customer',
          body: event.body,
          occurredAt: event.timestamp,
        });
        await tx
          .update(leads)
          .set({ lastActivityAt: event.timestamp })
          .where(eq(leads.id, openLead.id));
      }

      await tx
        .update(whatsappWebhookEvents)
        .set({ processedAt: sql`now()` })
        .where(eq(whatsappWebhookEvents.id, eventId));
    });
    return;
  }

  if (event.kind === 'status') {
    await db.transaction(async (tx) => {
      const timestamps: Record<string, unknown> = {};
      if (event.status === 'delivered') timestamps.deliveredAt = event.timestamp;
      if (event.status === 'read') timestamps.readAt = event.timestamp;
      if (event.status === 'failed') timestamps.failedAt = event.timestamp;

      await tx
        .update(whatsappMessages)
        .set({ status: event.status, errorCode: event.errorCode, ...timestamps })
        .where(eq(whatsappMessages.wamid, event.wamid));

      await tx
        .update(whatsappOutbox)
        .set({ deliveryStatus: event.status })
        .where(eq(whatsappOutbox.providerMessageId, event.wamid));

      await tx
        .update(whatsappWebhookEvents)
        .set({ processedAt: sql`now()` })
        .where(eq(whatsappWebhookEvents.id, eventId));
    });
    return;
  }

  // Template and quality updates are retained raw. They matter operationally —
  // a paused template silently stops lead alerts — but acting on them is the
  // owner's decision, so they are surfaced rather than automated.
  await db
    .update(whatsappWebhookEvents)
    .set({ processedAt: sql`now()` })
    .where(eq(whatsappWebhookEvents.id, eventId));
}
