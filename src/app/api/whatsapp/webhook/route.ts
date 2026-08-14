import { timingSafeEqual } from 'node:crypto';

import { after, NextResponse, type NextRequest } from 'next/server';

import { db } from '@/db/client';
import { whatsappWebhookEvents } from '@/db/schema';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { whatsapp } from '@/lib/whatsapp';
import { applyEvent, parseEnvelope } from '@/lib/whatsapp/webhook';

/**
 * Meta webhook.
 *
 * Excluded from `proxy.ts` on purpose — see `isExcluded` there. The signature
 * is an HMAC over the raw request bytes, so anything that buffers, parses or
 * re-serialises the body first breaks every genuine delivery.
 *
 * The response codes are chosen deliberately, because Meta retries a non-200
 * for up to seven days:
 *
 *   bad signature      403  Forgery gets no retries. If the signature broke for
 *                           real Meta traffic then our App Secret is wrong, and
 *                           a week of retries is time to fix it losing nothing.
 *   unparseable body   200  A retry can never help, and refusing would buy a
 *                           week-long storm for a payload we will never accept.
 *   database failure   500  A retry genuinely helps — the event is otherwise
 *                           lost, and Meta will not send it again.
 */

/** Constant-time compare of two short secrets. */
function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Subscription handshake.
 *
 * Meta calls this once when the webhook URL is saved. The challenge must come
 * back as bare text — a JSON-wrapped body fails verification with no
 * explanation beyond "the callback URL couldn't be validated".
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected || mode !== 'subscribe' || !token || !secretsMatch(token, expected)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return new NextResponse(challenge ?? '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  // First line, before anything else touches the request: the digest is over
  // exactly these bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!whatsapp().verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ hasSignature: Boolean(signature) }, 'whatsapp webhook signature rejected');
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn('whatsapp webhook payload was not JSON');
    return new NextResponse('OK', { status: 200 });
  }

  const events = parseEnvelope(payload);
  if (events.length === 0) return new NextResponse('OK', { status: 200 });

  // Persisted synchronously: the 200 tells Meta we own this event, so it has to
  // be durable before the response leaves.
  const stored: Array<{ id: bigint; event: (typeof events)[number] }> = [];
  try {
    for (const event of events) {
      const [row] = await db
        .insert(whatsappWebhookEvents)
        .values({
          eventKey: event.eventKey,
          kind: event.kind,
          wamid: event.wamid,
          phoneNumberId: event.phoneNumberId,
          fromPhoneE164: event.kind === 'message' ? event.from : null,
          raw: payload as never,
        })
        // A duplicate is the expected case, not an error: Meta redelivers.
        .onConflictDoNothing({ target: whatsappWebhookEvents.eventKey })
        .returning({ id: whatsappWebhookEvents.id });

      if (row) stored.push({ id: row.id, event });
    }
  } catch (error) {
    logger.error({ err: error }, 'whatsapp webhook could not be persisted');
    return new NextResponse('Storage failure', { status: 500 });
  }

  // Everything beyond durable capture happens after the response. A slow lead
  // lookup must never turn into a Meta-side timeout and a redelivery.
  if (stored.length > 0) {
    after(async () => {
      for (const item of stored) {
        try {
          await applyEvent(item.event, item.id);
        } catch (error) {
          logger.error(
            { err: error, eventKey: item.event.eventKey },
            'whatsapp webhook event could not be applied',
          );
        }
      }
    });
  }

  return new NextResponse('OK', { status: 200 });
}
