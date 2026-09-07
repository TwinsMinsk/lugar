import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

/**
 * When the lead form was opened, attested by the server.
 *
 * The dwell check (`submitLead`) rejects a submission that arrives implausibly
 * fast after the form renders — a real person needs a few seconds to read three
 * fields; a bot filling and posting them programmatically does not. That check
 * used to trust the *browser's* clock: the client stamped `Date.now()` at
 * mount and the server subtracted it from its own `Date.now()` at submit. A
 * device clock running even a few seconds fast made that difference negative,
 * and a negative dwell looked exactly like a bot — so a real visitor with a
 * fast clock had their submission silently discarded behind a fake success
 * screen, with nothing to tell them or the owner it happened.
 *
 * Both timestamps are now the server's. `issueDwellToken` is called once, on
 * mount, from a Server Action, and its `renderedAt` is this process's own
 * `Date.now()` — the same clock `submitLead` reads at the other end. The
 * signature exists only so the client cannot claim an arbitrary `renderedAt`
 * (an old one to look "patient", or a fresh one to skip the check) — it is not
 * protecting a secret, so reusing `PREVIEW_SECRET` under a distinct prefix is
 * fine: the two token shapes never verify against each other regardless.
 */
export type DwellToken = { renderedAt: number; signature: string };

function sign(renderedAt: number): string {
  return createHmac('sha256', env.PREVIEW_SECRET ?? '')
    .update('lead-dwell:')
    .update(String(renderedAt))
    .digest('base64url');
}

export function issueDwellToken(): DwellToken {
  const renderedAt = Date.now();
  return { renderedAt, signature: sign(renderedAt) };
}

/** Rejects anything malformed, mis-signed, or simply unsigned. */
export function verifyDwellToken(
  renderedAt: number,
  signature: string | null | undefined,
): boolean {
  if (!signature || !Number.isFinite(renderedAt)) return false;
  if (!env.PREVIEW_SECRET) return false;

  try {
    const expected = Buffer.from(sign(renderedAt));
    const received = Buffer.from(signature);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
