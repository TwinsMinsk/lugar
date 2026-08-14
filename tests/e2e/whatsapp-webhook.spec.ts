import { expect, test } from '@playwright/test';

import {
  APP_SECRET,
  postWebhook as post,
  sign,
  statusEnvelope as envelope,
  VERIFY_TOKEN,
  WEBHOOK_PATH as PATH,
} from './whatsapp-helpers';

/**
 * The Meta webhook, over real HTTP.
 *
 * These assertions can only be made here: the point is what the *route* does
 * with the raw bytes and which status code leaves the server. Meta retries any
 * non-200 for up to seven days, so each code below is a deliberate choice and a
 * regression in one of them is a week-long incident rather than an error.
 */

test.describe('whatsapp webhook', () => {
  test.skip(
    !APP_SECRET || !VERIFY_TOKEN,
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
