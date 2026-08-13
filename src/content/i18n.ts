import { z } from 'zod';

import { DEFAULT_LOCALE, LOCALE_FALLBACK, LOCALES, type Locale } from '@/i18n/routing';

export { DEFAULT_LOCALE, LOCALE_FALLBACK, LOCALES, type Locale };

/**
 * Localised leaves.
 *
 * Only *string* fields inside a block carry translations. Structure — which
 * image, how many columns, where a CTA points — is shared across all three
 * languages. That is what makes the block model design-safe: there is exactly
 * one hero image and three headlines, so editing Russian cannot leave the
 * Spanish page with a stale photograph or a broken column count.
 *
 * `ru` is required because it terminates every fallback chain.
 */
export const localizedText = (max = 500) =>
  z.object({
    ru: z.string().trim().min(1).max(max),
    es: z.string().trim().max(max).optional(),
    en: z.string().trim().max(max).optional(),
  });

export type LocalizedText = z.infer<ReturnType<typeof localizedText>>;

/** Same shape, but the source language may also be blank (optional captions). */
export const localizedTextOptional = (max = 500) =>
  z.object({
    ru: z.string().trim().max(max).optional(),
    es: z.string().trim().max(max).optional(),
    en: z.string().trim().max(max).optional(),
  });

export type LocalizedTextOptional = z.infer<ReturnType<typeof localizedTextOptional>>;

/**
 * The single fallback chokepoint.
 *
 * Every read of a localised field goes through here, so "what happens when
 * Spanish is missing" has exactly one answer: show the Russian original. A
 * visible fallback is strictly better than an empty slot, and having one
 * implementation means the admin can compute translation coverage by walking
 * the same leaves.
 */
export function t<T>(
  value: (Partial<Record<Locale, T>> & { ru?: T }) | null | undefined,
  locale: Locale,
): T | undefined {
  if (!value) return undefined;
  for (const candidate of LOCALE_FALLBACK[locale]) {
    const hit = value[candidate];
    if (hit !== undefined && hit !== null && hit !== '') return hit;
  }
  return value.ru;
}

/** Non-optional variant for fields the schema guarantees are present. */
export function tRequired(value: LocalizedText, locale: Locale): string {
  return t(value, locale) ?? value.ru;
}

/** Which locales actually carry a value — drives translation-coverage reporting. */
export function translatedLocales(value: Partial<Record<Locale, unknown>>): Locale[] {
  return LOCALES.filter((locale) => {
    const hit = value[locale];
    return hit !== undefined && hit !== null && hit !== '';
  });
}

/**
 * Constrained rich text.
 *
 * TipTap JSON is stored, never raw HTML, and only the node types listed here
 * survive validation. Rendering walks this same allowlist, so there is no path
 * by which an editor — or anyone who reaches the database — can inject markup,
 * scripts or styles into a public page.
 */
export const RICH_TEXT_NODES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'hardBreak',
  'horizontalRule',
] as const;

export const RICH_TEXT_MARKS = ['bold', 'italic', 'link'] as const;

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.enum(RICH_TEXT_NODES),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
    text: z.string().optional(),
    marks: z
      .array(
        z.object({
          type: z.enum(RICH_TEXT_MARKS),
          attrs: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
  }),
);

export const richTextDoc = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema).default([]),
});

export type RichTextDoc = z.infer<typeof richTextDoc>;

export const localizedRichText = z.object({
  ru: richTextDoc,
  es: richTextDoc.optional(),
  en: richTextDoc.optional(),
});

export type LocalizedRichText = z.infer<typeof localizedRichText>;
