import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/db/client';
import { contacts, leadStatuses, leads, user } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { getSession, roleCan } from '@/lib/auth/guards';
import type { Role } from '@/lib/auth/server';

/**
 * CSV export of leads.
 *
 * A route handler rather than a Server Action because the answer is a file, not
 * a UI update. No `runtime` export: Cache Components rejects the route segment
 * config outright, and Node is the only runtime under it anyway. It is the one place the whole customer list leaves the system in
 * one piece, so it is gated on `crm.export` and always writes an audit row —
 * "who took a copy of the customer database, and when" is exactly the question
 * an audit trail exists to answer.
 */
const MAX_ROWS = 5_000;

/**
 * Neutralise spreadsheet formulas.
 *
 * A field beginning with =, +, - or @ is executed as a formula by Excel and
 * Sheets. Lead comments are typed by anonymous visitors, so this is a live
 * injection path into the staff's own machines — `=HYPERLINK(...)` in a comment
 * would run the moment someone opens the export.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  'public_id',
  'created_at',
  'status',
  'assignee',
  'name',
  'phone',
  'email',
  'city',
  'service',
  'budget',
  'locale',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referrer',
  'landing_first',
  'page_context',
  'comment',
] as const;

export async function GET(request: NextRequest) {
  // Route handlers render no layout, so the guard has to be here in full.
  const session = await getSession();
  if (!session?.user || session.user.banned) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!roleCan(session.user.role as Role, 'crm.export')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const statusId = request.nextUrl.searchParams.get('status');
  const assignedToId = request.nextUrl.searchParams.get('assignee');

  const conditions: SQL[] = [isNull(leads.deletedAt)];
  if (statusId) conditions.push(eq(leads.statusId, statusId));
  if (assignedToId === 'none') conditions.push(isNull(leads.assignedToId));
  else if (assignedToId) conditions.push(eq(leads.assignedToId, assignedToId));

  const rows = await db
    .select({
      publicId: leads.publicId,
      createdAt: leads.createdAt,
      status: leadStatuses.label,
      assignee: user.email,
      name: contacts.fullName,
      phone: contacts.phoneE164,
      email: contacts.email,
      city: leads.city,
      service: leads.service,
      budget: leads.budgetBand,
      locale: leads.locale,
      utmSource: leads.utmSource,
      utmMedium: leads.utmMedium,
      utmCampaign: leads.utmCampaign,
      referrer: leads.referrer,
      landingFirst: leads.landingUrlFirst,
      pageContext: leads.pageContext,
      comment: leads.comment,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(leadStatuses, eq(leadStatuses.id, leads.statusId))
    .leftJoin(user, eq(user.id, leads.assignedToId))
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(MAX_ROWS);

  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.publicId),
        csvCell(row.createdAt),
        csvCell((row.status as { ru?: string })?.ru ?? ''),
        csvCell(row.assignee),
        csvCell(row.name),
        csvCell(row.phone),
        csvCell(row.email),
        csvCell(row.city),
        csvCell(row.service),
        csvCell(row.budget),
        csvCell(row.locale),
        csvCell(row.utmSource),
        csvCell(row.utmMedium),
        csvCell(row.utmCampaign),
        csvCell(row.referrer),
        csvCell(row.landingFirst),
        csvCell(row.pageContext),
        csvCell(row.comment),
      ].join(','),
    );
  }

  await recordAudit({
    actorUserId: session.user.id,
    action: 'crm.exported',
    entityType: 'lead',
    after: { rows: rows.length, statusId, assignedToId, truncated: rows.length === MAX_ROWS },
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  });

  // The BOM is what makes Excel read this as UTF-8. Without it, every Cyrillic
  // name in the file opens as mojibake on a Russian or Spanish Windows.
  const body = `﻿${lines.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lugar-leads-${stamp}.csv"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
