import { describe, expect, it } from 'vitest';

import { issueDwellToken, verifyDwellToken } from '@/features/leads/dwell-token';

describe('dwell token', () => {
  it('verifies a token issued for itself', () => {
    const { renderedAt, signature } = issueDwellToken();
    expect(verifyDwellToken(renderedAt, signature)).toBe(true);
  });

  it('rejects a signature issued for a different timestamp', () => {
    // This is the property the whole mechanism rests on: a client cannot claim
    // an earlier `renderedAt` to look more patient, or a later one to skip the
    // dwell check, because the signature is bound to the exact value.
    const { signature } = issueDwellToken();
    expect(verifyDwellToken(Date.now() - 10_000, signature)).toBe(false);
  });

  it('rejects a missing or empty signature', () => {
    const { renderedAt } = issueDwellToken();
    expect(verifyDwellToken(renderedAt, null)).toBe(false);
    expect(verifyDwellToken(renderedAt, undefined)).toBe(false);
    expect(verifyDwellToken(renderedAt, '')).toBe(false);
  });

  it('rejects a non-finite timestamp', () => {
    const { signature } = issueDwellToken();
    expect(verifyDwellToken(Number.NaN, signature)).toBe(false);
  });

  it('rejects a signature carried over from an unrelated token shape', () => {
    // Domain separation: a signature is not just "any HMAC with the right
    // key" — it has to be one this module produced, over this exact payload.
    const { renderedAt } = issueDwellToken();
    expect(verifyDwellToken(renderedAt, 'not-a-real-signature')).toBe(false);
  });
});
