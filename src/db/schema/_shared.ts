/**
 * Shared column helpers and enums.
 *
 * Two ID strategies, applied deliberately:
 *   - `uuid7()` for anything that appears in a URL, a CSV export or a webhook
 *     correlation. Sequential integers there would leak business volume and
 *     invite enumeration. UUIDv7 keeps B-tree insert locality, so we avoid
 *     v4's random-insert page splits.
 *   - `bigserial` for append-only logs that are never exposed externally
 *     (activities, audit, webhook events). The index stays hot, ordering by id
 *     is meaningful, and 8 bytes beats 16.
 *
 * All timestamps are `timestamptz` and stored in UTC. Operational dates are
 * rendered in Europe/Madrid at the presentation layer only.
 */
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const uuid7 = () => uuid('id').primaryKey().$defaultFn(uuidv7);

export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const timestamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft-delete pair. Operational content is archived, never hard-deleted. */
export const softDelete = {
  archivedAt: ts('archived_at'),
  deletedAt: ts('deleted_at'),
};

export const LOCALES = ['ru', 'es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
