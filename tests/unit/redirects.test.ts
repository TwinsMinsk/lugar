import { describe, expect, it } from 'vitest';

import { followRedirect, redirectPathSchema, wouldLoop, type RedirectMap } from '@/lib/redirects';

/**
 * Redirect rules.
 *
 * These are pure so they can be pinned without a database, and because the
 * public resolver and the admin editor must not be allowed to drift apart about
 * what a loop is.
 */
const permanent = (to: string) => ({ to, permanent: true });

describe('following a redirect', () => {
  it('resolves a single hop', () => {
    const map: RedirectMap = { '/staraya': permanent('/novaya') };
    expect(followRedirect(map, '/staraya')).toEqual({ to: '/novaya', permanent: true });
  });

  it('returns null for a path with no rule', () => {
    expect(followRedirect({}, '/nothing-here')).toBeNull();
  });

  it('collapses a chain so the browser gets one redirect, not three', () => {
    const map: RedirectMap = {
      '/a': permanent('/b'),
      '/b': permanent('/c'),
      '/c': permanent('/d'),
    };
    expect(followRedirect(map, '/a')).toEqual({ to: '/d', permanent: true });
  });

  it('downgrades a chain to temporary if any hop is temporary', () => {
    const map: RedirectMap = { '/a': permanent('/b'), '/b': { to: '/c', permanent: false } };
    expect(followRedirect(map, '/a')).toEqual({ to: '/c', permanent: false });
  });

  it('refuses to serve a cycle rather than bouncing the browser', () => {
    const map: RedirectMap = { '/a': permanent('/b'), '/b': permanent('/a') };
    expect(followRedirect(map, '/a')).toBeNull();
    expect(followRedirect(map, '/b')).toBeNull();
  });

  it('gives up on a chain longer than the hop limit instead of hanging', () => {
    const map: RedirectMap = {};
    for (let index = 0; index < 20; index += 1) map[`/p${index}`] = permanent(`/p${index + 1}`);
    // Stops somewhere along the chain; the point is that it terminates and
    // still points forward rather than looping or throwing.
    const result = followRedirect(map, '/p0');
    expect(result).not.toBeNull();
    expect(result!.to.startsWith('/p')).toBe(true);
  });
});

describe('loop detection at write time', () => {
  it('refuses a rule that points at itself', () => {
    expect(wouldLoop({}, '/a', '/a')).toBe(true);
  });

  it('refuses a rule that closes a cycle through existing rules', () => {
    // /b already goes to /a, so adding /a -> /b would trap every visitor.
    expect(wouldLoop({ '/b': permanent('/a') }, '/a', '/b')).toBe(true);
  });

  it('allows a rule that merely extends a chain', () => {
    expect(wouldLoop({ '/b': permanent('/c') }, '/a', '/b')).toBe(false);
  });

  it('does not blame a new rule for a cycle that already existed elsewhere', () => {
    const map: RedirectMap = { '/x': permanent('/y'), '/y': permanent('/x') };
    expect(wouldLoop(map, '/a', '/b')).toBe(false);
  });
});

describe('redirect path validation', () => {
  it('accepts an ordinary internal path', () => {
    expect(redirectPathSchema.safeParse('/korpusnaya-mebel').success).toBe(true);
    expect(redirectPathSchema.safeParse('/es/cocinas').success).toBe(true);
  });

  it('rejects a protocol-relative path, which leaves the site', () => {
    // '//evil.example' is a different origin as far as a browser is concerned.
    expect(redirectPathSchema.safeParse('//evil.example').success).toBe(false);
  });

  it('rejects an absolute URL and a javascript: URL', () => {
    expect(redirectPathSchema.safeParse('https://evil.example/x').success).toBe(false);
    expect(redirectPathSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('rejects a path that does not start at the root', () => {
    expect(redirectPathSchema.safeParse('kuhni').success).toBe(false);
  });

  it('rejects traversal and whitespace', () => {
    expect(redirectPathSchema.safeParse('/a/../b').success).toBe(false);
    expect(redirectPathSchema.safeParse('/a b').success).toBe(false);
  });
});
