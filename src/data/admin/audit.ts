import 'server-only';

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { auditLog, user } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Reading the audit trail.
 *
 * The log has been written since the first migration; this is what makes it
 * answerable. A trail nobody can read is a compliance artefact, not a control —
 * the point is that the owner can see who published, who changed a role and who
 * deleted a redirect, without asking a developer to run SQL.
 *
 * Owner-only (`audit.read`). It records IP addresses and who did what, which is
 * exactly the sort of thing a disgruntled account should not be able to read
 * before covering its tracks.
 */

export type AuditEntry = {
  id: string;
  occurredAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  result: string;
  actorEmail: string | null;
  actorName: string | null;
  ipAddress: string | null;
  before: unknown;
  after: unknown;
};

export type AuditPage = {
  entries: AuditEntry[];
  /** Opaque cursor for the next page, or null at the end. */
  nextCursor: string | null;
};

export type AuditFilter = {
  action?: string;
  actorUserId?: string;
  entityType?: string;
  cursor?: string;
  limit?: number;
};

const MAX_LIMIT = 100;

function encodeCursor(entry: { occurredAt: Date; id: string }): string {
  return `${entry.occurredAt.toISOString()}|${entry.id}`;
}

/** Returns null for anything malformed — a bad cursor shows page one, not a 500. */
function decodeCursor(raw: string): { occurredAt: Date; id: string } | null {
  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;
  const occurredAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(occurredAt.getTime()) || id.length === 0) return null;
  return { occurredAt, id };
}

/**
 * One page of the trail, newest first.
 *
 * Keyset rather than OFFSET: entries arrive constantly, and with OFFSET a row
 * written between two page loads shifts everything down — the reader silently
 * skips an entry, which is the one failure an audit log must not have.
 */
export async function listAuditEntries(filter: AuditFilter = {}): Promise<AuditPage> {
  await requireCapability('audit.read');

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT);

  const conditions: SQL[] = [];
  if (filter.action) conditions.push(eq(auditLog.action, filter.action));
  if (filter.actorUserId) conditions.push(eq(auditLog.actorUserId, filter.actorUserId));
  if (filter.entityType) conditions.push(eq(auditLog.entityType, filter.entityType));

  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  if (cursor) {
    // Row-value comparison, so this stays a single index range scan on
    // (occurred_at desc, id desc) rather than a filter over everything newer.
    conditions.push(
      sql`(${auditLog.occurredAt}, ${auditLog.id}) < (${cursor.occurredAt}, ${cursor.id})`,
    );
  }

  const rows = await db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      result: auditLog.result,
      ipAddress: auditLog.ipAddress,
      before: auditLog.before,
      after: auditLog.after,
      actorEmail: user.email,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    // One extra row is how we know there is a next page without counting.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    entries: page.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      result: row.result,
      actorEmail: row.actorEmail,
      actorName: row.actorName,
      ipAddress: row.ipAddress,
      before: row.before,
      after: row.after,
    })),
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/** Distinct actions actually present, for the filter — never a hardcoded list. */
export async function listAuditActions(): Promise<string[]> {
  await requireCapability('audit.read');

  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action);

  return rows.map((row) => row.action);
}

/** Everyone who appears in the trail, including accounts since removed. */
export async function listAuditActors(): Promise<Array<{ id: string; email: string }>> {
  await requireCapability('audit.read');

  const rows = await db
    .selectDistinct({ id: user.id, email: user.email })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorUserId))
    .orderBy(user.email);

  return rows;
}
