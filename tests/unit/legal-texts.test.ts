import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { legalRichTextSchema } from '@/content/blocks/schemas';
import { LEGAL_PLACEHOLDERS, LEGAL_TEXTS } from '@/content/legal';
import { LOCALES } from '@/i18n/routing';

/**
 * The privacy and cookie drafts.
 *
 * They are the one piece of content on this site that a visitor may rely on
 * and a regulator may read, and the one nobody can edit from the panel — a
 * `legal_rich_text` block has no editable fields there, so a mistake in this
 * file reaches the site through a deploy and leaves the same way. These checks
 * are what stands in for the review the block editor cannot give it.
 */
describe('legal texts', () => {
  /**
   * The renderer's `switch` is the whole vocabulary. A node type it does not
   * handle is not an error and not a warning — it renders nothing at all, so a
   * paragraph typed as `blockquote` by mistake would remove a clause from a
   * published policy silently.
   */
  const rendered = readFileSync(
    join(process.cwd(), 'src/content/blocks/render/rich-text.tsx'),
    'utf8',
  );
  // The root is handled above the switch — `RichText` maps `doc.content`
  // itself — so it renders without ever appearing as a case.
  const renderable = new Set([
    'doc',
    ...[...rendered.matchAll(/case '([a-zA-Z]+)':/g)].map((match) => match[1]!),
  ]);

  function nodeTypes(node: unknown, into = new Set<string>()): Set<string> {
    if (!node || typeof node !== 'object') return into;
    const candidate = node as { type?: string; content?: unknown[] };
    if (candidate.type) into.add(candidate.type);
    for (const child of candidate.content ?? []) nodeTypes(child, into);
    return into;
  }

  for (const key of ['privacy', 'cookies'] as const) {
    describe(key, () => {
      it('is present in every locale and satisfies the block schema', () => {
        for (const locale of LOCALES) {
          expect(LEGAL_TEXTS[key].heading[locale], `${key}.${locale} heading`).toBeTruthy();
          const parsed = legalRichTextSchema.safeParse({
            heading: LEGAL_TEXTS[key].heading,
            content: LEGAL_TEXTS[key].content,
            showTemplateNotice: true,
          });
          expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true);
        }
      });

      it('uses only node types the renderer draws', () => {
        for (const locale of LOCALES) {
          const used = [...nodeTypes(LEGAL_TEXTS[key].content[locale])];
          const unsupported = used.filter((type) => !renderable.has(type));
          expect(unsupported, `${key}.${locale} would render nothing for: ${unsupported}`).toEqual(
            [],
          );
        }
      });

      it('says the same thing in all three languages, section for section', () => {
        const headings = LOCALES.map(
          (locale) =>
            [...nodeTypes(LEGAL_TEXTS[key].content[locale])].length &&
            countHeadings(LEGAL_TEXTS[key].content[locale]),
        );
        // A translation that quietly lost a section is the failure this catches:
        // the Spanish reader would be missing a right the Russian one is told
        // about, which is exactly what a policy must not do.
        expect(new Set(headings).size, `heading counts per locale: ${headings}`).toBe(1);
      });
    });
  }

  /**
   * Deliberately asserted as *present*. Until the studio's own details replace
   * them, every placeholder must still be visible on the page — an invented
   * company name would be worse than a blank, and a half-filled policy that
   * looks finished is the thing this guards against.
   */
  it('still carries every placeholder the studio has to fill in', () => {
    const russian = JSON.stringify(LEGAL_TEXTS.privacy.content.ru);
    for (const placeholder of LEGAL_PLACEHOLDERS) {
      expect(russian, `missing ${placeholder}`).toContain(placeholder);
    }
  });
});

function countHeadings(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const candidate = node as { type?: string; content?: unknown[] };
  const self = candidate.type === 'heading' ? 1 : 0;
  return (candidate.content ?? []).reduce<number>((sum, child) => sum + countHeadings(child), self);
}
