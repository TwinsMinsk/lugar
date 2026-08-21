import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { collectMediaSlots } from '@/features/admin/media-fields';
import { materialsQualitySchema, portfolioGallerySchema } from '@/content/blocks/schemas';
import { mediaRef } from '@/content/blocks/primitives';

const ASSET = '11111111-1111-4111-8111-111111111111';

describe('collectMediaSlots', () => {
  it('finds an optional slot that holds no value yet', () => {
    // The reason this module walks the schema rather than the value: a brand
    // with no logo has no `logo` key, and that is the slot the owner wants.
    const slots = collectMediaSlots(materialsQualitySchema, {
      heading: { ru: 'Материалы' },
      brands: [
        { id: 'a', name: 'EGGER', kind: { ru: 'Материалы' } },
        { id: 'b', name: 'BLUM', kind: { ru: 'Фурнитура' } },
      ],
      tone: 'muted',
    });

    expect(slots.map((slot) => slot.path)).toEqual(['brands[0].logo', 'brands[1].logo']);
    expect(slots.every((slot) => slot.assetId === null)).toBe(true);
    expect(slots.every((slot) => slot.optional)).toBe(true);
  });

  it('reports the chosen asset when a slot is filled', () => {
    const slots = collectMediaSlots(materialsQualitySchema, {
      heading: { ru: 'Материалы' },
      brands: [{ id: 'a', name: 'EGGER', kind: { ru: 'Материалы' }, logo: { assetId: ASSET } }],
      tone: 'muted',
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]!.assetId).toBe(ASSET);
  });

  it('numbers repeated slots so they stay distinguishable', () => {
    const slots = collectMediaSlots(materialsQualitySchema, {
      heading: { ru: 'Материалы' },
      brands: [
        { id: 'a', name: 'EGGER', kind: { ru: 'Материалы' } },
        { id: 'b', name: 'BLUM', kind: { ru: 'Фурнитура' } },
      ],
      tone: 'muted',
    });

    expect(slots.map((slot) => slot.label)).toEqual(['Логотип · 1', 'Логотип · 2']);
  });

  it('marks a required slot as not clearable', () => {
    // Clearing a required slot would produce a block that cannot be saved, so
    // the editor must be able to tell the two apart.
    const slots = collectMediaSlots(portfolioGallerySchema, {
      heading: { ru: 'Галерея' },
      items: [{ id: 'a', media: { assetId: ASSET } }],
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]!.optional).toBe(false);
  });

  it('enumerates only list items that exist', () => {
    const slots = collectMediaSlots(materialsQualitySchema, {
      heading: { ru: 'Материалы' },
      brands: [],
      tone: 'muted',
    });

    expect(slots).toEqual([]);
  });

  it('sees through default and nullable wrappers', () => {
    const schema = z.object({
      cover: mediaRef.nullable(),
      nested: z.object({ image: mediaRef.optional() }).default({}),
    });

    const slots = collectMediaSlots(schema, { cover: null, nested: {} });

    expect(slots.map((slot) => slot.path)).toEqual(['cover', 'nested.image']);
    expect(slots.every((slot) => slot.optional)).toBe(true);
  });

  it('returns nothing for a block that has no image slots', () => {
    const schema = z.object({ heading: z.string(), count: z.number() });
    expect(collectMediaSlots(schema, { heading: 'x', count: 1 })).toEqual([]);
  });
});
