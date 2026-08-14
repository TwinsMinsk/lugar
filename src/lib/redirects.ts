import { z } from 'zod';

/**
 * Redirect rules, as pure functions.
 *
 * Kept free of database and request access so the two places that must agree —
 * the public resolver and the admin editor's loop check — can share exactly one
 * implementation, and so both can be tested without a database.
 */

export type RedirectTarget = { to: string; permanent: boolean };
export type RedirectMap = Record<string, RedirectTarget>;

/** Longest chain followed before giving up. */
export const MAX_HOPS = 5;

/**
 * An internal, absolute path.
 *
 * Restricted to site-internal paths on purpose. A redirect destination is
 * attacker-useful if it can point anywhere: `//evil.example` is a
 * protocol-relative URL that browsers happily treat as a different origin, and
 * a scheme like `javascript:` turns a saved redirect into stored XSS. The
 * studio has no reason to redirect visitors off its own domain.
 */
export const redirectPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith('/'), { message: 'path_absolute' })
  // '//host' is protocol-relative and leaves the site.
  .refine((value) => !value.startsWith('//'), { message: 'path_external' })
  // An allowlist rather than a denylist: the set of characters a URL path may
  // legitimately contain is short and known, whereas the set that could cause
  // trouble somewhere downstream is open-ended.
  .refine((value) => /^\/[A-Za-z0-9\-._~/%?=&]*$/.test(value), { message: 'path_characters' })
  .refine((value) => !value.includes('..'), { message: 'path_characters' });

/**
 * Follow a chain to its end.
 *
 * Returns the final destination so a visitor gets one redirect rather than one
 * per hop. A cycle returns null — better to serve the 404 the path would have
 * produced anyway than to bounce a browser until it gives up.
 */
export function followRedirect(map: RedirectMap, path: string): RedirectTarget | null {
  const first = map[path];
  if (!first) return null;

  const seen = new Set<string>([path]);
  let current = first;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (seen.has(current.to)) return null;
    const next = map[current.to];
    if (!next) return current;
    seen.add(current.to);
    // A chain counts as permanent only if every hop in it is.
    current = { to: next.to, permanent: current.permanent && next.permanent };
  }

  return current;
}

/**
 * Would adding `from -> to` create a cycle?
 *
 * Checked before writing rather than only when serving: a loop that only
 * surfaces as "this URL does nothing" months later is far harder to diagnose
 * than a refusal at the moment it is created.
 */
export function wouldLoop(map: RedirectMap, from: string, to: string): boolean {
  if (from === to) return true;

  const seen = new Set<string>([from]);
  let current = to;

  for (let hop = 0; hop < MAX_HOPS + 1; hop += 1) {
    if (current === from) return true;
    if (seen.has(current)) return false; // A pre-existing cycle, but not ours.
    seen.add(current);
    const next = map[current];
    if (!next) return false;
    current = next.to;
  }

  return false;
}
