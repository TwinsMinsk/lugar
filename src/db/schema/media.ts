/**
 * Media model.
 *
 * Usage tracking is deliberately belt-and-braces: a registry-driven visitor
 * walks the parsed block tree on every draft save and publish and writes
 * `media_usage` inside the same transaction, AND the asset reference is a real
 * foreign key with onDelete: 'restrict'. So even if a future write path forgets
 * to recompute usage, Postgres itself still refuses to drop a referenced asset.
 *
 * Focal point is never baked into the file. It is stored as normalised x/y and
 * applied at render time via object-position, so re-cropping is non-destructive.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { documentRevisions, documents } from './content';
import { ts, timestamps, uuid7 } from './_shared';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid7(),
    /** Key in object storage for the ORIGINAL upload. Never overwritten in place. */
    storageKey: text('storage_key').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    originalFilename: text('original_filename'),

    /** ~300-byte base64 data URL used as next/image blurDataURL. */
    lqip: text('lqip'),

    focalX: doublePrecision('focal_x').notNull().default(0.5),
    focalY: doublePrecision('focal_y').notNull().default(0.5),
    /** Intent hint like '16:9'. Advisory for editors, not a destructive crop. */
    cropAspect: text('crop_aspect'),

    /** Localised alt text: { ru, es?, en? }. Required for meaningful imagery. */
    alt: jsonb('alt')
      .notNull()
      .default(sql`'{}'::jsonb`),
    caption: jsonb('caption'),
    credit: text('credit'),

    /** Bumped on replace-in-place; appended to the public URL to bust caches. */
    version: integer('version').notNull().default(1),
    /** Derivative recipe generation. Bump RECIPE.version to trigger reprocessing. */
    recipeVersion: integer('recipe_version').notNull().default(1),

    /**
     * Generated stand-in shipped by the seed. Rendered as a loud magenta hatch
     * reading ЗАМЕНИТЬ / REEMPLAZAR / REPLACE so it can never be mistaken for
     * real photography, and counted on the admin dashboard.
     */
    isPlaceholder: boolean('is_placeholder').notNull().default(false),

    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [
    // Dedupe identical uploads, but only among live assets.
    uniqueIndex('media_checksum_uq')
      .on(t.checksumSha256)
      .where(sql`deleted_at is null`),
    index('media_placeholder_idx')
      .on(t.isPlaceholder)
      .where(sql`is_placeholder`),
    index('media_created_idx').on(t.createdAt.desc()),
  ],
);

export const mediaDerivatives = pgTable(
  'media_derivatives',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    width: integer('width').notNull(),
    format: text('format').notNull(), // 'avif' | 'webp' | 'jpeg'
    storageKey: text('storage_key').notNull(),
    bytes: integer('bytes').notNull(),
    recipeVersion: integer('recipe_version').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.width, t.format] }),
    index('media_derivative_stale_idx').on(t.recipeVersion),
  ],
);

export const mediaUsage = pgTable(
  'media_usage',
  {
    assetId: uuid('asset_id')
      .notNull()
      // The guard: Postgres refuses to delete an asset still referenced here.
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => documentRevisions.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id').notNull(),
    /** e.g. 'blocks[2].items[0].media' — lets the admin point at the exact field. */
    fieldPath: text('field_path').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.blockId, t.fieldPath] }),
    index('media_usage_asset_idx').on(t.assetId),
    index('media_usage_document_idx').on(t.documentId),
  ],
);
