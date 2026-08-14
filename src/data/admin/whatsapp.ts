import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { contacts, whatsappMessages, whatsappOutbox } from '@/db/schema';
import { env } from '@/env';
import { requireCapability } from '@/lib/auth/guards';
import { whatsapp } from '@/lib/whatsapp';

/**
 * Reading the WhatsApp side of a conversation.
 *
 * Inbound messages have been recorded by the webhook since it went live. This
 * is what puts them in front of the person answering.
 */

export type ThreadMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  messageType: string;
  templateName: string | null;
  status: string | null;
  errorCode: number | null;
  occurredAt: Date;
};

export type PendingMessage = {
  id: string;
  status: string;
  bodyText: string | null;
  templateName: string | null;
  lastErrorMessage: string | null;
  attemptCount: number;
  createdAt: Date;
};

export type WindowState = {
  /** Whether free-form text may legally be sent right now. */
  open: boolean;
  lastInboundAt: Date | null;
  /** When the window shuts, for the countdown shown to the operator. */
  closesAt: Date | null;
  /** False in fallback mode — the only capability is a click-to-chat link. */
  canSend: boolean;
  mode: string;
};

export async function getWhatsAppThread(contactId: string): Promise<ThreadMessage[]> {
  await requireCapability('whatsapp.read');

  const rows = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.contactId, contactId))
    .orderBy(desc(whatsappMessages.occurredAt))
    .limit(100);

  return rows
    .map((row) => ({
      id: row.id,
      direction: row.direction as 'inbound' | 'outbound',
      body: row.body,
      messageType: row.messageType,
      templateName: row.templateName,
      status: row.status,
      errorCode: row.errorCode,
      occurredAt: row.occurredAt,
    }))
    .reverse();
}

/** Anything queued but not yet delivered, so the operator is not left guessing. */
export async function getPendingMessages(leadId: string): Promise<PendingMessage[]> {
  await requireCapability('whatsapp.read');

  const rows = await db
    .select()
    .from(whatsappOutbox)
    .where(
      and(
        eq(whatsappOutbox.leadId, leadId),
        sql`${whatsappOutbox.status} not in ('sent','skipped')`,
      ),
    )
    .orderBy(desc(whatsappOutbox.createdAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    bodyText: row.bodyText,
    templateName: row.templateName,
    lastErrorMessage: row.lastErrorMessage,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
  }));
}

/**
 * The 24-hour service window.
 *
 * Checked here for rendering, again in the send action, and a third time by the
 * worker at claim time. That is not redundancy for its own sake: the window can
 * close between the page rendering and the click, and again between the click
 * and the send.
 */
export async function getWindowState(contactId: string): Promise<WindowState> {
  await requireCapability('whatsapp.read');

  const [row] = await db
    .select({ lastInboundAt: contacts.lastInboundAt })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  const provider = whatsapp();
  const lastInboundAt = row?.lastInboundAt ?? null;
  // Five minutes of margin, matching the worker: a message posted at 23:59:59
  // would otherwise expire in flight.
  const closesAt = lastInboundAt
    ? new Date(lastInboundAt.getTime() + (23 * 60 + 55) * 60 * 1000)
    : null;

  return {
    open: closesAt !== null && closesAt.getTime() > Date.now(),
    lastInboundAt,
    closesAt,
    canSend: provider.canSendProgrammatically,
    mode: provider.mode,
  };
}

export type ApprovedTemplate = {
  name: string;
  language: string;
  category: string;
  /** Body text with {{1}} placeholders, so the operator sees what will be sent. */
  body: string;
  variableCount: number;
};

/**
 * Templates that Meta has actually approved.
 *
 * Fetched from the Graph API rather than configured by hand. A hardcoded list
 * would be an invented business fact: it would show the operator a template
 * that may have been rejected or paused hours ago, and the send would fail with
 * an error they cannot act on.
 *
 * Returns an empty list when the integration is not configured or the call
 * fails — the UI then says so, which is honest, instead of offering a picker
 * that cannot work.
 */
export async function listApprovedTemplates(): Promise<ApprovedTemplate[]> {
  await requireCapability('whatsapp.send');

  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID || !env.WHATSAPP_ACCESS_TOKEN) return [];

  try {
    const url = new URL(
      `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    );
    url.searchParams.set('fields', 'name,status,category,language,components');
    url.searchParams.set('limit', '100');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      data?: Array<{
        name?: string;
        status?: string;
        category?: string;
        language?: string;
        components?: Array<{ type?: string; text?: string }>;
      }>;
    };

    return (payload.data ?? [])
      // Only APPROVED is sendable. A paused or rejected template fails at send
      // time with a code the operator cannot do anything about.
      .filter((template) => template.status === 'APPROVED')
      .map((template) => {
        const body = template.components?.find((c) => c.type === 'BODY')?.text ?? '';
        const placeholders = new Set(body.match(/\{\{(\d+)\}\}/g) ?? []);
        return {
          name: template.name ?? '',
          language: template.language ?? 'ru',
          category: template.category ?? 'UTILITY',
          body,
          variableCount: placeholders.size,
        };
      })
      .filter((template) => template.name !== '');
  } catch {
    return [];
  }
}
