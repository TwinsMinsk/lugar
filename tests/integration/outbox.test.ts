import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db, pgClient } from '@/db/client';
import { contacts, whatsappOutbox, whatsappWebhookEvents } from '@/db/schema';
import { claimBatch, settle, windowIsOpen } from '@/worker/outbox-worker';
import { migrateTestDatabase, resetTestDatabase } from '../helpers/db';

/**
 * The outbox is the only thing standing between a committed lead and a lost
 * alert, so its concurrency and give-up rules are proved against a real
 * Postgres rather than a mock. SKIP LOCKED semantics in particular cannot be
 * meaningfully faked.
 */
beforeAll(async () => {
  await migrateTestDatabase();
});

afterAll(async () => {
  await pgClient.end({ timeout: 5 });
});

async function seedJobs(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, () => randomUUID());
  await db.insert(whatsappOutbox).values(
    ids.map((id, index) => ({
      id,
      toPhoneE164: `+3460000${String(index).padStart(4, '0')}`,
      purpose: 'internal_new_lead' as const,
      kind: 'template' as const,
      templateName: 'lead_alert',
      templateLanguage: 'ru',
      requiresWindow: false,
    })),
  );
  return ids;
}

describe('claiming work', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('hands every job to exactly one worker when several drain at once', async () => {
    const ids = await seedJobs(30);

    // Three concurrent claims. SKIP LOCKED is what makes this safe with no
    // coordination between workers; without it they would either block on one
    // another or hand the same alert to all three.
    const batches = await Promise.all([claimBatch(), claimBatch(), claimBatch()]);
    const claimed = batches.flat().map((job) => job.id);

    expect(claimed).toHaveLength(30);
    expect(new Set(claimed).size).toBe(30);
    expect(new Set(claimed)).toEqual(new Set(ids));
  });

  it('counts the attempt at claim time, so a crash cannot loop forever', async () => {
    const [id] = await seedJobs(1);
    const [claimed] = await claimBatch();

    expect(claimed!.id).toBe(id);
    expect(claimed!.attemptCount).toBe(1);
    expect(claimed!.status).toBe('claimed');
    expect(claimed!.claimedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not re-claim a job whose lease is still held', async () => {
    await seedJobs(1);
    await claimBatch();
    expect(await claimBatch()).toHaveLength(0);
  });

  it('takes back a job from a worker that died mid-send', async () => {
    const [id] = await seedJobs(1);
    await claimBatch();

    await db
      .update(whatsappOutbox)
      .set({ claimedUntil: new Date(Date.now() - 1000) })
      .where(eq(whatsappOutbox.id, id!));

    const reclaimed = await claimBatch();
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.attemptCount).toBe(2);
  });

  it('leaves a job alone until its retry time arrives', async () => {
    const [id] = await seedJobs(1);
    await db
      .update(whatsappOutbox)
      .set({ status: 'failed_retryable', nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(whatsappOutbox.id, id!));

    expect(await claimBatch()).toHaveLength(0);
  });
});

describe('giving up', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('schedules a retry for a transient failure and releases the lease', async () => {
    await seedJobs(1);
    const [job] = await claimBatch();

    await settle(job!, { status: 'retryable', code: 130429, message: 'rate limited' });

    const [row] = await db.select().from(whatsappOutbox).where(eq(whatsappOutbox.id, job!.id));
    expect(row!.status).toBe('failed_retryable');
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(row!.claimedUntil).toBeNull();
  });

  it('dead-letters once the attempts are used up', async () => {
    const [id] = await seedJobs(1);
    await db.update(whatsappOutbox).set({ maxAttempts: 1 }).where(eq(whatsappOutbox.id, id!));

    const [job] = await claimBatch();
    await settle(job!, { status: 'retryable', code: 130429, message: 'rate limited' });

    const [row] = await db.select().from(whatsappOutbox).where(eq(whatsappOutbox.id, id!));
    expect(row!.status).toBe('dead');
    expect(row!.deadLetteredAt).not.toBeNull();
  });

  it('dead-letters a permanent failure without spending the other attempts', async () => {
    await seedJobs(1);
    const [job] = await claimBatch();

    await settle(job!, { status: 'permanent', code: 132001, message: 'template not found' });

    const [row] = await db.select().from(whatsappOutbox).where(eq(whatsappOutbox.id, job!.id));
    expect(row!.status).toBe('dead');
    expect(row!.attemptCount).toBe(1);
  });

  it('parks an out-of-window message for a human instead of retrying it', async () => {
    await seedJobs(1);
    const [job] = await claimBatch();

    await settle(job!, { status: 'needs_template', code: 131047 });

    const [row] = await db.select().from(whatsappOutbox).where(eq(whatsappOutbox.id, job!.id));
    // Not failed_retryable: the same free-form text stays illegal until the
    // customer writes again, which may never happen.
    expect(row!.status).toBe('blocked_window');
    expect(row!.lastErrorCode).toBe(131047);
  });

  it('records the provider message id on success', async () => {
    await seedJobs(1);
    const [job] = await claimBatch();

    await settle(job!, { status: 'sent', providerMessageId: 'wamid.XYZ' });

    const [row] = await db.select().from(whatsappOutbox).where(eq(whatsappOutbox.id, job!.id));
    expect(row!.status).toBe('sent');
    expect(row!.providerMessageId).toBe('wamid.XYZ');
    expect(row!.sentAt).not.toBeNull();
  });
});

describe('the 24 hour service window', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('is shut for someone who has never written to us', async () => {
    await db.insert(contacts).values({ phoneE164: '+34600999001' });
    expect(await windowIsOpen('+34600999001')).toBe(false);
  });

  it('is open just after an inbound message', async () => {
    await db.insert(contacts).values({ phoneE164: '+34600999002', lastInboundAt: new Date() });
    expect(await windowIsOpen('+34600999002')).toBe(true);
  });

  it('is shut again a day later', async () => {
    await db.insert(contacts).values({
      phoneE164: '+34600999003',
      lastInboundAt: new Date(Date.now() - 24 * 3600 * 1000),
    });
    expect(await windowIsOpen('+34600999003')).toBe(false);
  });

  it('closes five minutes early, so a message cannot expire in flight', async () => {
    await db.insert(contacts).values({
      phoneE164: '+34600999004',
      // Inside 24 hours, but past the safety margin.
      lastInboundAt: new Date(Date.now() - (23 * 3600 + 57 * 60) * 1000),
    });
    expect(await windowIsOpen('+34600999004')).toBe(false);
  });

  it('treats an unknown number as shut, not open', async () => {
    expect(await windowIsOpen('+34600000000')).toBe(false);
  });
});

describe('outbox dedupe', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('refuses a second alert carrying the same dedupe key', async () => {
    const values = {
      toPhoneE164: '+34600111222',
      purpose: 'internal_new_lead' as const,
      kind: 'template' as const,
      dedupeKey: 'internal_new_lead:lead-1:+34600111222',
    };
    await db.insert(whatsappOutbox).values(values);

    const inserted = await db
      .insert(whatsappOutbox)
      .values(values)
      // The index is partial, so the predicate has to be repeated here for
      // Postgres to infer it — without it the insert raises 42P10 instead of
      // being ignored.
      .onConflictDoNothing({
        target: whatsappOutbox.dedupeKey,
        where: sql`dedupe_key is not null`,
      })
      .returning({ id: whatsappOutbox.id });

    expect(inserted).toHaveLength(0);
    expect(await db.select({ id: whatsappOutbox.id }).from(whatsappOutbox)).toHaveLength(1);
  });
});

describe('webhook event dedupe', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  /**
   * The guarantee lives in the database, not in the route.
   *
   * Meta redelivers, and two deliveries can be in flight at once — so the
   * uniqueness has to be enforced where concurrency cannot get around it.
   */
  it('accepts an event key exactly once', async () => {
    const values = {
      eventKey: 'st:wamid.ABC:delivered',
      kind: 'status',
      wamid: 'wamid.ABC',
      raw: {} as never,
    };
    await db.insert(whatsappWebhookEvents).values(values);

    const second = await db
      .insert(whatsappWebhookEvents)
      .values(values)
      .onConflictDoNothing({ target: whatsappWebhookEvents.eventKey })
      .returning({ id: whatsappWebhookEvents.id });

    expect(second).toHaveLength(0);
  });

  it('keeps the three statuses of one message apart', async () => {
    // sent/delivered/read share a wamid. Keying on it alone would collapse the
    // delivery timeline to whichever arrived first.
    for (const status of ['sent', 'delivered', 'read']) {
      await db.insert(whatsappWebhookEvents).values({
        eventKey: `st:wamid.SAME:${status}`,
        kind: 'status',
        wamid: 'wamid.SAME',
        raw: {} as never,
      });
    }

    const rows = await db.select().from(whatsappWebhookEvents);
    expect(rows).toHaveLength(3);
  });
});
