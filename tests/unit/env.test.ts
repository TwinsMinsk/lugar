import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Environment parsing, for the values that decide whether the app boots.
 *
 * These are cheap to get wrong in a deploy dashboard and expensive to diagnose:
 * the failure is a stack trace at startup, before a single request is served,
 * and the message talks about enums rather than about the box someone left
 * blank.
 */
describe('STORAGE_DRIVER', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts an empty value as "not set"', async () => {
    // `.env.example` ships this key blank, and a Railway variable added without
    // a value arrives as an empty string. Either would take the whole app down
    // for a setting the deployer deliberately left alone.
    vi.stubEnv('STORAGE_DRIVER', '');
    const { env } = await import('@/env');
    expect(env.STORAGE_DRIVER).toBeUndefined();
  });

  it('accepts the two real drivers', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'local');
    const { env } = await import('@/env');
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('still refuses a value that is neither', async () => {
    // The point of the enum survives: a typo must not silently fall back to
    // object storage the deployer never configured.
    vi.stubEnv('STORAGE_DRIVER', 'r2');
    const { env } = await import('@/env');
    expect(() => env.STORAGE_DRIVER).toThrow(/STORAGE_DRIVER/);
  });
});

describe('WHATSAPP_MODE', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubCloudApiCredentials() {
    vi.stubEnv('WHATSAPP_MODE', 'cloud_api');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'token');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'secret');
    vi.stubEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'verify');
  }

  /**
   * A studio that verifies a WhatsApp Business account and configures every
   * Cloud API credential can still forget the one variable that says who
   * should be told about a new lead. Nothing else here would ever surface
   * that — the integration "works" in the sense that it can send messages —
   * so this has to fail the boot, the same way a missing access token does.
   */
  it('refuses cloud_api with every Cloud API credential set but no recipient', async () => {
    stubCloudApiCredentials();
    const { env } = await import('@/env');
    expect(() => env.WHATSAPP_MODE).toThrow(/WHATSAPP_INTERNAL_RECIPIENTS/);
  });

  it('accepts cloud_api once a recipient is added', async () => {
    stubCloudApiCredentials();
    vi.stubEnv('WHATSAPP_INTERNAL_RECIPIENTS', '+34600000000');
    const { env } = await import('@/env');
    expect(env.WHATSAPP_MODE).toBe('cloud_api');
  });

  /**
   * Outside cloud_api this name is never sent to Meta — the outbox row it
   * labels either goes nowhere (`fallback`) or is faked (`mock`). Requiring it
   * anyway used to mean `submitLead` queued nothing for a new lead in the
   * mode the site actually launches in, which left the email fallback with no
   * row to fall back from.
   */
  it('defaults the alert template name so a fallback-mode row still gets created', async () => {
    vi.stubEnv('WHATSAPP_MODE', 'fallback');
    const { env } = await import('@/env');
    expect(env.WHATSAPP_LEAD_ALERT_TEMPLATE_NAME).toBe('lead_alert');
  });
});

describe('publicEnv', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * The regression this guards: `?? fallback` never fires on `""`, and an
   * empty `NEXT_PUBLIC_APP_URL` silently produced relative canonical URLs
   * sitewide, plus a session cookie with `Secure` dropped
   * (`useSecureCookies` checks whether this string starts with `https://`).
   */
  it('falls back to localhost when NEXT_PUBLIC_APP_URL is blanked rather than absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    const { publicEnv } = await import('@/env');
    expect(publicEnv.appUrl).toBe('http://localhost:3000');
  });

  it('keeps a real value untouched', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://lugar.es');
    const { publicEnv } = await import('@/env');
    expect(publicEnv.appUrl).toBe('https://lugar.es');
  });

  it('treats a blanked media base URL the same way', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '');
    const { publicEnv } = await import('@/env');
    expect(publicEnv.mediaBaseUrl).toBe('');
  });
});
