import 'server-only';

import { randomUUID } from 'node:crypto';

/**
 * One identifier per request, so a line in a log can be tied to a page a person
 * was looking at.
 *
 * Without it, "the form said something went wrong at about half past two" has
 * to be matched against the logs by timestamp and guesswork. With it, the id
 * comes back on the response and names the exact lines.
 *
 * An inbound `x-request-id` is honoured so that a proxy or a load balancer that
 * already assigns one keeps the trace joined up — but only after it is checked
 * against this pattern. The value ends up inside log lines, and a caller-chosen
 * string is untrusted input: newlines in it would let anyone forge log entries,
 * and length is unbounded unless something bounds it.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

const ACCEPTABLE = /^[A-Za-z0-9_.:-]{8,64}$/;

export function resolveRequestId(inbound: string | null): string {
  return inbound && ACCEPTABLE.test(inbound) ? inbound : randomUUID();
}
