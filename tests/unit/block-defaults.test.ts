import { describe, expect, it } from 'vitest';

import { blockNeedsMedia, createBlock, defaultBlockData } from '@/content/blocks/defaults';
import { BLOCK_REGISTRY, blocksAllowedOn } from '@/content/blocks/registry';
import { anyBlockSchema, BLOCK_TYPES } from '@/content/blocks/union';
import { PAGE_SEEDS } from '@/db/seed/content';

/**
 * What a newly added block starts as.
 *
 * The palette inserts a block into a draft the owner then saves, and
 * `saveDraft` is all-or-nothing: it validates the whole list and persists
 * nothing if one block fails. A default that does not satisfy its own schema
 * therefore does not produce a broken section — it makes the entire page
 * unsavable, with no indication of which block to remove. So every type is
 * checked here rather than trusted.
 */
const ASSET_ID = '00000000-0000-4000-8000-0000000000aa';

describe('default block data', () => {
  it('covers every registered type', () => {
    for (const type of BLOCK_TYPES) {
      expect(defaultBlockData(type, ASSET_ID), `${type} has no default`).toBeDefined();
    }
  });

  it('satisfies each block type its own schema', () => {
    for (const type of BLOCK_TYPES) {
      const result = BLOCK_REGISTRY[type].schema.safeParse(defaultBlockData(type, ASSET_ID));
      expect(result.success, `${type}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('produces a block the union accepts, which is what saveDraft validates', () => {
    for (const type of BLOCK_TYPES) {
      const block = createBlock(type, ASSET_ID);
      const result = anyBlockSchema.safeParse(block);
      expect(result.success, `${type}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  /**
   * The two that cannot be created without a picture, stated as a test rather
   * than as a comment: `text_with_media.media` is a required reference and
   * `portfolio_gallery` needs at least one item carrying one. The palette hides
   * them while the library is empty, and this is what keeps that list honest if
   * a schema changes.
   */
  it('names exactly the types that need an image to exist', () => {
    for (const type of BLOCK_TYPES) {
      const withoutMedia = BLOCK_REGISTRY[type].schema.safeParse(defaultBlockData(type, null));
      expect(withoutMedia.success, `${type} disagrees with blockNeedsMedia`).toBe(
        !blockNeedsMedia(type),
      );
    }
  });

  /**
   * A palette built from `blocksAllowedOn` must be able to re-add what the page
   * already ships with. Every block the seed places on a template is checked
   * against that template's own list — a mismatch means the owner can delete a
   * section and then find it missing from the menu that should offer it back.
   */
  it('allows every block type the seed places on each template', () => {
    const mismatches: string[] = [];

    for (const seed of PAGE_SEEDS) {
      const allowed = new Set(blocksAllowedOn(seed.template).map((definition) => definition.type));
      for (const block of seed.blocks) {
        if (!allowed.has(block.type)) {
          mismatches.push(`${seed.template}: ${block.type}`);
        }
      }
    }

    expect([...new Set(mismatches)]).toEqual([]);
  });

  /**
   * The same rule for projects, whose starter blocks live in the create action
   * rather than in the seed (importing that module here would drag a
   * `'use server'` file and a database connection into a unit test, so the
   * three types are named instead — they are the ones `createProject` inserts).
   *
   * `hero` was missing from the project template's list while every project is
   * created with one, so removing that block made it unaddable.
   */
  it('allows every block type a new project starts with', () => {
    const allowed = new Set(blocksAllowedOn('project').map((definition) => definition.type));
    for (const type of ['hero', 'portfolio_gallery', 'portfolio_teaser'] as const) {
      expect(allowed.has(type), `${type} is not offered on a project page`).toBe(true);
    }
  });
});
