/**
 * Global settings and the audit trail.
 *
 * Unknown business facts — real Instagram/Facebook URLs, address, service area,
 * legal registration details — live here behind `needsReview`, never inline in
 * block copy. One checklist to clear before launch, and no risk of an invented
 * phone number getting copy-pasted into three locales of three pages.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
    // The unfiltered "what happened lately" view, which is the one the owner
    // actually opens. Includes id so keyset pagination stays on the index
    // instead of degrading to a sort once the log grows.
    index('audit_recent_idx').on(t.occurredAt.desc(), t.id.desc()),
  ],
);

/**
 * Fixed-window rate limiting.
 *
 * Hand-rolled against the existing Drizzle pool rather than pulling in
 * `rate-limiter-flexible`: its Postgres backend expects a `pg` Pool, and this
 * project uses postgres-js. Adding `pg` purely for this would mean a second
 * connection pool competing for Railway's shared connection ceiling — a real
 * operational cost for what is a two-column upsert.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    /** Start of the fixed window, in epoch milliseconds. */
    windowStart: bigint('window_start', { mode: 'number' }).notNull(),
    count: integer('count').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('rate_limits_expiry_idx').on(t.expiresAt),
  ],
);
