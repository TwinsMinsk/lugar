/**
 * Portfolio and service taxonomy.
 *
 * A portfolio project IS a `documents` row (kind='project'), so it gets the
 * same locale slugs, revisions, draft/publish and rollback machinery as any
 * page — no parallel publishing system.
 *
 * `portfolioProjects` is a 1:1 extension holding the fields that must be
 * *queryable* (category, cover, featured, sort) rather than buried in block
 * JSONB, because the index page filters and orders on them.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { documents } from './content';
import { mediaAssets } from './media';
import { ts, timestamps, uuid7 } from './_shared';

export const portfolioCategories = pgTable(
  'portfolio_categories',
  {
    id: uuid7(),
    /** Stable machine key, e.g. 'kitchens'. Referenced by seeds and filters. */
    slug: varchar('slug', { length: 48 }).notNull(),
    label: jsonb('label').notNull(),
    /** Per-locale URL segment for future /raboty?category= filtering. */
    filterSlug: jsonb('filter_slug')
      .notNull()
      .default(sql`'{}'::jsonb`),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('portfolio_categories_slug_uq').on(t.slug),
    index('portfolio_categories_order_idx')
      .on(t.sortOrder)
      .where(sql`is_active`),
  ],
);

export const portfolioProjects = pgTable(
  'portfolio_projects',
  {
    /** Same id as the owning document — 1:1 extension, not a separate entity. */
    documentId: uuid('document_id')
      .primaryKey()
      .references(() => documents.id, { onDelete: 'cascade' }),
    coverAssetId: uuid('cover_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    primaryCategoryId: uuid('primary_category_id').references(() => portfolioCategories.id, {
      onDelete: 'set null',
    }),
    city: text('city'),
    /** Optional, owner-supplied. Never invented by the seed. */
    completedAt: ts('completed_at'),
    areaSqm: integer('area_sqm'),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('portfolio_projects_featured_idx')
      .on(t.isFeatured, t.sortOrder)
      .where(sql`is_featured`),
    index('portfolio_projects_category_idx').on(t.primaryCategoryId, t.sortOrder),
    index('portfolio_projects_sort_idx').on(t.sortOrder),
  ],
);

/** Many-to-many: a kitchen project can also legitimately be filed under doors. */
export const portfolioProjectCategories = pgTable(
  'portfolio_project_categories',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => portfolioCategories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.categoryId] }),
    index('portfolio_project_categories_category_idx').on(t.categoryId),
  ],
);

/**
 * Service taxonomy powering /korpusnaya-mebel, /mebel and /dveri, and the
 * `service` field captured on every lead.
 */
export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid7(),
    slug: varchar('slug', { length: 48 }).notNull(),
    /** 'korpusnaya' | 'mebel' | 'dveri' — which direction page this belongs to. */
    direction: varchar('direction', { length: 24 }).notNull(),
    label: jsonb('label').notNull(),
    note: jsonb('note'),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('service_categories_slug_uq').on(t.slug),
    index('service_categories_direction_idx')
      .on(t.direction, t.sortOrder)
      .where(sql`is_active`),
  ],
);
