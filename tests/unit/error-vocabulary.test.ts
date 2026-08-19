import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE_ERRORS, messagesFor } from '@/features/admin/messages';

/**
 * The panel speaks Russian, and the actions speak codes.
 *
 * That split only holds while every code has a phrase and no phrase is written
 * in English. Both were broken before this test: the page editor showed
 * `Ошибка: invalid_blocks`, and three actions returned Zod's own English text
 * straight into the interface.
 *
 * This reads the action sources rather than importing them — they are
 * `'use server'` modules that reach for a database on import, and the question
 * here is textual anyway.
 */
const ACTIONS_DIR = join(process.cwd(), 'src/app/(admin)/admin/_actions');

function actionSources(): Array<{ file: string; source: string }> {
  return readdirSync(ACTIONS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ file: name, source: readFileSync(join(ACTIONS_DIR, name), 'utf8') }));
}

/** Every `error: 'code'` literal an action can return. */
function producedCodes(): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  for (const { file, source } of actionSources()) {
    for (const match of source.matchAll(/error:\s*'([a-z0-9_]+)'/g)) {
      const code = match[1]!;
      byCode.set(code, [...(byCode.get(code) ?? []), file]);
    }
    // Codes assigned into a field-error map rather than returned directly.
    for (const match of source.matchAll(/errors\[[^\]]+\]\s*=\s*'([a-z0-9_]+)'/g)) {
      const code = match[1]!;
      byCode.set(code, [...(byCode.get(code) ?? []), file]);
    }
    // Codes thrown inside a transaction and surfaced by its catch block. These
    // reach the panel exactly like a returned one, and are easy to forget:
    // `revision_not_found` was invisible to this test until it was added.
    for (const match of source.matchAll(/throw new Error\('([a-z0-9_]+)'\)/g)) {
      const code = match[1]!;
      byCode.set(code, [...(byCode.get(code) ?? []), file]);
    }
  }
  return byCode;
}

describe('error vocabulary', () => {
  it('has a phrase for every code the actions can return', () => {
    // Against the base, not against the screen dictionaries: a code worded on
    // only one screen is a code that shows up bare on the next one.
    const missing = [...producedCodes().entries()]
      .filter(([code]) => !(code in BASE_ERRORS))
      .map(([code, files]) => `${code} (${[...new Set(files)].join(', ')})`);

    expect(missing, `codes with no Russian message:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('says nothing in English', () => {
    // A phrase made only of Latin letters and punctuation is a leaked default.
    const latinOnly = Object.entries(BASE_ERRORS).filter(
      ([, phrase]) => !/[а-яё]/i.test(phrase) && /[a-z]{4,}/i.test(phrase),
    );
    expect(latinOnly).toEqual([]);
  });

  it('resolves an unknown code to a Russian sentence rather than the code', () => {
    const message = messagesFor();
    expect(message('code_nobody_wrote')).toBe(BASE_ERRORS.unexpected);
    expect(message(undefined)).toBe(BASE_ERRORS.unexpected);
  });

  it('never lets an action return a Zod message verbatim', () => {
    const offenders = actionSources()
      .filter(({ source }) => /error:\s*parsed\.error\.issues/.test(source))
      .map(({ file }) => file);

    expect(offenders, 'use failFromZod(parsed.error) instead').toEqual([]);
  });

  it('never lets an action return an exception message verbatim', () => {
    const offenders = actionSources()
      .filter(({ source }) => /error:\s*error instanceof Error \? error\.message/.test(source))
      .map(({ file }) => file);

    expect(offenders, 'return a code; the stack belongs in the server log').toEqual([]);
  });
});
