import { describe, expect, it } from 'vitest';

import { richTextToPlainText } from '@/content/blocks/render/rich-text';
import type { RichTextDoc } from '@/content/i18n';

/**
 * The one consumer of this function needs a plain string, not markup — a
 * `FAQPage` answer in JSON-LD. Wrong output here does not crash anything; it
 * quietly ships malformed structured data that Google's validator rejects
 * without telling the owner why, so the shape is worth pinning down directly
 * rather than trusting it by inspection.
 */
describe('richTextToPlainText', () => {
  it('returns an empty string for a doc with no content', () => {
    const doc: RichTextDoc = { type: 'doc', content: [] };
    expect(richTextToPlainText(doc)).toBe('');
  });

  it('returns an empty string when the doc itself is undefined', () => {
    expect(richTextToPlainText(undefined)).toBe('');
  });

  it('joins multiple paragraphs with a space rather than running them together', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First sentence.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second sentence.' }] },
      ],
    };
    expect(richTextToPlainText(doc)).toBe('First sentence. Second sentence.');
  });

  it('flattens a nested list into plain text', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToPlainText(doc)).toBe('One Two');
  });

  it('concatenates a marked inline run without inserting extra spaces', () => {
    // The bug this guards: joining a paragraph's children with a space would
    // print "Plain and  bold  text." — the mark boundary is not a word
    // boundary, and the spacing here already lives inside the text runs
    // themselves, exactly as TipTap stores it.
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Plain and ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' text.' },
          ],
        },
      ],
    };
    expect(richTextToPlainText(doc)).toBe('Plain and bold text.');
  });

  it('turns a manual line break into a single space rather than dropping it', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Line one' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line two' },
          ],
        },
      ],
    };
    expect(richTextToPlainText(doc)).toBe('Line one line two');
  });
});
