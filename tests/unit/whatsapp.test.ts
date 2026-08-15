import { createHmac } from 'node:crypto';

import { parsePhoneNumberWithError } from 'libphonenumber-js/max';
import { describe, expect, it } from 'vitest';

import { spanishMobile } from '../e2e/lead-phone';

import { verifySignature } from '@/lib/whatsapp';
import { normalizeRecipient, orderedParameters } from '@/lib/whatsapp/cloud-api';
import { classifyError } from '@/lib/whatsapp/provider';
import { parseEnvelope } from '@/lib/whatsapp/webhook';
import { backoffMs } from '@/worker/outbox-worker';

const SECRET = 'app-secret-for-tests';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

describe('webhook signature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepts a signature over the exact bytes received', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifySignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, 'nonsense', SECRET)).toBe(false);
    expect(verifySignature(body, 'sha256=zz', SECRET)).toBe(false);
  });

  it('rejects everything when no app secret is configured', () => {
    // Better to reject genuine deliveries loudly than to accept forged ones
    // because a variable was never set.
    expect(verifySignature(body, sign(body), undefined)).toBe(false);
  });

  /**
   * The regression this whole design exists to prevent.
   *
   * Meta signs the raw bytes. Re-serialising the JSON produces a body that is
   * semantically identical and byte-wise different — key order, spacing and
   * number formatting all move. Any handler that parses before verifying would
   * compute this digest and reject every genuine delivery, and because Meta
   * retries a non-200 for seven days, the result is a week-long 403 storm.
   */
  it('rejects a signature computed over re-serialised JSON', () => {
    const raw = '{"object":"whatsapp_business_account",  "entry":[ ]}';
    const reserialised = JSON.stringify(JSON.parse(raw));
    expect(reserialised).not.toBe(raw);
    expect(verifySignature(raw, sign(reserialised), SECRET)).toBe(false);
    // And the correct one still passes, so this is not just "everything fails".
    expect(verifySignature(raw, sign(raw), SECRET)).toBe(true);
  });
});

describe('envelope parsing', () => {
  const inbound = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '55501' },
              messages: [
                {
                  id: 'wamid.AAA',
                  from: '34600112233',
                  type: 'text',
                  timestamp: '1786700000',
                  text: { body: 'Здравствуйте' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('reads an inbound text message', () => {
    const [event] = parseEnvelope(inbound);
    expect(event).toMatchObject({
      kind: 'message',
      eventKey: 'msg:wamid.AAA',
      from: '+34600112233',
      body: 'Здравствуйте',
      phoneNumberId: '55501',
    });
  });

  /**
   * sent, delivered and read share one wamid.
   *
   * Keying on the wamid alone would deduplicate two of the three away, and the
   * delivery timeline would sit at "sent" forever.
   */
  it('gives each status of one message its own key', () => {
    const keys = ['sent', 'delivered', 'read'].map((status) => {
      const [event] = parseEnvelope({
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '55501' },
                  statuses: [
                    {
                      id: 'wamid.BBB',
                      status,
                      timestamp: '1786700001',
                      recipient_id: '34600112233',
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      return event!.eventKey;
    });

    expect(new Set(keys).size).toBe(3);
    expect(keys).toContain('st:wamid.BBB:delivered');
  });

  it('carries a failure code through from a status', () => {
    const [event] = parseEnvelope({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [{ id: 'wamid.CCC', status: 'failed', errors: [{ code: 131047 }] }],
              },
            },
          ],
        },
      ],
    });
    expect(event).toMatchObject({ kind: 'status', status: 'failed', errorCode: 131047 });
  });

  it('reads several events out of one delivery', () => {
    const events = parseEnvelope({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [{ id: 'wamid.1', from: '34600', type: 'text', text: { body: 'a' } }],
                statuses: [{ id: 'wamid.2', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
  });

  it('survives a payload with nothing recognisable in it', () => {
    expect(parseEnvelope({})).toEqual([]);
    expect(parseEnvelope(null)).toEqual([]);
    expect(parseEnvelope({ entry: [{ changes: [{ field: 'unknown', value: {} }] }] })).toEqual([]);
  });

  it('records template status changes so a paused template is visible', () => {
    const [event] = parseEnvelope({
      entry: [
        {
          id: '1234',
          changes: [
            {
              field: 'message_template_status_update',
              value: { message_template_name: 'lead_alert', event: 'PAUSED' },
            },
          ],
        },
      ],
    });
    expect(event).toMatchObject({ kind: 'template_status' });
    expect(event!.eventKey).toContain('lead_alert');
  });
});

describe('error classification', () => {
  it('treats rate limits as retryable and template problems as permanent', () => {
    expect(classifyError(130429)).toBe('retryable');
    expect(classifyError(132001)).toBe('permanent');
  });

  it('routes the out-of-window code to a template rather than a retry', () => {
    // Retrying the same free-form text would fail identically until the window
    // reopens, which may be never.
    expect(classifyError(131047)).toBe('needs_template');
  });

  it('retries unknown 5xx and gives up on unknown 4xx', () => {
    expect(classifyError(999999, 503)).toBe('retryable');
    expect(classifyError(999999, 400)).toBe('permanent');
  });
});

describe('outbox backoff', () => {
  it('grows with each attempt and stays under the ceiling', () => {
    const first = backoffMs(1);
    const later = backoffMs(6);
    expect(first).toBeLessThan(later);
    expect(backoffMs(50)).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('is jittered, so a hundred queued alerts do not retry in lockstep', () => {
    const samples = new Set(Array.from({ length: 25 }, () => backoffMs(3)));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe('cloud api request shaping', () => {
  it('sends digits only — a leading plus is rejected for some numbers', () => {
    expect(normalizeRecipient('+34 600 11 22 33')).toBe('34600112233');
  });

  it('orders template parameters by position, not by object key order', () => {
    // Meta matches body parameters positionally. Object order would render the
    // phone number where the customer's name belongs.
    const params = orderedParameters({ '2': 'Кухни', '10': 'LG-1', '1': 'Мария' });
    expect(params.map((p) => p.text)).toEqual(['Мария', 'Кухни', 'LG-1']);
  });
});

describe('spanish mobile validation', () => {
  /**
   * Pins the rule the end-to-end specs depend on.
   *
   * The app validates with `libphonenumber-js/max`, whose metadata knows number
   * types: +34 79… is not an assigned mobile range and is correctly refused.
   * A spec that builds a test number from the clock behind a 7 therefore fails
   * roughly two times in five, and reads as "lead capture is broken".
   */
  it('accepts every clock-derived number the specs generate', () => {
    for (let i = 0; i < 200; i += 1) {
      const phone = spanishMobile(1786000000000 + i * 9_999_991);
      const parsed = parsePhoneNumberWithError(phone, { defaultCountry: 'RU', extract: false });
      expect(parsed.isValid(), phone).toBe(true);
    }
  });

  it('still refuses a Spanish prefix that is not assigned to mobiles', () => {
    // The strictness is the point: a customer cannot own this number, so
    // accepting it would only put an undialable contact in the CRM.
    const parsed = parsePhoneNumberWithError('+34 794511610', {
      defaultCountry: 'RU',
      extract: false,
    });
    expect(parsed.isValid()).toBe(false);
  });
});
