import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pgClient } from '@/db/client';
import { documentRevisions, documents, leadStatuses, mediaAssets, mediaUsage } from '@/db/schema';
import { migrateTestDatabase, resetTestDatabase } from '../helpers/db';
import { captureDbError, PG } from '../helpers/errors';

/**
 * These invariants are enforced by Postgres, not by application code, so they
 * hold even when a future write path forgets to check them. That is exactly why
 * they are worth testing at the database level.
 */
beforeAll(async () => {
  await migrateTestDatabase();
});

afterAll(async () => {
  await pgClient.end({ timeout: 5 });
});

describe('content invariants', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('permits at most one open draft revision per document', async () => {
    const documentId = randomUUID();
    await db
      .insert(documents)
      .values({ id: documentId, kind: 'page', template: 'home', baseSlug: '' });
    await db
      .insert(documentRevisions)
      .values({ documentId, revisionNumber: 1, isDraft: true, meta: {} });

    const error = await captureDbError(
      db
        .insert(documentRevisions)
        .values({ documentId, revisionNumber: 2, isDraft: true, meta: {} }),
    );
    expect(error.code).toBe(PG.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('one_draft_per_document_uq');
  });

  it('allows many frozen revisions alongside the single draft', async () => {
    const documentId = randomUUID();
    await db
      .insert(documents)
      .values({ id: documentId, kind: 'page', template: 'legal', baseSlug: 'x' });
    await db.insert(documentRevisions).values([
      { documentId, revisionNumber: 1, isDraft: false, meta: {} },
      { documentId, revisionNumber: 2, isDraft: false, meta: {} },
      { documentId, revisionNumber: 3, isDraft: true, meta: {} },
    ]);

    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(documentRevisions)
      .where(sql`document_id = ${documentId}`);
    expect(rows[0]?.n).toBe(3);
  });
});

describe('media usage guard', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('refuses to delete an asset that a revision still references', async () => {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    const assetId = randomUUID();

    await db
      .insert(documents)
      .values({ id: documentId, kind: 'page', template: 'home', baseSlug: '' });
    await db
      .insert(documentRevisions)
      .values({ id: revisionId, documentId, revisionNumber: 1, isDraft: true, meta: {} });
    await db.insert(mediaAssets).values({
      id: assetId,
      storageKey: 'originals/ab/abc.avif',
      checksumSha256: 'abc',
      mimeType: 'image/avif',
      width: 100,
      height: 100,
      bytes: 1000,
      alt: {},
    });
    await db.insert(mediaUsage).values({
      assetId,
      revisionId,
      documentId,
      blockId: randomUUID(),
      fieldPath: 'blocks[0].media',
    });

    const error = await captureDbError(db.delete(mediaAssets).where(sql`id = ${assetId}`));
    expect(error.code).toBe(PG.FOREIGN_KEY_VIOLATION);
    expect(error.message).toMatch(/media_usage/);
  });

  it('allows deletion once the usage row is gone', async () => {
    const assetId = randomUUID();
    await db.insert(mediaAssets).values({
      id: assetId,
      storageKey: 'originals/cd/cde.avif',
      checksumSha256: 'cde',
      mimeType: 'image/avif',
      width: 10,
      height: 10,
      bytes: 10,
      alt: {},
    });
    await expect(db.delete(mediaAssets).where(sql`id = ${assetId}`)).resolves.toBeDefined();
  });
});

describe('pipeline invariants', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('permits exactly one default-entry lead status', async () => {
    await db
      .insert(leadStatuses)
      .values({ slug: 'first', sortOrder: 100, label: {}, isDefaultEntry: true });

    const error = await captureDbError(
      db
        .insert(leadStatuses)
        .values({ slug: 'second', sortOrder: 200, label: {}, isDefaultEntry: true }),
    );
    expect(error.code).toBe(PG.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('lead_statuses_default_entry_uq');
  });

  it('permits any number of non-default statuses', async () => {
    await expect(
      db.insert(leadStatuses).values([
        { slug: 'a', sortOrder: 300, label: {}, isDefaultEntry: false },
        { slug: 'b', sortOrder: 400, label: {}, isDefaultEntry: false },
      ]),
    ).resolves.toBeDefined();
  });
});
