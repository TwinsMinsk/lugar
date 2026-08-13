import { LOCALES, type Locale } from '@/i18n/routing';

/**
 * Discovering the editable text inside a block.
 *
 * Block data is a typed tree, but the editor should not need a bespoke form per
 * block type to let the owner change a heading — that would mean fourteen forms
 * to write and fourteen to keep in step with their schemas.
 *
 * Instead this walks the *value* and recognises localised leaves by shape: an
 * object whose keys are a subset of the locale list, with string values. That is
 * exactly the shape `localizedText()` produces, so every translatable string in
 * every block becomes editable automatically, and a new block type needs no
 * editor work at all.
 */
export type LocalizedField = {
  /** Dot/bracket path into the block's data, e.g. `source.items[0].title`. */
  path: string;
  /** Human label derived from the path's last meaningful segment. */
  label: string;
  values: Partial<Record<Locale, string>>;
  /** Long values get a textarea rather than a single-line input. */
  multiline: boolean;
};

const LOCALE_SET = new Set<string>(LOCALES);

function isLocalizedLeaf(value: unknown): value is Partial<Record<Locale, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (!keys.every((key) => LOCALE_SET.has(key))) return false;
  return Object.values(value).every((entry) => entry === undefined || typeof entry === 'string');
}

const LABELS: Record<string, string> = {
  heading: 'Заголовок',
  subheading: 'Подзаголовок',
  eyebrow: 'Надзаголовок',
  title: 'Название',
  description: 'Описание',
  text: 'Текст',
  lead: 'Вводный текст',
  label: 'Подпись',
  name: 'Название',
  note: 'Примечание',
  question: 'Вопрос',
  role: 'Должность',
  value: 'Значение',
  kind: 'Тип',
  caption: 'Подпись',
  itemCtaLabel: 'Кнопка на карточке',
  linkLabel: 'Ссылка',
};

function labelFor(path: string): string {
  const segments = path.replace(/\[\d+\]/g, '').split('.');
  const last = segments[segments.length - 1] ?? path;
  const base = LABELS[last] ?? last;
  // Keep the index visible so repeated items stay distinguishable.
  const index = /\[(\d+)\]/.exec(path.split('.').slice(0, -1).join('.'));
  return index ? `${base} · ${Number(index[1]) + 1}` : base;
}

export function collectLocalizedFields(data: unknown): LocalizedField[] {
  const found: LocalizedField[] = [];

  const walk = (node: unknown, path: string) => {
    if (node === null || node === undefined || typeof node !== 'object') return;

    if (isLocalizedLeaf(node)) {
      const values = node as Partial<Record<Locale, string>>;
      found.push({
        path,
        label: labelFor(path),
        values,
        multiline: (values.ru ?? '').length > 90,
      });
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, path ? `${path}.${key}` : key);
    }
  };

  walk(data, '');
  return found;
}

/** Immutably set a value at a `a.b[0].c` path. */
export function setAtPath<T>(root: T, path: string, value: unknown): T {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  const clone = (node: unknown): unknown =>
    Array.isArray(node) ? [...node] : { ...(node as Record<string, unknown>) };

  const result = clone(root) as Record<string, unknown>;
  let cursor: Record<string, unknown> = result;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    cursor[key] = clone(cursor[key]);
    cursor = cursor[key] as Record<string, unknown>;
  }

  const last = segments[segments.length - 1]!;
  cursor[last] = value;
  return result as T;
}

export function getAtPath(root: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
