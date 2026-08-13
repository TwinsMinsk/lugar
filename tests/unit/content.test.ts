import { describe, expect, it } from 'vitest';

import { collectMediaUsage } from '@/content/blocks/media-usage';
import { BLOCK_REGISTRY, blocksAllowedOn } from '@/content/blocks/registry';
import { anyBlockSchema, BLOCK_TYPES } from '@/content/blocks/union';
import { t, tRequired, translatedLocales } from '@/content/i18n';
import { coerceSettingString } from '@/data/public/settings';
import { documentPath, localePath, whatsappLink } from '@/lib/routes';

describe('localised leaves', () => {
  const value = { ru: 'Кухни', es: 'Cocinas', en: 'Kitchens' };

  it('returns the requested locale when present', () => {
    expect(t(value, 'es')).toBe('Cocinas');
    expect(t(value, 'en')).toBe('Kitchens');
  });

  it('falls back to Russian for an untranslated locale', () => {
    expect(t({ ru: 'Кухни' }, 'es')).toBe('Кухни');
    expect(t({ ru: 'Кухни', en: 'Kitchens' }, 'es')).toBe('Кухни');
  });

  it('treats an empty string as untranslated rather than rendering a blank', () => {
    expect(t({ ru: 'Кухни', es: '' }, 'es')).toBe('Кухни');
  });

  it('never falls back through a non-source locale', () => {
    // es must not borrow en — only the source language terminates the chain.
    expect(t({ ru: 'Кухни', en: 'Kitchens' }, 'es')).toBe('Кухни');
  });

  it('reports translation coverage', () => {
    expect(translatedLocales(value)).toEqual(['ru', 'es', 'en']);
    expect(translatedLocales({ ru: 'a', es: '' })).toEqual(['ru']);
  });

  it('tRequired always yields a string', () => {
    expect(tRequired({ ru: 'Кухни' }, 'en')).toBe('Кухни');
  });
});

describe('block registry', () => {
  it('defines every block type required by the brief', () => {
    expect(BLOCK_TYPES).toHaveLength(14);
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_REGISTRY[type], `${type} missing from registry`).toBeDefined();
      expect(BLOCK_REGISTRY[type].type).toBe(type);
    }
  });

  it('offers legal_rich_text only on legal pages', () => {
    expect(blocksAllowedOn('legal').map((d) => d.type)).toContain('legal_rich_text');
    expect(blocksAllowedOn('home').map((d) => d.type)).not.toContain('legal_rich_text');
  });

  it('rejects a block whose data does not satisfy its schema', () => {
    const invalid = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'hero',
      data: { variant: 'full_bleed' }, // heading is required
    };
    expect(anyBlockSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an unknown block type outright', () => {
    const unknown = {
      id: '00000000-0000-4000-8000-000000000002',
      type: 'raw_html',
      data: { html: '<script>alert(1)</script>' },
    };
    expect(anyBlockSchema.safeParse(unknown).success).toBe(false);
  });
});

describe('media usage extraction', () => {
  const assetA = '11111111-1111-4111-8111-111111111111';
  const assetB = '22222222-2222-4222-8222-222222222222';

  it('finds media nested at any depth and records its field path', () => {
    const blocks = [
      {
        id: '00000000-0000-4000-8000-00000000000a',
        type: 'service_grid',
        hidden: false,
        data: {
          source: {
            mode: 'manual',
            items: [
              { id: 'x', title: { ru: 'a' }, media: { assetId: assetA } },
              { id: 'y', title: { ru: 'b' }, media: { assetId: assetB } },
            ],
          },
        },
      },
    ] as never;

    const usage = collectMediaUsage(blocks);
    expect(usage).toHaveLength(2);
    expect(usage.map((u) => u.assetId).sort()).toEqual([assetA, assetB].sort());
    expect(usage[0]!.fieldPath).toMatch(/^blocks\[0\]\.source\.items\[\d+\]\.media$/);
  });

  it('records the same asset once per distinct path, not once overall', () => {
    const blocks = [
      {
        id: '00000000-0000-4000-8000-00000000000b',
        type: 'hero',
        hidden: false,
        data: { heading: { ru: 'h' }, media: { assetId: assetA } },
      },
      {
        id: '00000000-0000-4000-8000-00000000000c',
        type: 'hero',
        hidden: false,
        data: { heading: { ru: 'h' }, media: { assetId: assetA } },
      },
    ] as never;

    // Two blocks reference the same asset — both must be recorded, or deleting
    // one block would look like the asset became unused.
    expect(collectMediaUsage(blocks)).toHaveLength(2);
  });

  it('returns nothing for blocks with no media', () => {
    const blocks = [
      {
        id: '00000000-0000-4000-8000-00000000000d',
        type: 'statistics',
        hidden: false,
        data: { items: [{ id: 'a', value: { ru: '3' }, label: { ru: 'года' } }] },
      },
    ] as never;
    expect(collectMediaUsage(blocks)).toEqual([]);
  });
});

describe('URL construction', () => {
  it('applies the as-needed locale prefix', () => {
    expect(localePath('ru', '/dveri')).toBe('/dveri');
    expect(localePath('es', '/puertas')).toBe('/es/puertas');
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('ru', '/')).toBe('/');
  });

  it('nests projects under the portfolio index slug for that locale', () => {
    expect(documentPath('project', 'kuhnya', 'raboty')).toBe('/raboty/kuhnya');
    expect(documentPath('project', 'cocina', 'proyectos')).toBe('/proyectos/cocina');
    expect(documentPath('page', '')).toBe('/');
    expect(documentPath('page', 'kontakty')).toBe('/kontakty');
  });

  it('builds a wa.me link with a percent-encoded Cyrillic message', () => {
    const link = whatsappLink('+34 624 52 73 03', 'Здравствуйте! Хочу расчёт «Кухня» & замер');
    expect(link.startsWith('https://wa.me/34624527303?text=')).toBe(true);

    // The number must be digits only — no '+', spaces or dashes.
    expect(new URL(link).pathname).toBe('/34624527303');

    // And the message must survive a round trip intact, including Cyrillic,
    // guillemets and an ampersand that would otherwise split the query string.
    const decoded = new URL(link).searchParams.get('text');
    expect(decoded).toBe('Здравствуйте! Хочу расчёт «Кухня» & замер');
  });

  it('omits the query entirely when there is no message', () => {
    expect(whatsappLink('34624527303')).toBe('https://wa.me/34624527303');
  });
});

describe('settings coercion', () => {
  it('preserves a phone number stored as an all-digit JSON value', () => {
    // Postgres stores "34624527303" as a JSON string, but it comes back from
    // the driver as a number. Without coercion whatsappLink() would call
    // .replace() on a number and the click-to-chat link would be dead.
    expect(coerceSettingString(34624527303)).toBe('34624527303');
    expect(coerceSettingString('+34 624 52 73 03')).toBe('+34 624 52 73 03');
  });

  it('treats absent values as absent rather than as the string "null"', () => {
    expect(coerceSettingString(null)).toBeNull();
    expect(coerceSettingString(undefined)).toBeNull();
  });

  it('refuses to stringify a structured value', () => {
    // An object here means the setting was mis-seeded; "[object Object]" in a
    // phone link would be worse than rendering nothing.
    expect(coerceSettingString({ ru: 'x' })).toBeNull();
    expect(coerceSettingString(['a'])).toBeNull();
  });
});
