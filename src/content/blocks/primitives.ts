import { z } from 'zod';

import { localizedText, localizedTextOptional } from '../i18n';

/**
 * Shared field primitives used across block schemas.
 */

/**
 * A link target.
 *
 * Internal links point at a `documentId`, never at a slug string. That means
 * renaming a page — or giving Spanish its own slug — can never leave a dead CTA
 * behind, and the resolver already knows the per-locale path for that document.
 */
export const linkTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), documentId: z.uuid() }),
  z.object({ kind: z.literal('external'), url: z.url() }),
  z.object({ kind: z.literal('anchor'), hash: z.string().regex(/^[a-z0-9-]+$/) }),
  /** Opens the lead dialog rather than navigating. */
  z.object({
    kind: z.literal('form'),
    form: z.enum(['calculate', 'price', 'measure']),
    service: z.string().max(48).optional(),
  }),
  /** Direct hand-off to WhatsApp, with optional prefilled context. */
  z.object({ kind: z.literal('whatsapp'), context: z.string().max(120).optional() }),
]);

export type LinkTarget = z.infer<typeof linkTarget>;

export const cta = z.object({
  label: localizedText(48),
  target: linkTarget,
  variant: z.enum(['primary', 'secondary', 'outline', 'ghost', 'link']).default('primary'),
});

export type Cta = z.infer<typeof cta>;

/**
 * A reference to a media asset.
 *
 * The focal point lives on the asset by default; `focalOverride` lets a single
 * block re-crop the same photograph without duplicating it or mutating the
 * original. Nothing here is destructive.
 *
 * The `media` marker is what the block editor looks for when it builds an image
 * picker for a block it has never seen. Marking the schema rather than sniffing
 * the value's shape matters for the empty case: an unset optional slot has no
 * value to recognise, and those are exactly the slots the owner needs to fill.
 */
export const mediaRef = z
  .object({
    assetId: z.uuid(),
    focalOverride: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .optional(),
    altOverride: localizedTextOptional(180).optional(),
    captionOverride: localizedTextOptional(180).optional(),
  })
  .meta({ media: true });

export type MediaRef = z.infer<typeof mediaRef>;

/** Aspect ratios the prototype actually uses. Free-form values are rejected. */
export const aspectRatio = z.enum(['1/1', '3/2', '4/3', '3/4', '4/5', '16/9', '21/9']);
export type AspectRatio = z.infer<typeof aspectRatio>;

/** Background treatment. Maps to the prototype's alternating section bands. */
export const sectionTone = z.enum(['default', 'muted', 'dark']);
export type SectionTone = z.infer<typeof sectionTone>;

export const columnCount = z.union([z.literal(2), z.literal(3), z.literal(4)]);

/** Stable per-item id so list reordering never loses React state or media usage. */
export const itemId = z.uuid();
