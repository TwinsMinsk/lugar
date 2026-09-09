import type * as SentryNode from '@sentry/node';

import { logger } from './logger';

/**
 * Where a crash goes.
 *
 * Until now: into the log stream, and nowhere else. A 500 on the lead form at
 * eleven on a Sunday is invisible unless somebody is reading Railway's console
 * at that minute, and nobody is. This sends it to Sentry as well, when a DSN
 * exists, and keeps logging either way — the log is what you read when you
 * already know something is wrong, the report is what tells you.
 *
 * Deliberately `@sentry/node` and not `@sentry/nextjs`. The Next SDK adds a
 * build plugin and a wrapping layer over the framework, and this project runs a
 * version of Next whose conventions its own docs warn are not the ones you
 * remember; a build-time plugin is the kind of thing that breaks a release for
 * a reason unrelated to the release. This is a transport and nothing else.
 *
 * `defaultIntegrations: false` is the same decision made once more: no
 * OpenTelemetry, no patching of http, no ESM loader hooks, no automatic capture
 * of request bodies. Errors arrive because a line of code asked for them to be
 * sent. The cost is that an exception nobody calls this on is not reported; the
 * benefit is that nothing here can change how a request is served.
 *
 * What is never sent: anything about a visitor. No names, no phone numbers, no
 * message text — `sendDefaultPii` stays off and the context each caller passes
 * is ids and counts. A crash report that carries a customer's phone number is a
 * personal-data export to a third country, and this site tells its visitors it
 * does not do that.
 */
let sentry: typeof SentryNode | null = null;

export async function initErrorReporting(dsn: string | undefined, environment: string) {
  if (!dsn || sentry) return;

  const mod = await import('@sentry/node');
  mod.init({
    dsn,
    environment,
    defaultIntegrations: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  sentry = mod;
  logger.info('error reporting enabled');
}

/**
 * Logs always, reports when configured.
 *
 * `context` is for ids and counts — a lead's public id, an outbox row, the
 * event key Meta sent. Never the contents of a message or anything identifying
 * the person on the other end.
 */
export function reportError(
  error: unknown,
  message: string,
  context: Record<string, unknown> = {},
) {
  logger.error({ err: error, ...context }, message);
  sentry?.captureException(error, { extra: { ...context, message } });
}

/** Lets a process exit without dropping a report that is still in flight. */
export async function flushErrorReporting(timeoutMs = 2000) {
  await sentry?.flush(timeoutMs);
}

/** Test seam: forgets an initialised client so a second init can be observed. */
export function resetErrorReportingForTests() {
  sentry = null;
}
