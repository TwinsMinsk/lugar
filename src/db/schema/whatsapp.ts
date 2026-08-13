/**
 * WhatsApp integration schema.
 *
 * Three concerns, three tables:
 *   - `whatsappOutbox`        durable send queue, written inside the same
 *                             transaction as the lead. Commit is the
 *                             durability boundary; the worker only drains it.
 *   - `whatsappWebhookEvents` raw inbound envelope, deduped on a provider key.
 *                             Meta retries any non-200 for up to seven days, so
 *                             duplicates are guaranteed, not hypothetical.
 *   - `notificationAttempts`  one row per delivery attempt, on any channel.
 *                             Channel-agnostic on purpose: when WhatsApp is
 *                             blocked or dead, an email alert must still fire,
 *                             because the CRM cannot be the only place a new
 *                             lead surfaces.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { contacts, leads } from './crm';
import { ts, timestamps, uuid7 } from './_shared';

export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'claimed',
  'sent',
  'failed_retryable',
  'blocked_window',
  'needs_review',
  'dead',
  'skipped',
]);

export const outboxPurpose = pgEnum('outbox_purpose', [
  'internal_new_lead',
  'customer_ack',
  'manual_reply',
  'manual_template',
]);

export const outboxKind = pgEnum('outbox_kind', ['text', 'template']);

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);

export const whatsappOutbox = pgTable(
  'whatsapp_outbox',
  {
    id: uuid7(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    toPhoneE164: varchar('to_phone_e164', { length: 20 }).notNull(),
    purpose: outboxPurpose('purpose').notNull(),
    kind: outboxKind('kind').notNull(),

    bodyText: text('body_text'),
    templateName: varchar('template_name', { length: 128 }),
    templateLanguage: varchar('template_language', { length: 8 }),
    templateVariables: jsonb('template_variables'),

    /**
     * Free-form text is only legal inside the 24h service window. When true the
     * worker re-checks the window at claim time rather than burning an attempt
     * on a guaranteed 131047.
     */
    requiresWindow: boolean('requires_window').notNull().default(true),

    status: outboxStatus('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),

    /** Lease, so a job claimed by a worker that then crashed is reclaimable. */
    claimedBy: varchar('claimed_by', { length: 64 }),
    claimedUntil: ts('claimed_until'),

    providerMessageId: varchar('provider_message_id', { length: 128 }),
    deliveryStatus: varchar('delivery_status', { length: 16 }),
    lastErrorCode: integer('last_error_code'),
    lastErrorMessage: text('last_error_message'),

    /** Optional application-level dedupe (e.g. one ack per lead). */
    dedupeKey: varchar('dedupe_key', { length: 128 }),

    sentAt: ts('sent_at'),
    deadLetteredAt: ts('dead_lettered_at'),
    ...timestamps,
  },
  (t) => [
    // The claim query's index. Partial, so it stays small no matter how much
    // history accumulates.
    index('wa_outbox_claim_idx')
      .on(t.nextAttemptAt)
      .where(sql`status in ('pending','failed_retryable')`),
    index('wa_outbox_lease_idx')
      .on(t.claimedUntil)
      .where(sql`status = 'claimed'`),
    uniqueIndex('wa_outbox_dedupe_uq')
      .on(t.dedupeKey)
      .where(sql`dedupe_key is not null`),
    index('wa_outbox_wamid_idx')
      .on(t.providerMessageId)
      .where(sql`provider_message_id is not null`),
    index('wa_outbox_lead_idx').on(t.leadId, t.createdAt.desc()),
  ],
);

export const whatsappWebhookEvents = pgTable(
  'whatsapp_webhook_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /**
     * Idempotency key.
     *   msg:{wamid}          for an inbound message
     *   st:{wamid}:{status}  for a status update — sent/delivered/read share a
     *                        wamid but are three distinct, separately-retried
     *                        events.
     */
    eventKey: varchar('event_key', { length: 160 }).notNull(),
    kind: varchar('kind', { length: 24 }).notNull(),
    wamid: varchar('wamid', { length: 128 }),
    phoneNumberId: varchar('phone_number_id', { length: 64 }),
    fromPhoneE164: varchar('from_phone_e164', { length: 20 }),
    /** Retained for traceability. Owner/manager readable only. */
    raw: jsonb('raw').notNull(),
    processedAt: ts('processed_at'),
    processingError: text('processing_error'),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wa_webhook_event_key_uq').on(t.eventKey),
    index('wa_webhook_unprocessed_idx')
      .on(t.receivedAt)
      .where(sql`processed_at is null`),
    index('wa_webhook_from_idx').on(t.fromPhoneE164),
  ],
);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid7(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    outboxId: uuid('outbox_id').references(() => whatsappOutbox.id, { onDelete: 'set null' }),
    direction: messageDirection('direction').notNull(),
    wamid: varchar('wamid', { length: 128 }),
    messageType: varchar('message_type', { length: 24 }).notNull().default('text'),
    body: text('body'),
    mediaKey: text('media_key'),
    templateName: varchar('template_name', { length: 128 }),
    status: varchar('status', { length: 16 }),
    errorCode: integer('error_code'),
    sentAt: ts('sent_at'),
    deliveredAt: ts('delivered_at'),
    readAt: ts('read_at'),
    failedAt: ts('failed_at'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('wa_messages_wamid_uq')
      .on(t.wamid)
      .where(sql`wamid is not null`),
    index('wa_messages_contact_idx').on(t.contactId, t.occurredAt.desc()),
    index('wa_messages_lead_idx').on(t.leadId, t.occurredAt.desc()),
  ],
);

export const notificationAttempts = pgTable(
  'notification_attempts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    outboxId: uuid('outbox_id').references(() => whatsappOutbox.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 16 }).notNull(), // whatsapp | email
    target: text('target').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    /** Request shape for debugging. Tokens are redacted before this is written. */
    requestSummary: jsonb('request_summary'),
    httpStatus: integer('http_status'),
    providerCode: integer('provider_code'),
    providerMessageId: varchar('provider_message_id', { length: 128 }),
    errorPayload: jsonb('error_payload'),
    latencyMs: integer('latency_ms'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    index('notification_attempts_outbox_idx').on(t.outboxId, t.attemptNo),
    index('notification_attempts_started_idx').on(t.startedAt.desc()),
  ],
);
