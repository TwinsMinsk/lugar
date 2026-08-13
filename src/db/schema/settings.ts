/**
 * Global settings and the audit trail.
 *
 * Unknown business facts — real Instagram/Facebook URLs, address, service area,
 * legal registration details — live here behind `needsReview`, never inline in
 * block copy. One checklist to clear before launch, and no risk of an invented
 * phone number getting copy-pasted into three locales of three pages.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { ts, timestamps, uuid7 } from './_shared';

export const siteSettings = pgTable(
  'site_settings',
  {
    id: uuid7(),
    key: text('key').notNull(),
    /** Null means "awaiting a real value from the owner" — see needsReview. */
    value: jsonb('value'),
    /** Grouping for the admin UI: 'contact' | 'social' | 'seo' | 'legal' | … */
    group: text('group').notNull().default('general'),
    /** true = placeholder awaiting a real value from the owner. */
    needsReview: boolean('needs_review').notNull().default(false),
    description: text('description'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('site_settings_key_uq').on(t.key),
    index('site_settings_review_idx')
      .on(t.needsReview)
      .where(sql`needs_review`),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid7(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // 'publish' | 'rollback' | 'lead.status_change' | …
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    /** Summaries only. Never full secrets, never raw form bodies. */
    before: jsonb('before'),
    after: jsonb('after'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    result: text('result').notNull().default('ok'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId, t.occurredAt.desc()),
    index('audit_actor_idx').on(t.actorUserId, t.occurredAt.desc()),
  ],
);
