import { createHmac } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The Meta webhook, over real HTTP.
 *
 * These assertions can only be made here: the point is what the *route* does
 * with the raw bytes and which status code leaves the server. Meta retries any
 * non-200 for up to seven days, so each code below is a deliberate choice and a
 * regression in one of them is a week-long incident rather than an error.
 */
const SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

const PATH = '/api/whatsapp/webhook';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET!).update(body, 'utf8').digest('hex')}`;
}

/**
 * Bodies are sent as Buffers, never as strings.
 *
 * Given `content-type: application/json`, Playwright JSON-encodes a string
 * body — so `this is not json` arrives as `"this is not json"`, the digest no
 * longer matches, and the route answers 403 for a reason that has nothing to do
 * with the route. These tests are about exact bytes, so the bytes are pinned.
 */
function post(request: APIRequestContext, body: string, signature?: string) {
  return request.post(PATH, {
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    data: Buffer.from(body, 'utf8'),
  });
}

function envelope(wamid: string) {
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
              statuses: [{ id: wamid, status: 'delivered', timestamp: '1786700000' }],
            },
          },
        ],
      },
    ],
  });
}

test.describe('whatsapp webhook', () => {
  test.skip(
    !SECRET || !VERIFY_TOKEN,
    'WHATSAPP_APP_SECRET / WHATSAPP_WEBHOOK_VERIFY_TOKEN are not set',
  );

  test('completes the subscription handshake with the challenge as plain text', async ({
    request,
  }) => {
    const response = await request.get(
      `${PATH}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=7788`,
    );

    expect(response.status()).toBe(200);
    // Bare text. A JSON-wrapped body fails Meta's validation with no
    // explanation beyond "the callback URL couldn't be validated".
    expect(await response.text()).toBe('7788');
  });

  test('refuses the handshake when the verify token is wrong', async ({ request }) => {
    const response = await request.get(
      `${PATH}?hub.mode=subscribe&hub.verify_token=not-the-token&hub.challenge=7788`,
    );
    expect(response.status()).toBe(403);
  });

  test('accepts a correctly signed delivery', async ({ request }) => {
    const body = envelope(`wamid.E2E.${Date.now()}`);
    const response = await post(request, body, sign(body));
    expect(response.status()).toBe(200);
  });

  test('rejects an unsigned delivery with 403, which earns no retries', async ({ request }) => {
    const response = await post(request, envelope('wamid.unsigned'));
    expect(response.status()).toBe(403);
  });

  /**
   * The guard this design exists for.
   *
   * A signature computed over re-serialised JSON is what any handler that
   * parses before verifying would produce. Accepting it would mean the
   * verification is not actually checking the bytes Meta signed.
   */
  test('rejects a signature computed over re-serialised JSON', async ({ request }) => {
    const raw = `{"object":"whatsapp_business_account",  "entry":[ ]}`;
    const response = await post(request, raw, sign(JSON.stringify(JSON.parse(raw))));
    expect(response.status()).toBe(403);

    // And the same body with the right signature is accepted, so this is not
    // simply "everything is rejected".
    expect((await post(request, raw, sign(raw))).status()).toBe(200);
  });

  test('answers 200 to a signed payload that is not JSON at all', async ({ request }) => {
    // A retry can never help here, and refusing would buy a week-long storm for
    // a body we will never accept.
    const body = 'this is not json';
    const response = await post(request, body, sign(body));
    expect(response.status()).toBe(200);
  });

  test('is idempotent when Meta redelivers the same event', async ({ request }) => {
    const body = envelope(`wamid.DUP.${Date.now()}`);
    const signature = sign(body);

    const first = await post(request, body, signature);
    const second = await post(request, body, signature);

    // Redelivery is the expected case, not an error — Meta guarantees it.
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
  });
});
