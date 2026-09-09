import 'server-only';

/**
 * The visitor's address, as far as anything here can tell.
 *
 * Twelve places derived this independently as `x-forwarded-for.split(',')[0]`,
 * which is the conventional reading and is only correct when the edge proxy
 * *replaces* that header. Railway's own answers contradict each other on
 * exactly that point — one says the edge strips the incoming value so the
 * leftmost entry is the real client, another says it appends its own so only
 * the rightmost can be trusted. Until that is settled against the deployed
 * platform (see the launch checklist), the leftmost entry is a value the
 * caller may have chosen.
 *
 * So `x-real-ip` comes first: it is the header a proxy overwrites rather than
 * extends, which makes it the harder one to dictate from outside. The
 * forwarded-for fallback keeps today's behaviour everywhere the header is
 * absent — local development, the E2E server, any host that does not set it.
 *
 * This matters most where the value is a *key* rather than a note. The lead
 * form's rate limit is five submissions an hour per address; keyed on a value
 * the sender picks, it stops nobody who varies the header. In the audit log the
 * stakes are lower but the same caveat applies: the address is what the request
 * claimed, not what the network observed, and it is recorded as such.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && forwarded !== '' ? forwarded : null;
}
