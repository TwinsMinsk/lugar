import { createHmac } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

/**
 * Talking to the webhook the way Meta does.
 *
 * Shared by the webhook spec and the CRM spec, and kept out of a `.spec` file
 * because Playwright refuses to let one test file import another.
 */
export const WEBHOOK_PATH = '/api/whatsapp/webhook';

export const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
export const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

export function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET!).update(body, 'utf8').digest('hex')}`;
}

/**
 * Posts the exact bytes given.
 *
 * Given `content-type: application/json`, Playwright JSON-encodes a string
 * body — so `this is not json` would arrive as `"this is not json"`, the digest
 * would no longer match, and the route would answer 403 for a reason that has
 * nothing to do with the route. These tests are about exact bytes, so a Buffer
 * is used and the bytes are pinned.
 */
export function postWebhook(request: APIRequestContext, body: string, signature?: string) {
  return request.post(WEBHOOK_PATH, {
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    data: Buffer.from(body, 'utf8'),
  });
}

export function statusEnvelope(wamid: string, status = 'delivered'): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '900',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '55501' },
              statuses: [{ id: wamid, status, timestamp: '1786700000' }],
            },
          },
        ],
      },
    ],
  });
}

/** An inbound customer message — what opens the 24-hour service window. */
export function inboundEnvelope(options: { wamid: string; from: string; text: string }): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '900',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '55501' },
              contacts: [{ wa_id: options.from }],
              messages: [
                {
                  id: options.wamid,
                  from: options.from,
                  type: 'text',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: options.text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}
