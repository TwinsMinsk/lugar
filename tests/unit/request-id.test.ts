import { describe, expect, it } from 'vitest';

import { resolveRequestId } from '@/lib/request-id';

describe('resolveRequestId', () => {
  it('keeps an id a proxy already assigned, so one trace stays joined up', () => {
    expect(resolveRequestId('7f3a91c0-2b44-4e0d-9a1e-0c5d8f2b6a10')).toBe(
      '7f3a91c0-2b44-4e0d-9a1e-0c5d8f2b6a10',
    );
  });

  it('mints one when there is none', () => {
    const id = resolveRequestId(null);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(null)).not.toBe(id);
  });

  it('refuses a value carrying a newline, which would forge log lines', () => {
    // The id is printed into JSON log lines. A caller who can put a newline in
    // it can write whatever entry they like underneath the real one.
    const forged = resolveRequestId('abcdefgh\n{"level":30,"msg":"payment received"}');
    expect(forged).not.toContain('payment received');
    expect(forged).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses one too short to be an identifier and one long enough to be a payload', () => {
    expect(resolveRequestId('abc')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('a'.repeat(65))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('a'.repeat(64))).toBe('a'.repeat(64));
  });
});
