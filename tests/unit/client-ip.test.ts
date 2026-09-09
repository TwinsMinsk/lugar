import { describe, expect, it } from 'vitest';

import { clientIp } from '@/lib/client-ip';

/**
 * Which header the address comes from.
 *
 * Twelve call sites read `x-forwarded-for.split(',')[0]` independently, which
 * is right only when the edge proxy replaces that header rather than appending
 * to it — and Railway's own answers contradict each other on exactly that.
 * The order below is the claim: prefer the header a proxy overwrites, fall
 * back to the conventional one, and answer null rather than inventing a value.
 */
describe('clientIp', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('prefers x-real-ip, the header a proxy overwrites', () => {
    expect(
      clientIp(headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })),
    ).toBe('203.0.113.7');
  });

  it('falls back to the first forwarded-for entry', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '198.51.100.1, 70.41.3.18' }))).toBe(
      '198.51.100.1',
    );
  });

  it('returns null when neither header is present', () => {
    expect(clientIp(headers({}))).toBeNull();
  });

  /**
   * An empty or whitespace-only header is not an address. The old inline
   * expression returned `''` for `x-forwarded-for: ", 10.0.0.1"`, and the lead
   * form then keyed its rate limit on the empty string — one shared bucket for
   * every request shaped that way.
   */
  it('treats a blank value as absent', () => {
    expect(clientIp(headers({ 'x-real-ip': '   ' }))).toBeNull();
    expect(clientIp(headers({ 'x-forwarded-for': ' , 10.0.0.1' }))).toBeNull();
  });
});
