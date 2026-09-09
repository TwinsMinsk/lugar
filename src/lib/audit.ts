import 'server-only';

import { headers } from 'next/headers';

import { clientIp } from '@/lib/client-ip';

import { db, type Database } from '@/db/client';
import { auditLog } from '@/db/schema';

/**
 * Audit trail for privileged actions.
 *
 * Records *summaries*, never full payloads: a `before`/`after` here is meant to
 * answer "who changed what, when" without becoming a second copy of customer
 * personal data or a place secrets can leak into.
 *
 * Accepts a transaction so an audit row commits atomically with the change it
 * describes. An audit entry for a publish that rolled back would be worse than
 * no entry at all.
 */
export type AuditInput = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  result?: 'ok' | 'denied' | 'error';
};

type Tx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export async function recordAudit(input: AuditInput, tx: Tx = db): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: (input.before ?? null) as never,
    after: (input.after ?? null) as never,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    result: input.result ?? 'ok',
  });
}

/**
 * The request-scoped fields every audit row carries.
 *
 * Lived as a private copy in each action file until a fourth one needed it.
 * Must be called inside the action rather than hoisted: `headers()` is
 * per-request, and a value captured once at module load would attribute every
 * later entry to whoever happened to trigger the first.
 */
export async function auditRequestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const headerList = await headers();
  return {
    ipAddress: clientIp(headerList),
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

/** Compact description of a block list, for audit diffs. */
export function summarizeBlocks(blocks: Array<{ type: string; hidden?: boolean }>) {
  return {
    count: blocks.length,
    types: blocks.map((block) => block.type),
    hidden: blocks.filter((block) => block.hidden).length,
  };
}
