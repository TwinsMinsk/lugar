import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Publishing state machine.
 *
 * Only the boundaries are mocked — the session, request headers and Next's
 * cache. The actions themselves, their Zod validation, their transactions and
 * their SQL all run for real against Postgres, because the behaviour worth
 * pinning here (draft never leaks, rollback restores exactly, invalid blocks
 * never persist) lives in those, not in the wrapper.
 */
const TEST_USER = { id: 'test-user-id', email: 'test@example.com', banned: false, role: 'owner' };

vi.mock('@/lib/auth/guards', () => ({
  requireCapability: vi.fn(async () => ({ user: TEST_USER, role: 'owner', session: null })),
  requireUser: vi.fn(async () => ({ user: TEST_USER, role: 'owner', session: null })),
  getSession: vi.fn(async () => ({ user: TEST_USER })),
  can: vi.fn(async () => true),
  roleCan: () => true,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '127.0.0.1' }),
  cookies: async () => ({ get: () => undefined }),
}));

const updateTagSpy = vi.fn();
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagSpy(...args),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

const { db, pgClient } = await import('@/db/client');
const { documentLocales, documentRevisions, documents, user } = await import('@/db/schema');
const { publishDocument, rollbackDocument, saveDraft, unpublishDocument, updateSlug } =
  await import('@/app/(admin)/admin/_actions/content');
const { migrateTestDatabase, resetTestDatabase } = await import('../helpers/db');

function heroBlock(headingRu: string) {
  return {
    id: randomUUID(),
    type: 'hero' as const,
    hidden: false,
    data: { variant: 'text' as const, heading: { ru: headingRu }, overlay: 'none' as const },
  };
}

// Slugs are unique per (kind, locale), so each fixture needs its own.
let slugCounter = 0;

async function createDocument(slug = `test-${(slugCounter += 1)}`) {
  const documentId = randomUUID();
  const draftId = randomUUID();

  await db.insert(documents).values({
    id: documentId,
    kind: 'page',
    template: 'service',
    baseSlug: slug,
    draftRevisionId: draftId,
  });
  await db.insert(documentRevisions).values({
    id: draftId,
    documentId,
    revisionNumber: 1,
    isDraft: true,
    blocks: [heroBlock('Первая версия')],
    meta: {},
  });
  await db.insert(documentLocales).values(
    (['ru', 'es', 'en'] as const).map((locale) => ({
      documentId,
      locale,
      kind: 'page' as const,
      slug,
      status: 'draft' as const,
    })),
  );

  return documentId;
}

beforeAll(async () => {
  await migrateTestDatabase();
});

afterAll(async () => {
  await pgClient.end({ timeout: 5 });
});

beforeEach(async () => {
  await resetTestDatabase();
  updateTagSpy.mockClear();
  await db.insert(user).values({
    id: TEST_USER.id,
    name: 'Test',
    email: TEST_USER.email,
    role: 'owner',
  });
});

describe('saveDraft', () => {
  it('persists a valid block list and leaves nothing published', async () => {
    const documentId = await createDocument();

    const result = await saveDraft({
      documentId,
      blocks: [heroBlock('Вторая версия')],
    });
    expect(result.ok).toBe(true);

    const [locale] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'ru')));

    // Saving a draft must never make anything live.
    expect(locale!.status).toBe('draft');
    expect(locale!.publishedRevisionId).toBeNull();
  });

  it('refuses to persist an invalid block', async () => {
    const documentId = await createDocument();

    const result = await saveDraft({
      documentId,
      // hero requires a heading; this must not reach the database.
      blocks: [{ id: randomUUID(), type: 'hero', data: { variant: 'text' } }],
    });

    expect(result).toEqual({ ok: false, error: 'invalid_blocks' });
  });

  it('refuses an unknown block type outright', async () => {
    const documentId = await createDocument();

    const result = await saveDraft({
      documentId,
      blocks: [{ id: randomUUID(), type: 'raw_html', data: { html: '<script>x</script>' } }],
    });

    expect(result).toEqual({ ok: false, error: 'invalid_blocks' });
  });
});

describe('publishDocument', () => {
  it('freezes the draft, points the locale at it and clones a new draft', async () => {
    const documentId = await createDocument();
    await saveDraft({ documentId, blocks: [heroBlock('Опубликованная версия')] });

    const result = await publishDocument({ documentId, locales: ['ru'] });
    expect(result.ok).toBe(true);

    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
    const revisions = await db
      .select()
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, documentId));

    // One frozen revision plus one fresh draft.
    expect(revisions).toHaveLength(2);
    expect(revisions.filter((r) => r.isDraft)).toHaveLength(1);

    // The draft pointer has moved to the clone, not the published revision.
    const [ru] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'ru')));
    expect(ru!.status).toBe('published');
    expect(ru!.publishedRevisionId).not.toBe(document!.draftRevisionId);
  });

  it('publishes locales independently', async () => {
    const documentId = await createDocument();
    await publishDocument({ documentId, locales: ['ru'] });

    const [es] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'es')));

    // Spanish was not in the publish set and must remain unpublished.
    expect(es!.status).toBe('draft');
    expect(es!.publishedRevisionId).toBeNull();
  });

  it('invalidates the caches the document participates in', async () => {
    const documentId = await createDocument('cache-tag-slug');
    await publishDocument({ documentId, locales: ['ru'] });

    const tagged = updateTagSpy.mock.calls.flat();
    expect(tagged).toContain('path:page:ru:cache-tag-slug');
    expect(tagged).toContain(`doc:${documentId}:ru`);
  });
});

describe('rollbackDocument', () => {
  it('restores exactly the previously published content', async () => {
    const documentId = await createDocument();

    await saveDraft({ documentId, blocks: [heroBlock('Версия A')] });
    await publishDocument({ documentId, locales: ['ru'] });
    const [first] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'ru')));
    const revisionA = first!.publishedRevisionId!;

    await saveDraft({ documentId, blocks: [heroBlock('Версия B')] });
    await publishDocument({ documentId, locales: ['ru'] });

    const rolled = await rollbackDocument({ documentId, revisionId: revisionA, locales: ['ru'] });
    expect(rolled.ok).toBe(true);

    const [after] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'ru')));
    expect(after!.publishedRevisionId).toBe(revisionA);

    const [restored] = await db
      .select({ blocks: documentRevisions.blocks })
      .from(documentRevisions)
      .where(eq(documentRevisions.id, revisionA));
    const blocks = restored!.blocks as Array<{ data: { heading: { ru: string } } }>;
    expect(blocks[0]!.data.heading.ru).toBe('Версия A');
  });

  it('refuses a revision belonging to a different document', async () => {
    const a = await createDocument();
    const b = await createDocument();
    await publishDocument({ documentId: b, locales: ['ru'] });

    const [bRu] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, b), eq(documentLocales.locale, 'ru')));

    const result = await rollbackDocument({
      documentId: a,
      revisionId: bRu!.publishedRevisionId!,
      locales: ['ru'],
    });

    expect(result).toEqual({ ok: false, error: 'revision_not_found' });
  });

  it('refuses to roll back to an open draft', async () => {
    const documentId = await createDocument();
    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));

    const result = await rollbackDocument({
      documentId,
      revisionId: document!.draftRevisionId!,
      locales: ['ru'],
    });

    expect(result).toEqual({ ok: false, error: 'revision_not_found' });
  });
});

describe('unpublishDocument', () => {
  it('archives a locale but keeps the pointer so republishing is one click', async () => {
    const documentId = await createDocument();
    await publishDocument({ documentId, locales: ['ru'] });
    const result = await unpublishDocument({ documentId, locales: ['ru'] });
    expect(result.ok).toBe(true);

    const [ru] = await db
      .select()
      .from(documentLocales)
      .where(and(eq(documentLocales.documentId, documentId), eq(documentLocales.locale, 'ru')));
    expect(ru!.status).toBe('archived');
    expect(ru!.publishedRevisionId).not.toBeNull();
  });

  it('refuses to unpublish a system document', async () => {
    const documentId = await createDocument();
    await db.update(documents).set({ isSystem: true }).where(eq(documents.id, documentId));

    const result = await unpublishDocument({ documentId, locales: ['ru'] });
    // A site with no home page is not a state the CMS should reach.
    expect(result).toEqual({ ok: false, error: 'system_document' });
  });
});

describe('updateSlug', () => {
  it('rejects a slug that is not URL-safe', async () => {
    const documentId = await createDocument();
    const result = await updateSlug({ documentId, locale: 'ru', slug: 'Не Слаг!' });
    expect(result).toEqual({ ok: false, error: 'slug_format' });
  });

  it('writes a 301 when a published slug changes', async () => {
    const documentId = await createDocument('staryy-slug');
    await publishDocument({ documentId, locales: ['ru'] });

    const result = await updateSlug({ documentId, locale: 'ru', slug: 'novyy-slug' });
    expect(result.ok).toBe(true);

    const { redirects } = await import('@/db/schema');
    const rows = await db.select().from(redirects);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromPath).toBe('/staryy-slug');
    expect(rows[0]!.toPath).toBe('/novyy-slug');
    expect(rows[0]!.statusCode).toBe(301);
  });

  it('does not write a redirect for an unpublished locale', async () => {
    const documentId = await createDocument();
    await updateSlug({ documentId, locale: 'ru', slug: 'drugoy-slug' });

    const { redirects } = await import('@/db/schema');
    expect(await db.select().from(redirects)).toHaveLength(0);
  });
});
