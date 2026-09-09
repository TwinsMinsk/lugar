/**
 * Runs once when a server instance starts, before it serves anything.
 *
 * The environment contract is parsed lazily: `env` is a Proxy that validates on
 * the first property read, which means a deploy with a missing
 * `BETTER_AUTH_SECRET` or a malformed `WHATSAPP_MODE` starts happily and fails
 * on whichever request happens to touch that variable first — as a 500, in
 * front of a visitor, with the real cause in a log nobody is watching.
 *
 * Reading one variable here forces the whole schema to parse while the process
 * is still starting. A misconfigured release then dies before it can take
 * traffic, which is what Railway's health check and rollback are for.
 *
 * Guarded on the Node runtime: `register` also runs for the edge runtime, where
 * this env module is not what serves requests. It deliberately does not touch
 * the database — that is the health check's job, and a boot that waits on a
 * network round trip is a boot that can hang.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { env } = await import('@/env');
  // Any read parses everything; this one is chosen because a deploy without it
  // cannot do anything at all.
  void env.DATABASE_URL;

  // After the contract is known to be valid, so a misconfigured deploy still
  // dies here rather than reporting its own death to a service that may not be
  // configured either.
  const { initErrorReporting } = await import('@/lib/report-error');
  await initErrorReporting(env.SENTRY_DSN, env.NODE_ENV);
}
