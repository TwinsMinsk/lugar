import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

/**
 * Preview links.
 *
 * A preview URL is signed and time-limited so it can be shared with someone who
 * has no admin account — a client reviewing copy, say — without handing them a
 * session. The signature covers the document, the locale and the expiry, so a
 * link cannot be edited to reach a different page or to outlive its window.
 *
 * Enabling preview is a Route Handler that verifies this token and then calls
 * `draftMode().enable()`. From that point Next's own bypass cookie carries the
 * state, and — per the draft-mode contract — everything under a `use cache`
 * scope re-executes per request and is never written to the cache, so draft
 * content cannot leak into what the next visitor is served.
 */
const DEFAULT_TTL_SECONDS = 60 * 60;

export type PreviewClaims = {
  documentId: string;
  locale: string;
  /** Unix seconds. */
  exp: number;
};

function sign(payload: string): string {
  return createHmac('sha256', env.PREVIEW_SECRET ?? '')
    .update(payload)
    .digest('base64url');
}

export function createPreviewToken(
  claims: Omit<PreviewClaims, 'exp'>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ ...claims, exp } satisfies PreviewClaims)).toString(
    'base64url',
  );
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a preview token.
 *
 * Returns null for anything malformed, mis-signed or expired — the caller can
 * only distinguish "valid" from "not", never why, so a probing attacker learns
 * nothing from the response.
 */
export function verifyPreviewToken(token: string | null | undefined): PreviewClaims | null {
  if (!token) return null;
  if (!env.PREVIEW_SECRET) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  try {
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length) return null;
    if (!timingSafeEqual(expected, received)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PreviewClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.documentId !== 'string' || typeof claims.locale !== 'string') return null;

    return claims;
  } catch {
    return null;
  }
}
