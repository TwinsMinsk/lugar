import { z } from 'zod';

import {
  contactBlockSchema,
  ctaBannerSchema,
  faqSchema,
  founderProfileSchema,
  heroSchema,
  legalRichTextSchema,
  materialsQualitySchema,
  portfolioGallerySchema,
  portfolioTeaserSchema,
  processStepsSchema,
  richTextSchema,
  serviceGridSchema,
  statisticsSchema,
  textWithMediaSchema,
} from './schemas';

/**
 * Every block on a page carries the same envelope: a stable id, its type, and
 * a visibility flag. The id must survive reordering, because media usage rows
 * and React keys are both anchored to it.
 */
const envelope = <T extends string, S extends z.ZodTypeAny>(type: T, data: S) =>
  z.object({
    id: z.uuid(),
    type: z.literal(type),
    hidden: z.boolean().default(false),
    /** Optional anchor so navigation can deep-link to a section. */
    anchor: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(48)
      .optional(),
    data,
  });

export const anyBlockSchema = z.discriminatedUnion('type', [
  envelope('hero', heroSchema),
  envelope('rich_text', richTextSchema),
  envelope('text_with_media', textWithMediaSchema),
  envelope('service_grid', serviceGridSchema),
  envelope('portfolio_teaser', portfolioTeaserSchema),
  envelope('portfolio_gallery', portfolioGallerySchema),
  envelope('materials_quality', materialsQualitySchema),
  envelope('process_steps', processStepsSchema),
  envelope('statistics', statisticsSchema),
  envelope('founder_profile', founderProfileSchema),
  envelope('cta_banner', ctaBannerSchema),
  envelope('contact_block', contactBlockSchema),
  envelope('faq', faqSchema),
  envelope('legal_rich_text', legalRichTextSchema),
]);

export type AnyBlock = z.infer<typeof anyBlockSchema>;
export type BlockType = AnyBlock['type'];
export type BlockData<T extends BlockType> = Extract<AnyBlock, { type: T }>['data'];

/** Strict — used on every write. An invalid block is never persisted. */
export const blocksSchema = z.array(anyBlockSchema);

export const BLOCK_TYPES = [
  'hero',
  'rich_text',
  'text_with_media',
  'service_grid',
  'portfolio_teaser',
  'portfolio_gallery',
  'materials_quality',
  'process_steps',
  'statistics',
  'founder_profile',
  'cta_banner',
  'contact_block',
  'faq',
  'legal_rich_text',
] as const satisfies readonly BlockType[];

/** Page templates a document can use. Determines which blocks are offered. */
export const TEMPLATES = [
  'home',
  'service',
  'portfolio_index',
  'project',
  'about',
  'contact',
  'legal',
  'thanks',
] as const;

export type TemplateId = (typeof TEMPLATES)[number];
