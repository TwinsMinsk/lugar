import { sql } from 'drizzle-orm';

import { db, pgClient } from '@/db/client';
import { notificationAttempts, whatsappMessages, whatsappOutbox } from '@/db/schema';
import { env } from '@/env';
import { logger } from '@/lib/logger';
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
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.INITIAL_OWNER_EMAIL) return;

  const started = Date.now();
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: env.INITIAL_OWNER_EMAIL,
      subject: 'Новая заявка — WhatsApp-уведомление не доставлено',
      text:
        `WhatsApp не смог доставить уведомление о заявке (${reason}).\n\n` +
        `Заявка есть в панели: /admin/leads\n`,
    });
    await recordAttempt(job, 'email', env.INITIAL_OWNER_EMAIL, {
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    logger.error({ err: error, outboxId: job.id }, 'email fallback failed');
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
      logger.error({ err: error, outboxId: job.id }, 'outbox job threw');
      // Leave the lease to expire rather than guessing: another worker will
      // pick it up, and the attempt has already been counted.
    }
  }
  return jobs.length;
}

let running = true;

async function main() {
  logger.info({ worker: WORKER_ID, mode: env.WHATSAPP_MODE }, 'outbox worker started');

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'outbox worker stopping');
      running = false;
    });
  }

  while (running) {
    let handled = 0;
    try {
      handled = await drainOnce();
    } catch (error) {
      logger.error({ err: error }, 'outbox drain failed');
    }
    // Only idle when the queue was empty; a full batch means keep going.
    if (handled === 0) {
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
  }

  await pgClient.end({ timeout: 5 });
  logger.info('outbox worker stopped');
}

// Importable for tests; only the direct invocation starts the loop.
if (process.argv[1]?.includes('outbox-worker')) {
  await main();
}

export { backoffMs, claimBatch, processJob, settle, windowIsOpen };
