import { z } from 'zod';

import { LOCALES } from '@/i18n/routing';

/**
 * Settings registry.
 *
 * Every editable global lives here with its type, its label and — crucially —
 * its validation. These values reach public HTML: a social URL becomes an
 * anchor, a phone number becomes a `tel:` and a `wa.me` link. Accepting
 * whatever was pasted would put a broken or hostile link on every page, so each
 * field is parsed rather than trusted.
 *
 * A registry rather than a database column for the field type: the admin form,
 * the server validation and the public reader all derive from one definition,
 * so they cannot disagree, and adding a setting needs no migration.
 */
export type SettingKind =
  'text' | 'url' | 'phone' | 'phone_digits' | 'localized' | 'boolean' | 'media';

export type SettingDefinition = {
  key: string;
  group: string;
  kind: SettingKind;
  label: string;
  help?: string;
  /** Warns when a value looks wrong for its purpose without blocking it. */
  expectHost?: string;
  schema: z.ZodTypeAny;
};

const localizedSchema = z
  .object(
    Object.fromEntries(LOCALES.map((locale) => [locale, z.string().trim().max(200).optional()])),
  )
  .refine((value) => Boolean((value as Record<string, string>).ru?.trim()), {
    message: 'ru_required',
  });

/**
 * URLs are restricted to http(s). A `javascript:` or `data:` URL in a footer
 * link is a stored XSS vector, and no legitimate social profile needs anything
 * else.
 */
const urlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: 'http_only' });

export const SETTINGS: SettingDefinition[] = [
  {
    key: 'contact.phone',
    group: 'Контакты',
    kind: 'phone',
    label: 'Телефон (как показывать)',
    help: 'Отображается на сайте как есть: +34 624 52 73 03',
    schema: z.string().trim().min(5).max(32),
  },
  {
    key: 'contact.phoneE164',
    group: 'Контакты',
    kind: 'phone',
    label: 'Телефон в формате E.164',
    help: 'Используется для ссылки «позвонить». Только + и цифры.',
    schema: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/, 'e164_format'),
  },
  {
    key: 'contact.whatsappNumber',
    group: 'Контакты',
    kind: 'phone_digits',
    label: 'Номер для WhatsApp',
    help: 'Только цифры, без плюса и пробелов: 34624527303',
    schema: z
      .string()
      .trim()
      .regex(/^[1-9]\d{6,14}$/, 'digits_only'),
  },
  {
    key: 'contact.email',
    group: 'Контакты',
    kind: 'text',
    label: 'Публичный email',
    schema: z.email(),
  },
  {
    key: 'contact.serviceArea',
    group: 'Контакты',
    kind: 'localized',
    label: 'География работ',
    help: 'Например: Испания, или конкретные провинции.',
    schema: localizedSchema,
  },
  {
    key: 'contact.address',
    group: 'Контакты',
    kind: 'text',
    label: 'Физический адрес',
    help: 'Заполняйте только если адрес должен быть публичным.',
    schema: z.string().trim().max(300),
  },
  {
    key: 'social.instagram',
    group: 'Соцсети',
    kind: 'url',
    label: 'Instagram',
    help: 'Полная ссылка на профиль студии.',
    expectHost: 'instagram.com',
    schema: urlSchema,
  },
  {
    key: 'social.facebook',
    group: 'Соцсети',
    kind: 'url',
    label: 'Facebook',
    expectHost: 'facebook.com',
    schema: urlSchema,
  },
  {
    key: 'legal.companyName',
    group: 'Юридическое',
    kind: 'text',
    label: 'Юридическое наименование и NIF/CIF',
    help: 'Показывается в футере и на юридических страницах.',
    schema: z.string().trim().max(200),
  },
  {
    key: 'seo.defaultTitle',
    group: 'SEO',
    kind: 'localized',
    label: 'Заголовок по умолчанию',
    help: 'Используется, если у страницы не задан свой.',
    schema: localizedSchema,
  },
  {
    key: 'seo.ogImage',
    group: 'SEO',
    kind: 'media',
    label: 'Картинка для соцсетей',
    help: 'Показывается при отправке ссылки в мессенджер. Лучше 1200×630.',
    schema: z.uuid(),
  },
  {
    key: 'brand.logo',
    group: 'Бренд',
    kind: 'media',
    label: 'Логотип',
    help: 'Пока не загружен, в шапке используется текстовое начертание.',
    schema: z.uuid(),
  },
  {
    key: 'brand.materialLogos',
    group: 'Бренд',
    kind: 'text',
    label: 'Логотипы EGGER / BLUM / HETTICH',
    help:
      'Заполняйте, только если правообладатель разрешил использование. Иначе бренды ' +
      'остаются текстом — это безопаснее и выглядит намеренно.',
    schema: z.string().trim().max(500),
  },
  {
    key: 'analytics.enabled',
    group: 'Аналитика',
    kind: 'boolean',
    label: 'Включить аналитику',
    help: 'Теги всё равно не сработают, пока посетитель не даст согласие.',
    schema: z.boolean(),
  },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((setting) => [setting.key, setting]));

/**
 * The serialisable half of a definition.
 *
 * A Zod schema is a class instance and cannot cross the Server/Client boundary
 * — React refuses it outright. The client does not need it either: validation
 * belongs on the server, where it cannot be skipped. So the form receives
 * presentation metadata only.
 */
export type SettingField = Omit<SettingDefinition, 'schema'>;

export function settingFields(): SettingField[] {
  return SETTINGS.map(({ schema: _schema, ...field }) => field);
}

/**
 * Normalise a stored value to the shape its field expects.
 *
 * Values in JSONB do not round-trip by type: an all-digit string such as the
 * WhatsApp number "34624527303" comes back from the driver as a *number*,
 * while "+34 624…" survives only because the '+' makes it unparseable as one.
 *
 * This has now bitten three separate places — a dead click-to-chat link, a
 * blank form field, and a save that failed validation on a value the database
 * itself had supplied. Coercing centrally, keyed by the field's declared kind,
 * is what stops it happening a fourth time: both the editor's initial values
 * and the incoming payload pass through here, so neither can disagree with the
 * schema about what a phone number is.
 */
export function coerceSettingValue(kind: SettingKind, raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;

  switch (kind) {
    case 'text':
    case 'url':
    case 'phone':
    case 'phone_digits':
    case 'media':
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'bigint') return String(raw);
      return raw;
    case 'boolean':
      return raw === true || raw === 'true';
    case 'localized':
      return raw;
    default:
      return raw;
  }
}

/** Groups in a stable display order. */
export const SETTING_GROUPS = [...new Set(SETTINGS.map((setting) => setting.group))];
