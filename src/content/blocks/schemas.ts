import { z } from 'zod';

import { localizedRichText, localizedText, localizedTextOptional } from '../i18n';
import { aspectRatio, columnCount, cta, itemId, mediaRef, sectionTone } from './primitives';

/**
 * The 14 block types.
 *
 * Every visual arrangement in the approved prototype is reachable through these
 * schemas — the variants are not invented flexibility, they are the specific
 * looks the prototype already ships (card grids at 4/3 and 3/2, plain grids at
 * 1/1 and 3/4, and so on). An editor picks a variant; they cannot author a new
 * layout, which is what keeps the design intact.
 */

// ---------------------------------------------------------------------------
// hero
// ---------------------------------------------------------------------------
export const heroSchema = z.object({
  /**
   * `full_bleed` is the home page: a cover photograph with a diagonal scrim.
   * `text` is the inner-page header (Корпусная мебель / Мебель / Двери /
   * Наши работы), which the prototype renders with no image at all.
   */
  variant: z.enum(['full_bleed', 'text']).default('text'),
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(160),
  subheading: localizedTextOptional(320).optional(),
  media: mediaRef.optional(),
  overlay: z.enum(['none', 'scrim', 'gradient']).default('gradient'),
  primaryCta: cta.optional(),
  secondaryCta: cta.optional(),
});

// ---------------------------------------------------------------------------
// rich_text
// ---------------------------------------------------------------------------
export const richTextSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedTextOptional(160).optional(),
  content: localizedRichText,
  width: z.enum(['narrow', 'default']).default('narrow'),
  tone: sectionTone.default('default'),
});

// ---------------------------------------------------------------------------
// text_with_media
// ---------------------------------------------------------------------------
export const textWithMediaSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(160),
  body: localizedRichText.optional(),
  lead: localizedTextOptional(600).optional(),
  media: mediaRef,
  mediaSide: z.enum(['left', 'right']).default('right'),
  aspect: aspectRatio.default('4/5'),
  tone: sectionTone.default('default'),
  cta: cta.optional(),
});

// ---------------------------------------------------------------------------
// service_grid
// ---------------------------------------------------------------------------
const serviceItem = z.object({
  id: itemId,
  title: localizedText(96),
  description: localizedTextOptional(280).optional(),
  media: mediaRef.optional(),
  link: cta.optional(),
});

export const serviceGridSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedTextOptional(200).optional(),
  /**
   * `manual` lists items inline. `direction` pulls them live from
   * service_categories, so adding a kitchen category in the CRM taxonomy also
   * updates the page without a content edit.
   */
  source: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('manual'), items: z.array(serviceItem).min(1).max(12) }),
    z.object({
      mode: z.literal('direction'),
      direction: z.enum(['korpusnaya', 'mebel', 'dveri']),
    }),
  ]),
  /** `card` = bordered card with body copy; `plain` = image + title only. */
  variant: z.enum(['card', 'plain']).default('card'),
  aspect: aspectRatio.default('4/3'),
  columns: columnCount.default(3),
  /** Renders the "Узнать стоимость" action on each tile. */
  showItemCta: z.boolean().default(false),
  itemCtaLabel: localizedTextOptional(48).optional(),
  minItemWidth: z.number().int().min(200).max(400).default(280),
});

// ---------------------------------------------------------------------------
// portfolio_teaser
// ---------------------------------------------------------------------------
export const portfolioTeaserSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  source: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('manual'), documentIds: z.array(z.uuid()).min(1).max(12) }),
    z.object({
      mode: z.literal('latest'),
      limit: z.number().int().min(2).max(12).default(6),
      categorySlug: z.string().max(48).optional(),
    }),
    z.object({ mode: z.literal('featured'), limit: z.number().int().min(2).max(12).default(6) }),
  ]),
  aspect: aspectRatio.default('4/5'),
  columns: columnCount.default(3),
  linkLabel: localizedTextOptional(48).optional(),
  linkTargetDocumentId: z.uuid().optional(),
});

// ---------------------------------------------------------------------------
// portfolio_gallery
// ---------------------------------------------------------------------------
export const portfolioGallerySchema = z.object({
  heading: localizedTextOptional(160).optional(),
  items: z
    .array(
      z.object({ id: itemId, media: mediaRef, caption: localizedTextOptional(200).optional() }),
    )
    .min(1)
    .max(40),
  layout: z.enum(['grid', 'masonry', 'full_width']).default('grid'),
  columns: columnCount.default(2),
});

// ---------------------------------------------------------------------------
// materials_quality
// ---------------------------------------------------------------------------
export const materialsQualitySchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  text: localizedTextOptional(600).optional(),
  brands: z
    .array(
      z.object({
        id: itemId,
        /** Brand names are proper nouns and are NOT localised. */
        name: z.string().min(1).max(48),
        kind: localizedText(48),
        /**
         * Optional. Until the owner supplies logo files with permission to use
         * them, brands render as a text treatment — never a scraped logo.
         */
        logo: mediaRef.optional(),
      }),
    )
    .min(1)
    .max(8),
  tone: sectionTone.default('muted'),
});

// ---------------------------------------------------------------------------
// process_steps
// ---------------------------------------------------------------------------
export const processStepsSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  steps: z
    .array(
      z.object({
        id: itemId,
        name: localizedText(64),
        note: localizedTextOptional(240).optional(),
      }),
    )
    .min(2)
    .max(8),
  tone: sectionTone.default('muted'),
  cta: cta.optional(),
});

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------
export const statisticsSchema = z.object({
  heading: localizedTextOptional(160).optional(),
  items: z
    .array(
      z.object({
        id: itemId,
        /**
         * Localised because the unit is part of the phrase ("3 года" /
         * "3 años" / "3 years"), not a number with a suffix.
         */
        value: localizedText(24),
        label: localizedText(96),
      }),
    )
    .min(2)
    .max(6),
});

// ---------------------------------------------------------------------------
// founder_profile
// ---------------------------------------------------------------------------
export const founderProfileSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  paragraphs: z.array(localizedText(900)).min(1).max(4),
  /**
   * The prototype renders the About section as one two-column composition:
   * copy plus statistics on the left, portrait plus name and role on the
   * right. Keeping them in a single block reproduces that exactly instead of
   * relying on two blocks happening to sit next to each other.
   */
  stats: z
    .array(z.object({ id: itemId, value: localizedText(24), label: localizedText(96) }))
    .max(6)
    .optional(),
  media: mediaRef.optional(),
  name: z.string().min(1).max(96),
  role: localizedText(160),
  cta: cta.optional(),
});

// ---------------------------------------------------------------------------
// cta_banner
// ---------------------------------------------------------------------------
export const ctaBannerSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  text: localizedTextOptional(400).optional(),
  primaryCta: cta,
  secondaryCta: cta.optional(),
  tone: sectionTone.default('muted'),
});

// ---------------------------------------------------------------------------
// contact_block
// ---------------------------------------------------------------------------
export const contactBlockSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  lead: localizedTextOptional(400).optional(),
  primaryCta: cta.optional(),
  /**
   * Phone, social links and service area are read from site_settings, not
   * stored here — so an unknown Instagram URL stays unknown in exactly one
   * place instead of being copy-pasted into three locales of three pages.
   */
  showPhone: z.boolean().default(true),
  showSocial: z.boolean().default(true),
  showServiceArea: z.boolean().default(true),
  showForm: z.boolean().default(false),
  tone: sectionTone.default('dark'),
});

// ---------------------------------------------------------------------------
// faq
// ---------------------------------------------------------------------------
export const faqSchema = z.object({
  eyebrow: localizedTextOptional(60).optional(),
  heading: localizedText(200),
  items: z
    .array(
      z.object({
        id: itemId,
        question: localizedText(240),
        answer: localizedRichText,
      }),
    )
    .min(1)
    .max(24),
  /**
   * FAQPage structured data is only emitted when the owner opts in, because
   * marking up questions that are not genuinely FAQs is a search-quality
   * violation rather than a free win.
   */
  emitStructuredData: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// legal_rich_text
// ---------------------------------------------------------------------------
export const legalRichTextSchema = z.object({
  heading: localizedText(200),
  content: localizedRichText,
  lastUpdated: z.iso.date().optional(),
  /**
   * Rendered as a visible notice. These documents ship as owner-reviewable
   * templates, and presenting a template as finished legal advice would be
   * worse than shipping nothing.
   */
  showTemplateNotice: z.boolean().default(true),
});

export type HeroData = z.infer<typeof heroSchema>;
export type RichTextData = z.infer<typeof richTextSchema>;
export type TextWithMediaData = z.infer<typeof textWithMediaSchema>;
export type ServiceGridData = z.infer<typeof serviceGridSchema>;
export type PortfolioTeaserData = z.infer<typeof portfolioTeaserSchema>;
export type PortfolioGalleryData = z.infer<typeof portfolioGallerySchema>;
export type MaterialsQualityData = z.infer<typeof materialsQualitySchema>;
export type ProcessStepsData = z.infer<typeof processStepsSchema>;
export type StatisticsData = z.infer<typeof statisticsSchema>;
export type FounderProfileData = z.infer<typeof founderProfileSchema>;
export type CtaBannerData = z.infer<typeof ctaBannerSchema>;
export type ContactBlockData = z.infer<typeof contactBlockSchema>;
export type FaqData = z.infer<typeof faqSchema>;
export type LegalRichTextData = z.infer<typeof legalRichTextSchema>;
