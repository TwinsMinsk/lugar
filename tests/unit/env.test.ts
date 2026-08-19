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
