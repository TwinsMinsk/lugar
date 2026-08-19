/**
 * Content model — "localised leaves".
 *
 * One `documents` row per page/project. Its blocks live as JSONB on an
 * immutable `document_revisions` row. Only *string* fields inside a block are
 * locale maps ({ru, es, en}); structure (which image, how many columns, what
 * the CTA points at) is locale-invariant.
 *
 * That invariant is the whole point: the owner physically cannot break the
 * Spanish layout by editing Russian, because there is only ever one image and
 * one column count — three headlines.
 *
 * Publish state is per-locale, pointing at a shared frozen revision, so `es`
 * can sit on revision 7 while `ru` is live on 9. Each locale therefore always
 * renders a coherent whole-page snapshot rather than a half-translated mix.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { ts, timestamps, uuid7 } from './_shared';

export const localeEnum = pgEnum('locale', ['ru', 'es', 'en']);
export const docKind = pgEnum('doc_kind', ['page', 'project']);
export const publishStatus = pgEnum('publish_status', ['draft', 'published', 'archived']);

export const documents = pgTable(
  'documents',
  {
    id: uuid7(),
    kind: docKind('kind').notNull(),
    /** Which renderer/template this document uses: home | service | legal | … */
    template: text('template').notNull(),
    /** Stable key for idempotent seeding, e.g. 'page.home'. Null for user-created. */
    seedKey: text('seed_key'),
    /** Russian slug — the routing default and the source for locale slugs. */
    baseSlug: text('base_slug').notNull(),
    /** System documents cannot be deleted, only unpublished. */
    isSystem: boolean('is_system').notNull().default(false),
    draftRevisionId: uuid('draft_revision_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Out of the working lists, still on disk.
     *
     * Distinct from `document_locales.status`, which is *publication* and is
     * per-locale. This is *existence in the panel* and is per-record: a project
     * taken off the site is still something the studio is working on, whereas an
     * archived one is not. Conflating them is what left a test project visible
     * forever with no way to remove it.
     *
     * Only `archived_at`, not the `softDelete` pair: permanent removal here is a
     * real row DELETE, so a `deleted_at` would be a fourth state nothing reads.
     * `lead_statuses` (crm.ts) carries a bare `archivedAt` for the same reason.
     */
    archivedAt: ts('archived_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('documents_seed_key_uq')
      .on(t.seedKey)
      .where(sql`seed_key is not null`),
    // Partial: every list in the panel and every public resolve now carries
    // `archived_at is null`, so the index that serves them should too.
    index('documents_live_idx')
      .on(t.kind, t.sortOrder)
      .where(sql`archived_at is null`),
    index('documents_archived_idx')
      .on(t.archivedAt.desc())
      .where(sql`archived_at is not null`),
  ],
);

export const documentRevisions = pgTable(
  'document_revisions',
  {
    id: uuid7(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    isDraft: boolean('is_draft').notNull().default(true),
    /** Validated against the block registry's Zod union before every write. */
    blocks: jsonb('blocks')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * Per-locale SEO and document-specific fields. Lives here, not on
     * document_locales, so a rollback restores title/description/OG together
     * with the copy rather than leaving them mismatched.
     */
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('revision_number_uq').on(t.documentId, t.revisionNumber),
    // At most one open draft per document — enforced by the database, not by
    // application discipline.
    uniqueIndex('one_draft_per_document_uq')
      .on(t.documentId)
      .where(sql`is_draft`),
    index('revision_document_idx').on(t.documentId, t.revisionNumber),
  ],
);

export const documentLocales = pgTable(
  'document_locales',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    /** Denormalised from documents.kind so the slug uniqueness index works. */
    kind: docKind('kind').notNull(),
    slug: text('slug').notNull(),
    status: publishStatus('status').notNull().default('draft'),
    /** restrict: a revision that is live somewhere can never be deleted. */
    publishedRevisionId: uuid('published_revision_id').references(() => documentRevisions.id, {
      onDelete: 'restrict',
    }),
    publishedAt: ts('published_at'),
    noindex: boolean('noindex').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.locale] }),
    uniqueIndex('document_locale_slug_uq').on(t.kind, t.locale, t.slug),
    // The public resolver's exact predicate.
    index('document_locale_published_idx')
      .on(t.kind, t.locale, t.status)
      .where(sql`published_revision_id is not null`),
  ],
);

/**
 * Slug history. Written automatically whenever a published slug changes, so a
 * renamed project keeps its search ranking instead of 404ing.
 */
export const redirects = pgTable(
  'redirects',
  {
    id: uuid7(),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    statusCode: integer('status_code').notNull().default(301),
    isActive: boolean('is_active').notNull().default(true),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('redirect_from_uq').on(t.fromPath)],
);

export const navigationItems = pgTable(
  'navigation_items',
  {
    id: uuid7(),
    /** 'header' | 'footer_primary' | 'footer_legal' */
    menu: text('menu').notNull(),
    parentId: uuid('parent_id'),
    label: jsonb('label').notNull(),
    /** Link by documentId so renaming a slug never breaks the menu. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    externalUrl: text('external_url'),
    anchor: text('anchor'),
    sortOrder: integer('sort_order').notNull().default(0),
    isVisible: boolean('is_visible').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('navigation_menu_idx').on(t.menu, t.sortOrder)],
);
