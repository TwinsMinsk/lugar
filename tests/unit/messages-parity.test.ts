import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import es from '../../messages/es.json';
import ru from '../../messages/ru.json';

/**
 * The UI-chrome message catalogs, kept in lockstep.
 *
 * These three files are hand-edited independently — there is no build step
 * that derives es/en from ru — so nothing stops one language from silently
 * drifting: a key added to ru.json and forgotten in the other two falls back
 * to the raw key name in production (`getMessageFallback` in
 * `src/i18n/request.ts`), and a key removed from ru.json but left in es.json
 * is dead weight nobody notices. Diffing the flattened key sets is the cheap
 * check that catches both directions.
 */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalog parity', () => {
  const ruKeys = new Set(flattenKeys(ru));
  const esKeys = new Set(flattenKeys(es));
  const enKeys = new Set(flattenKeys(en));

  it('es has exactly the same keys as ru', () => {
    expect([...esKeys].sort()).toEqual([...ruKeys].sort());
  });

  it('en has exactly the same keys as ru', () => {
    expect([...enKeys].sort()).toEqual([...ruKeys].sort());
  });

  it('no es or en value is left as untranslated Cyrillic', () => {
    const cyrillic = /[А-Яа-яЁё]/;
    const leftInRussian = (value: unknown, prefix = ''): string[] => {
      if (value === null) return [];
      if (typeof value === 'string') return cyrillic.test(value) ? [prefix] : [];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
        leftInRussian(child, prefix ? `${prefix}.${key}` : key),
      );
    };
    expect(leftInRussian(es)).toEqual([]);
    expect(leftInRussian(en)).toEqual([]);
  });
});
