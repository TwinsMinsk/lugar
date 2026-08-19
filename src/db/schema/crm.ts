/**
 * CRM schema.
 *
 * Index choices are driven by the four query shapes that actually run:
 *   1. lead board/list  — filter by status + assignee, keyset-paginate by date
 *   2. inbound WhatsApp — exact E.164 lookup on contacts
 *   3. dashboard        — UTM source rollups over a date range
 *   4. my tasks         — open tasks by assignee and due date
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { localeEnum } from './content';
import { softDelete, ts, timestamps, uuid7 } from './_shared';

export const contactSource = pgEnum('contact_source', [
  'web_form',
  'whatsapp_inbound',
  'manual',
  'import',
  'phone_call',
]);

export const activityKind = pgEnum('activity_kind', [
  'form_submitted',
  'status_changed',
  'assigned',
  'note',
  'task_created',
  'task_completed',
  'file_added',
  'wa_out',
  'wa_in',
  'wa_status',
  'email_out',
  'call',
  'exported',
]);

export const actorType = pgEnum('actor_type', ['system', 'user', 'customer']);

export const consentPurpose = pgEnum('consent_purpose', [
  'personal_data',
  'whatsapp_contact',
  'marketing',
]);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid7(),
    phoneE164: varchar('phone_e164', { length: 20 }).notNull(),
    phoneCountry: varchar('phone_country', { length: 2 }),
    fullName: text('full_name'),
    email: text('email'),
    city: text('city'),
    preferredLocale: localeEnum('preferred_locale').notNull().default('ru'),
    source: contactSource('source').notNull().default('web_form'),
    waOptIn: boolean('wa_opt_in').notNull().default(false),

    /**
     * Set from inbound WhatsApp webhooks. Drives the 24h service window.
     *
     * There is deliberately no generated `wa_window_expires_at` column here.
     * `timestamptz + interval` is only STABLE, not IMMUTABLE (interval
     * arithmetic crosses DST and therefore depends on the session TimeZone), so
     * Postgres rejects it in a generation expression. It is also unnecessary:
     * putting the interval on the *constant* side of the comparison —
     * `last_inbound_at > now() - interval '23 hours 55 minutes'` — is a plain
     * range scan on the index below, and needs no cleverness at all.
     */
    lastInboundAt: ts('last_inbound_at'),

    notes: text('notes'),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('contacts_phone_uq').on(t.phoneE164),
    // Suffix probe for ambiguity detection only. Never used to auto-merge
    // identities — a 9-digit collision is how you leak one customer's history
    // to another.
    index('contacts_phone_suffix_idx').on(sql`right(${t.phoneE164}, 9)`),
    // Serves the service-window predicate:
    //   last_inbound_at > now() - interval '23 hours 55 minutes'
    index('contacts_last_inbound_idx')
      .on(t.lastInboundAt.desc())
      .where(sql`last_inbound_at is not null`),
    index('contacts_email_idx')
      .on(t.email)
      .where(sql`email is not null`),
  ],
);

export const leadStatuses = pgTable(
  'lead_statuses',
  {
    id: uuid7(),
    slug: varchar('slug', { length: 48 }).notNull(),
    /** Steps of 100 so reordering is one UPDATE, not a renumber of the table. */
    sortOrder: integer('sort_order').notNull(),
    label: jsonb('label').notNull(),
    color: varchar('color', { length: 16 }).notNull().default('#8a8a8a'),
    /** Exactly one status is the entry point for new leads. */
    isDefaultEntry: boolean('is_default_entry').notNull().default(false),
    // Flags, never a string comparison on slug, so renaming a status is safe.
    isWon: boolean('is_won').notNull().default(false),
    isLost: boolean('is_lost').notNull().default(false),
    isTerminal: boolean('is_terminal').notNull().default(false),
    archivedAt: ts('archived_at'),
    ...timestamps,
  },
  (t) => [
    unique('lead_statuses_slug_uq').on(t.slug),
    uniqueIndex('lead_statuses_default_entry_uq')
      .on(t.isDefaultEntry)
      .where(sql`is_default_entry`),
    index('lead_statuses_order_idx').on(t.sortOrder),
  ],
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid7(),
    /** The idempotency gate. One insert here decides whether a lead is created. */
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    formKey: varchar('form_key', { length: 48 }).notNull(),
    locale: localeEnum('locale').notNull(),
    leadId: uuid('lead_id'),
    contactId: uuid('contact_id'),
    /** Redacted payload — never the raw body, never secrets. */
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    attribution: jsonb('attribution')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('form_submissions_idempotency_uq').on(t.idempotencyKey),
    index('form_submissions_created_idx').on(t.createdAt.desc()),
  ],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid7(),
    /** Short human reference used in the UI and WhatsApp alerts, e.g. LG-7F3K2Q. */
    publicId: varchar('public_id', { length: 16 }).notNull(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => leadStatuses.id, { onDelete: 'restrict' }),
    assignedToId: text('assigned_to_id').references(() => user.id, { onDelete: 'set null' }),
    submissionId: uuid('submission_id'),

    service: varchar('service', { length: 48 }),
    city: text('city'),
    comment: text('comment'),
    budgetBand: varchar('budget_band', { length: 24 }),
    estimatedValueEur: bigint('estimated_value_eur', { mode: 'number' }),
    locale: localeEnum('locale').notNull(),

    // --- attribution ---
    utmSource: varchar('utm_source', { length: 200 }),
    utmMedium: varchar('utm_medium', { length: 200 }),
    utmCampaign: varchar('utm_campaign', { length: 200 }),
    utmContent: varchar('utm_content', { length: 200 }),
    utmTerm: varchar('utm_term', { length: 200 }),
    referrer: text('referrer'),
    landingUrlFirst: text('landing_url_first'),
    landingUrlLast: text('landing_url_last'),
    pageContext: text('page_context'),
    blockContext: varchar('block_context', { length: 64 }),
    projectSlug: varchar('project_slug', { length: 96 }),

    /** Soft hint only. Identities are never merged automatically. */
    possibleDuplicateOfId: uuid('possible_duplicate_of_id'),

    statusChangedAt: ts('status_changed_at').notNull().defaultNow(),
    lastActivityAt: ts('last_activity_at').notNull().defaultNow(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [
    unique('leads_public_id_uq').on(t.publicId),
    foreignKey({
      columns: [t.possibleDuplicateOfId],
      foreignColumns: [t.id],
      name: 'leads_possible_duplicate_fk',
    }).onDelete('set null'),
    // (1) board/list: status + assignee filter, keyset pagination by date.
    // Both of these carry `archived_at is null` to match the reads and to match
    // leads_assignee_activity_idx below, which already did. An archived lead is
    // out of the inbox, the board and every count.
    index('leads_board_idx')
      .on(t.statusId, t.assignedToId, t.createdAt.desc(), t.id.desc())
      .where(sql`deleted_at is null and archived_at is null`),
    // Unfiltered "all leads, newest first" — Postgres cannot skip leading
    // index columns, so this needs its own index.
    index('leads_created_idx')
      .on(t.createdAt.desc())
      .where(sql`deleted_at is null and archived_at is null`),
    index('leads_archived_idx')
      .on(t.archivedAt.desc())
      .where(sql`archived_at is not null and deleted_at is null`),
    index('leads_assignee_activity_idx')
      .on(t.assignedToId, t.lastActivityAt.desc())
      .where(sql`deleted_at is null and archived_at is null`),
    index('leads_contact_idx').on(t.contactId, t.createdAt.desc()),
    // (3) dashboard UTM rollups.
    index('leads_utm_rollup_idx')
      .on(t.utmSource, t.createdAt.desc())
      .where(sql`deleted_at is null`),
  ],
);

export const leadActivities = pgTable(
  'lead_activities',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    kind: activityKind('kind').notNull(),
    actorType: actorType('actor_type').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body'),
    payload: jsonb('payload'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('lead_activities_lead_idx').on(t.leadId, t.occurredAt.desc()),
    // The WhatsApp thread view on the lead detail page.
    index('lead_activities_contact_wa_idx')
      .on(t.contactId, t.occurredAt.desc())
      .where(sql`kind in ('wa_in','wa_out','wa_status')`),
  ],
);

export const leadAssignments = pgTable(
  'lead_assignments',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id').references(() => user.id, { onDelete: 'set null' }),
    toUserId: text('to_user_id').references(() => user.id, { onDelete: 'set null' }),
    assignedByUserId: text('assigned_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    assignedAt: ts('assigned_at').notNull().defaultNow(),
  },
  (t) => [index('lead_assignments_lead_idx').on(t.leadId, t.assignedAt.desc())],
);

export const leadTasks = pgTable(
  'lead_tasks',
  {
    id: uuid7(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    details: text('details'),
    kind: varchar('kind', { length: 32 }).notNull().default('followup'),
    dueAt: ts('due_at'),
    completedAt: ts('completed_at'),
    ...timestamps,
  },
  (t) => [
    // (4) "my open tasks" and the overdue count on the dashboard.
    index('lead_tasks_open_idx')
      .on(t.assigneeId, t.dueAt)
      .where(sql`completed_at is null`),
    index('lead_tasks_lead_idx').on(t.leadId),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid7(),
    code: varchar('code', { length: 24 }).notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    managerId: text('manager_id').references(() => user.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    stage: varchar('stage', { length: 32 }).notNull().default('measuring'),
    contractValueEur: bigint('contract_value_eur', { mode: 'number' }),
    startedAt: ts('started_at'),
    dueAt: ts('due_at'),
    deliveredAt: ts('delivered_at'),
    notes: text('notes'),
    ...softDelete,
    ...timestamps,
  },
  (t) => [
    unique('projects_code_uq').on(t.code),
    index('projects_contact_idx').on(t.contactId),
    index('projects_stage_idx')
      .on(t.stage, t.dueAt)
      .where(sql`deleted_at is null`),
  ],
);

export const projectFiles = pgTable(
  'project_files',
  {
    id: uuid7(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    /**
     * orphan   — uploaded, form not yet submitted. Reaped after 24h.
     * attached — bound to a lead/project inside the submission transaction.
     *
     * Uploads happen BEFORE the transaction: holding a pooled connection open
     * while streaming megabytes to object storage is the classic way to
     * exhaust the pool.
     */
    status: varchar('status', { length: 16 }).notNull().default('orphan'),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_files_storage_key_uq').on(t.storageKey),
    index('project_files_orphan_idx')
      .on(t.status, t.createdAt)
      .where(sql`status = 'orphan'`),
    index('project_files_lead_idx').on(t.leadId),
  ],
);

/** Append-only. There is no update path — a withdrawal is a new row. */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').references(() => formSubmissions.id, {
      onDelete: 'set null',
    }),
    purpose: consentPurpose('purpose').notNull(),
    granted: boolean('granted').notNull(),
    policyVersion: varchar('policy_version', { length: 32 }).notNull(),
    /** Hash of the exact consent text shown, so a later edit stays auditable. */
    policyTextHash: varchar('policy_text_hash', { length: 64 }).notNull(),
    locale: localeEnum('locale').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('consent_contact_idx').on(t.contactId, t.purpose, t.createdAt.desc())],
);
