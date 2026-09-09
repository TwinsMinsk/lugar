import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import { coerceSettingValue } from '@/content/settings-registry';
import { db, pgClient } from '@/db/client';
import {
  notificationAttempts,
  serviceHeartbeats,
  siteSettings,
  whatsappMessages,
  whatsappOutbox,
  whatsappWebhookEvents,
} from '@/db/schema';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { flushErrorReporting, initErrorReporting, reportError } from '@/lib/report-error';
import { pruneRateLimits } from '@/lib/rate-limit';
import { whatsapp } from '@/lib/whatsapp';
import type { SendResult } from '@/lib/whatsapp/provider';

/**
 * The outbox worker.
 *
 * Runs as its own always-on Railway service, not as a cron job: Railway's cron
 * has a five-minute floor and skips overlapping runs, which would mean a hot
 * lead waiting up to five minutes for its alert.
 *
 * The durability boundary is the transaction that created the lead, not this
 * process. Everything here can crash, be redeployed, or run twice, and the
 * worst outcome is a delayed or duplicated message — never a lost lead.
 */

const WORKER_ID = `${process.env.RAILWAY_REPLICA_ID ?? 'local'}-${process.pid}`;

/** How long a claim is held before another worker may take it back. */
const LEASE_SECONDS = 120;

/** Claimed per tick. Small: a stuck batch should not park the whole queue. */
const BATCH_SIZE = 10;

const IDLE_POLL_MS = 3_000;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Exponential backoff with jitter.
 *
 * The jitter is not cosmetic: without it, a Meta outage that fails a hundred
 * queued alerts at once has them all retry at the same instant, repeatedly,
 * which is how a recovering API gets knocked over again.
 */
function backoffMs(attempt: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 3 ** Math.max(attempt - 1, 0), MAX_BACKOFF_MS);
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

/**
 * Rows come back through the query builder, not `db.execute`.
 *
 * `db.execute` hands back the driver's raw rows — snake_case keys and unparsed
 * timestamps — so casting them to the table's inferred type compiles and then
 * fails at runtime with `attemptCount` undefined and a NaN retry date. An
 * integration test caught it; the type assertion had hidden it completely.
 */
type ClaimedJob = typeof whatsappOutbox.$inferSelect;

/**
 * Claim a batch.
 *
 * `FOR UPDATE SKIP LOCKED` is what lets several workers drain one queue without
 * coordination: each row goes to exactly one of them and nobody waits on a lock.
 * Expired leases are swept back in by the same query, so a worker killed
 * mid-send does not strand its jobs.
 *
 * The attempt count increments at claim time, not on completion. A message that
 * crashes the worker would otherwise be retried forever, taking the queue with
 * it every time.
 */
async function claimBatch(): Promise<ClaimedJob[]> {
  return db
    .update(whatsappOutbox)
    .set({
      status: 'claimed',
      claimedBy: WORKER_ID,
      claimedUntil: sql`now() + ${`${LEASE_SECONDS} seconds`}::interval`,
      attemptCount: sql`${whatsappOutbox.attemptCount} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${whatsappOutbox.id} in (
        select id from whatsapp_outbox
         where (status in ('pending','failed_retryable') and next_attempt_at <= now())
            or (status = 'claimed' and claimed_until < now())
         order by next_attempt_at
         for update skip locked
         limit ${BATCH_SIZE}
      )`,
    )
    .returning();
}

/**
 * Is the 24-hour service window open for this recipient?
 *
 * The interval sits on the constant side so the comparison is a plain range
 * scan on the index, and five minutes of margin keeps us from posting a message
 * that expires in flight.
 */
async function windowIsOpen(phoneE164: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1 from contacts
     where phone_e164 = ${phoneE164}
       and last_inbound_at is not null
       and last_inbound_at > now() - interval '23 hours 55 minutes'
     limit 1
  `);
  return (rows as unknown as unknown[]).length > 0;
}

async function recordAttempt(
  job: ClaimedJob,
  channel: 'whatsapp' | 'email',
  target: string,
  outcome: {
    httpStatus?: number;
    providerCode?: number;
    providerMessageId?: string;
    error?: unknown;
    latencyMs: number;
  },
): Promise<void> {
  await db.insert(notificationAttempts).values({
    outboxId: job.id,
    channel,
    target,
    attemptNo: job.attemptCount,
    requestSummary: {
      purpose: job.purpose,
      kind: job.kind,
      template: job.templateName,
    },
    httpStatus: outcome.httpStatus ?? null,
    providerCode: outcome.providerCode ?? null,
    providerMessageId: outcome.providerMessageId ?? null,
    errorPayload: outcome.error ? ({ message: String(outcome.error) } as never) : null,
    latencyMs: outcome.latencyMs,
    finishedAt: new Date(),
  });
}

/**
 * Where the email fallback goes.
 *
 * Deliberately not `INITIAL_OWNER_EMAIL`. That variable exists to bootstrap
 * the first admin account, the launch checklist used to say it could be
 * removed once that was done — and this fallback, the CRM's only backstop
 * when WhatsApp cannot deliver, quietly depended on it anyway. Reading the
 * "Публичный email" setting instead means there is exactly one place the
 * owner sets where lead alerts land, and removing a bootstrap variable can no
 * longer disable it.
 *
 * A plain query, not `getSiteSettings()`: that function's `'use cache'`
 * directive is a Next.js build-time transform, and this worker runs as a bare
 * `tsx` process outside the Next.js compiler — it was never going to see that
 * transform applied.
 */
async function leadAlertEmailRecipient(): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, 'contact.email'))
    .limit(1);
  const value = coerceSettingValue('text', row?.value ?? null);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Last-resort email alert.
 *
 * Staff phone numbers get no opt-in exemption from Meta, so an alert outside
 * the service window needs an approved template — and if that template is
 * paused or rejected, the alert simply cannot go by WhatsApp. The CRM must not
 * be the only place a new lead becomes visible, so the same notification falls
 * back to email rather than being dropped.
 */
async function emailFallback(job: ClaimedJob, reason: string): Promise<void> {
  if (job.purpose !== 'internal_new_lead') return;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;

  const recipient = await leadAlertEmailRecipient();
  if (!recipient) return;

  const started = Date.now();
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: recipient,
      subject: 'Новая заявка — WhatsApp-уведомление не доставлено',
      text:
        `WhatsApp не смог доставить уведомление о заявке (${reason}).\n\n` +
        `Заявка есть в панели: /admin/leads\n`,
    });
    await recordAttempt(job, 'email', recipient, {
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    // Both channels have now failed for this lead: WhatsApp put the job here
    // and the email meant to catch it did not go either. Nobody is going to
    // find out about that enquiry from the system.
    reportError(error, 'email fallback failed', { outboxId: job.id });
  }
}

async function settle(job: ClaimedJob, result: SendResult): Promise<void> {
  const now = new Date();

  if (result.status === 'sent') {
    await db.transaction(async (tx) => {
      await tx
        .update(whatsappOutbox)
        .set({
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: now,
          claimedBy: null,
          claimedUntil: null,
        })
        .where(sql`${whatsappOutbox.id} = ${job.id}`);

      await tx
        .insert(whatsappMessages)
        .values({
          contactId: job.contactId,
          leadId: job.leadId,
          outboxId: job.id,
          direction: 'outbound',
          wamid: result.providerMessageId,
          messageType: job.kind === 'template' ? 'template' : 'text',
          body: job.bodyText,
          templateName: job.templateName,
          status: 'sent',
          sentAt: now,
          occurredAt: now,
        })
        .onConflictDoNothing();
    });
    return;
  }

  if (result.status === 'skipped') {
    await db
      .update(whatsappOutbox)
      .set({ status: 'skipped', claimedBy: null, claimedUntil: null })
      .where(sql`${whatsappOutbox.id} = ${job.id}`);
    // `skipped` is what `WHATSAPP_MODE=fallback` returns for every send — the
    // mode the site launches in before Meta verification completes. Without
    // this, a fully-configured `WHATSAPP_INTERNAL_RECIPIENTS` and template
    // name produced complete silence in that mode: the row just sat there
    // marked "skipped", which looks like success next to anything else in
    // this table.
    await emailFallback(job, `WhatsApp не настроен (${result.reason})`);
    return;
  }

  if (result.status === 'needs_template') {
    // Not a failure to retry: the same text will be refused for as long as the
    // window stays shut. It waits for a human to pick an approved template.
    await db
      .update(whatsappOutbox)
      .set({
        status: 'blocked_window',
        lastErrorCode: result.code,
        lastErrorMessage: 'Вне 24-часового окна — нужен одобренный шаблон',
        claimedBy: null,
        claimedUntil: null,
      })
      .where(sql`${whatsappOutbox.id} = ${job.id}`);
    await emailFallback(job, 'окно 24 часа закрыто');
    return;
  }

  const exhausted = job.attemptCount >= job.maxAttempts;

  if (result.status === 'permanent' || exhausted) {
    await db
      .update(whatsappOutbox)
      .set({
        status: 'dead',
        deadLetteredAt: now,
        lastErrorCode: result.code,
        lastErrorMessage: result.message,
        claimedBy: null,
        claimedUntil: null,
      })
      .where(sql`${whatsappOutbox.id} = ${job.id}`);
    await emailFallback(job, result.message);
    return;
  }

  const delay = result.retryAfterMs ?? backoffMs(job.attemptCount);
  await db
    .update(whatsappOutbox)
    .set({
      status: 'failed_retryable',
      nextAttemptAt: new Date(Date.now() + delay),
      lastErrorCode: result.code,
      lastErrorMessage: result.message,
      claimedBy: null,
      claimedUntil: null,
    })
    .where(sql`${whatsappOutbox.id} = ${job.id}`);
}

async function processJob(job: ClaimedJob): Promise<void> {
  const provider = whatsapp();
  const started = Date.now();

  // Free-form text is only legal inside the window. Checking here as well as at
  // render and click time avoids burning an attempt on a guaranteed 131047 —
  // and the window can close between queueing and sending.
  if (job.requiresWindow && job.kind === 'text' && !(await windowIsOpen(job.toPhoneE164))) {
    await settle(job, { status: 'needs_template', code: 131047 });
    return;
  }

  const result =
    job.kind === 'template'
      ? await provider.sendTemplate({
          to: job.toPhoneE164,
          name: job.templateName ?? '',
          language: job.templateLanguage ?? 'ru',
          variables: (job.templateVariables ?? undefined) as Record<string, string> | undefined,
        })
      : await provider.sendText({ to: job.toPhoneE164, body: job.bodyText ?? '' });

  await recordAttempt(job, 'whatsapp', job.toPhoneE164, {
    providerCode: 'code' in result ? result.code : undefined,
    providerMessageId: result.status === 'sent' ? result.providerMessageId : undefined,
    error:
      result.status === 'retryable' || result.status === 'permanent' ? result.message : undefined,
    latencyMs: Date.now() - started,
  });

  await settle(job, result);
}

export async function drainOnce(): Promise<number> {
  const jobs = await claimBatch();
  for (const job of jobs) {
    try {
      await processJob(job);
    } catch (error) {
      reportError(error, 'outbox job threw', { outboxId: job.id });
      // Leave the lease to expire rather than guessing: another worker will
      // pick it up, and the attempt has already been counted.
    }
  }
  return jobs.length;
}

/**
 * Housekeeping, folded into the worker.
 *
 * Three tables grow and nothing ever shrank them: `rate_limits` gains a row per
 * window per key, and `whatsapp_webhook_events` keeps every delivery Meta ever
 * made — including the ones it redelivered. `CRON_SECRET` existed in the
 * environment contract for a scheduled job that was never built and that
 * nothing read.
 *
 * A loop in the worker rather than a scheduler because the worker is already a
 * long-lived process with a database connection and a shutdown signal, and
 * adding an external scheduler would be a second thing to deploy, monitor and
 * forget. It runs at most hourly and only from the idle branch, so it never
 * delays a message a customer is waiting for.
 *
 * Ninety days for webhook events is a retention choice, not a technical one:
 * the raw payloads are what a support question about "did they get my message"
 * is answered from, and they hold customer phone numbers, so keeping them
 * forever is both a cost and a liability. Expired rate-limit windows are pure
 * bookkeeping and go as soon as they lapse.
 */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const WEBHOOK_EVENT_RETENTION_DAYS = 90;

let lastMaintenanceAt = 0;

async function runMaintenance() {
  const prunedWindows = await pruneRateLimits();

  const cutoff = new Date(Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const prunedEvents = await db
    .delete(whatsappWebhookEvents)
    .where(
      and(
        lt(whatsappWebhookEvents.receivedAt, cutoff),
        // Never an event still waiting to be processed: an unprocessed row is
        // work, not history, and deleting it would lose an inbound message.
        isNotNull(whatsappWebhookEvents.processedAt),
      ),
    )
    .returning({ id: whatsappWebhookEvents.id });

  if (prunedWindows > 0 || prunedEvents.length > 0) {
    logger.info(
      { rateLimitWindows: prunedWindows, webhookEvents: prunedEvents.length },
      'maintenance pruned old rows',
    );
  }
}

/**
 * Liveness, written every half minute.
 *
 * The worker is the only process that turns a lead into a message on the
 * owner's phone, and when it stops there is no symptom: the site keeps working,
 * the queue keeps filling, and the first sign is a quiet week that looks like a
 * quiet week. A row it overwrites in place is the cheapest thing that can tell
 * the difference.
 *
 * It beats from the top of the loop rather than from the idle branch, so a
 * worker that is busy — the case where you most want to know it is alive —
 * still reports.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_SERVICE = 'outbox';

let lastHeartbeatAt = 0;

async function beat() {
  if (Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeatAt = Date.now();
  await db
    .insert(serviceHeartbeats)
    .values({ service: HEARTBEAT_SERVICE, instance: WORKER_ID, beatAt: new Date() })
    .onConflictDoUpdate({
      target: serviceHeartbeats.service,
      set: { instance: WORKER_ID, beatAt: new Date() },
    });
}

let running = true;

async function main() {
  await initErrorReporting(env.SENTRY_DSN, env.NODE_ENV);
  logger.info({ worker: WORKER_ID, mode: env.WHATSAPP_MODE }, 'outbox worker started');

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'outbox worker stopping');
      running = false;
    });
  }

  while (running) {
    try {
      await beat();
    } catch (error) {
      // A missed beat must not stop the queue. It makes the worker look dead
      // while it is working, which is the safer of the two wrong answers.
      logger.error({ err: error }, 'heartbeat failed');
    }

    let handled = 0;
    try {
      handled = await drainOnce();
    } catch (error) {
      reportError(error, 'outbox drain failed');
    }
    // Only idle when the queue was empty; a full batch means keep going.
    if (handled === 0) {
      if (Date.now() - lastMaintenanceAt > MAINTENANCE_INTERVAL_MS) {
        lastMaintenanceAt = Date.now();
        try {
          await runMaintenance();
        } catch (error) {
          // Housekeeping must never take the queue down with it.
          logger.error({ err: error }, 'maintenance failed');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
  }

  await pgClient.end({ timeout: 5 });
  // A report still in flight when the process exits is a report nobody gets,
  // and the interesting crashes are the ones just before a shutdown.
  await flushErrorReporting();
  logger.info('outbox worker stopped');
}

// Importable for tests; only the direct invocation starts the loop.
if (process.argv[1]?.includes('outbox-worker')) {
  await main();
}

export { backoffMs, beat, claimBatch, processJob, runMaintenance, settle, windowIsOpen };
