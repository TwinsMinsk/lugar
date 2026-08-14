import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env, publicEnv } from '@/env';
import { whatsappLink } from '@/lib/routes';
import { sendTemplateViaCloudApi, sendTextViaCloudApi } from './cloud-api';
import type { SendResult, SendTemplateParams, SendTextParams, WhatsAppProvider } from './provider';

/**
 * Signature verification, shared by every mode.
 *
 * HMAC-SHA256 over the RAW request body bytes, keyed by the Meta App Secret —
 * not the access token. Compared in constant time.
 *
 * The raw body matters: any middleware or handler that parses and re-serialises
 * the JSON before this runs will produce a different digest and reject every
 * genuine delivery. Because Meta retries a non-200 for seven days, that
 * mistake is a week-long failure rather than a single error.
 */
function verifySignature(rawBody: string, header: string | null, appSecret?: string): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  try {
    const received = Buffer.from(header.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

function handoffLink(text?: string): string {
  return whatsappLink(publicEnv.whatsappPhone, text);
}

/**
 * `fallback` — the safe default and the mode the site can launch in before
 * Meta business verification completes. It cannot send anything; its entire
 * job is to build a click-to-chat link. Forms still create CRM leads, and the
 * admin reports the integration as not configured rather than pretending a
 * personal WhatsApp conversation is being synchronised.
 */
class FallbackProvider implements WhatsAppProvider {
  readonly mode = 'fallback' as const;
  readonly canSendProgrammatically = false;

  async sendText(): Promise<SendResult> {
    return { status: 'skipped', reason: 'no_programmatic_send' };
  }

  async sendTemplate(): Promise<SendResult> {
    return { status: 'skipped', reason: 'no_programmatic_send' };
  }

  buildHandoffLink({ text }: { text?: string }) {
    return handoffLink(text);
  }

  verifyWebhookSignature(rawBody: string, header: string | null) {
    return verifySignature(rawBody, header, env.WHATSAPP_APP_SECRET);
  }
}

/**
 * `mock` — exercises the entire outbox path (claim, attempt, status update)
 * without a network call, so tests and staging behave like production without
 * any risk of messaging a real person.
 */
class MockProvider implements WhatsAppProvider {
  readonly mode = 'mock' as const;
  readonly canSendProgrammatically = true;

  async sendText(params: SendTextParams): Promise<SendResult> {
    return { status: 'sent', providerMessageId: `mock_${hash(params.to + params.body)}` };
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    return { status: 'sent', providerMessageId: `mock_${hash(params.to + params.name)}` };
  }

  buildHandoffLink({ text }: { text?: string }) {
    return handoffLink(text);
  }

  verifyWebhookSignature(rawBody: string, header: string | null) {
    return verifySignature(rawBody, header, env.WHATSAPP_APP_SECRET);
  }
}

/**
 * `cloud_api` — the real integration.
 *
 * Note what this class does *not* do: retry, back off, or decide when to give
 * up. Those belong to the outbox worker, where the state survives the process
 * being restarted mid-send. A provider that retried in memory would lose the
 * attempt count on every deploy.
 */
class CloudApiProvider implements WhatsAppProvider {
  readonly mode = 'cloud_api' as const;
  readonly canSendProgrammatically = true;

  async sendText(params: SendTextParams): Promise<SendResult> {
    return sendTextViaCloudApi(params);
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    return sendTemplateViaCloudApi(params);
  }

  buildHandoffLink({ text }: { text?: string }) {
    // Still offered in cloud_api mode: outside the 24h window a link the staff
    // member opens on their own phone is the only way to start a conversation
    // that no approved template covers.
    return handoffLink(text);
  }

  verifyWebhookSignature(rawBody: string, header: string | null) {
    return verifySignature(rawBody, header, env.WHATSAPP_APP_SECRET);
  }
}

function hash(input: string): string {
  return createHmac('sha256', 'mock').update(input).digest('hex').slice(0, 24);
}

let cached: WhatsAppProvider | null = null;

export function whatsapp(): WhatsAppProvider {
  if (cached) return cached;

  switch (env.WHATSAPP_MODE) {
    case 'mock':
      cached = new MockProvider();
      break;
    case 'cloud_api':
      cached = new CloudApiProvider();
      break;
    default:
      cached = new FallbackProvider();
  }

  return cached;
}

export { verifySignature };
export type { WhatsAppProvider };
