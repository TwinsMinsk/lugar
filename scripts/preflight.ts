/**
 * Pre-deploy check.
 *
 * Answers one question — "would this configuration actually run?" — against
 * whatever environment it is pointed at. Run it locally with the production
 * variables loaded before the first deploy, and on the server afterwards.
 *
 * The checks that matter here are the ones that fail at *runtime* rather than
 * at build: object-storage credentials, a reachable database, migrations that
 * were never applied. A build succeeds without any of them and the site then
 * breaks on the first upload or the first page view.
 *
 * Storage is verified by a real round trip — put, read back, delete. Reading
 * the four S3 variables proves only that somebody typed something; it is the
 * bucket's permissions that are usually wrong.
 */
import './load-env';

import postgres from 'postgres';

import journal from '../drizzle/meta/_journal.json' with { type: 'json' };
import type { ServerEnv } from '@/env';
import type { StorageDriver } from '@/lib/storage';

type Level = 'ok' | 'warn' | 'fail';

const results: Array<{ level: Level; label: string; detail: string }> = [];

function report(level: Level, label: string, detail: string) {
  results.push({ level, label, detail });
}

/** Ideal for a production deploy; a warning is a decision, not a defect. */
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

// --- environment ------------------------------------------------------------

async function checkEnvironment() {
  let env: ServerEnv;
  try {
    ({ env } = await import('@/env'));
    // The proxy validates on first read, so touching one key checks them all.
    void env.DATABASE_URL;
    report('ok', 'Переменные окружения', 'проходят проверку приложения');
  } catch (error) {
    report('fail', 'Переменные окружения', String(error instanceof Error ? error.message : error));
    return null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    report('fail', 'NEXT_PUBLIC_APP_URL', 'не задан — канонические ссылки и sitemap будут неверны');
  } else if (appUrl.endsWith('/')) {
    report('fail', 'NEXT_PUBLIC_APP_URL', `${appUrl} — уберите слэш на конце`);
  } else if (isProduction && !appUrl.startsWith('https://')) {
    report('fail', 'NEXT_PUBLIC_APP_URL', `${appUrl} — в продакшене нужен https`);
  } else {
    report('ok', 'NEXT_PUBLIC_APP_URL', appUrl);
  }

  for (const key of ['BETTER_AUTH_SECRET', 'PREVIEW_SECRET'] as const) {
    const value = process.env[key] ?? '';
    if (value.length < 32) {
      report(
        isProduction ? 'fail' : 'warn',
        key,
        `длина ${value.length} — нужна длинная случайная строка`,
      );
    } else if (/test|dev|local|change|secret-not-used/i.test(value)) {
      report('fail', key, 'похоже на значение из разработки — сгенерируйте новое');
    } else {
      report('ok', key, 'задан');
    }
  }

  const mode = process.env.WHATSAPP_MODE ?? 'fallback';
  if (mode === 'cloud_api') {
    const template = process.env.WHATSAPP_LEAD_ALERT_TEMPLATE_NAME;
    const recipients = process.env.WHATSAPP_INTERNAL_RECIPIENTS;
    if (!template || !recipients) {
      report(
        'warn',
        'WhatsApp',
        'режим cloud_api, но шаблон уведомления или получатели не заданы — о новых заявках не сообщат',
      );
    } else {
      report('ok', 'WhatsApp', `cloud_api, шаблон ${template}`);
    }
  } else {
    report('warn', 'WhatsApp', `режим ${mode} — заявки собираются, переписка не синхронизируется`);
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    report('warn', 'Почта', 'не настроена — резервное уведомление о заявке уходить не будет');
  } else {
    report('ok', 'Почта', String(process.env.EMAIL_FROM));
  }

  return env;
}

// --- database ---------------------------------------------------------------

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const client = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    await client`select 1`;
    report('ok', 'База данных', 'соединение установлено');
  } catch (error) {
    report('fail', 'База данных', `недоступна: ${error instanceof Error ? error.message : error}`);
    await client.end({ timeout: 5 }).catch(() => {});
    return;
  }

  try {
    const applied = await client<Array<{ hash: string }>>`
      select hash from drizzle.__drizzle_migrations
    `;
    const missing = journal.entries.length - applied.length;
    if (missing > 0) {
      report(
        'fail',
        'Миграции',
        `применено ${applied.length} из ${journal.entries.length} — выполните npm run db:migrate`,
      );
    } else {
      report('ok', 'Миграции', `все ${journal.entries.length} применены`);
    }
  } catch {
    report('fail', 'Миграции', 'таблица миграций отсутствует — выполните npm run db:migrate');
    await client.end({ timeout: 5 }).catch(() => {});
    return;
  }

  // Seed and owner: not failures before the first deploy, but the two things
  // most often forgotten between "it deployed" and "I can log in".
  try {
    type Counts = {
      documents: number;
      statuses: number;
      settings: number;
      owners: number;
      pending: number;
      placeholders: number;
    };
    const [counts] = await client<Counts[]>`
      select
        (select count(*)::int from documents)      as documents,
        (select count(*)::int from lead_statuses)  as statuses,
        (select count(*)::int from site_settings)  as settings,
        (select count(*)::int from "user" where role = 'owner' and banned = false) as owners,
        (select count(*)::int from site_settings where needs_review)              as pending,
        (select count(*)::int from media_assets where is_placeholder)             as placeholders
    `;

    if (!counts || counts.documents === 0 || counts.statuses === 0) {
      report('warn', 'Наполнение', 'база пуста — выполните npm run db:seed');
    } else {
      report('ok', 'Наполнение', `${counts.documents} страниц, ${counts.statuses} этапов воронки`);
    }

    if (!counts || counts.owners === 0) {
      report('warn', 'Владелец', 'не создан — выполните npm run auth:bootstrap');
    } else {
      report('ok', 'Владелец', `${counts.owners} активн.`);
    }

    if (counts && counts.pending > 0) {
      report(
        'warn',
        'Данные студии',
        `${counts.pending} настроек без значения — заполните в /admin/settings`,
      );
    } else if (counts) {
      report('ok', 'Данные студии', 'все настройки заполнены');
    }

    if (counts && counts.placeholders > 0) {
      report('warn', 'Изображения', `${counts.placeholders} заглушек — их видно посетителям`);
    } else if (counts) {
      report('ok', 'Изображения', 'заглушек нет');
    }
  } catch (error) {
    report(
      'warn',
      'Наполнение',
      `не удалось прочитать: ${error instanceof Error ? error.message : error}`,
    );
  }

  await client.end({ timeout: 5 }).catch(() => {});
}

// --- object storage ---------------------------------------------------------

async function checkStorage() {
  if (process.env.STORAGE_DRIVER === 'local') {
    report(
      isProduction ? 'fail' : 'warn',
      'Хранилище',
      'STORAGE_DRIVER=local — Railway стирает диск контейнера при каждом деплое',
    );
    return;
  }

  let driver: StorageDriver;
  try {
    const { storage } = await import('@/lib/storage');
    driver = storage();
  } catch (error) {
    report('fail', 'Хранилище', String(error instanceof Error ? error.message : error));
    return;
  }

  // A real round trip. Credentials that read but cannot write are the usual
  // failure, and only a write finds them.
  const key = `preflight/${Date.now()}.txt`;
  const body = Buffer.from('preflight');
  let written = false;
  try {
    await driver.put(key, body, { contentType: 'text/plain', visibility: 'public' });
    written = true;
    const read = await driver.get(key);
    if (!read.equals(body)) throw new Error('прочитано не то, что записано');
    report('ok', 'Хранилище', `${driver.kind}: запись и чтение прошли`);
  } catch (error) {
    report('fail', 'Хранилище', String(error instanceof Error ? error.message : error));
  }

  const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!mediaBase) {
    report(
      'fail',
      'NEXT_PUBLIC_MEDIA_BASE_URL',
      'не задан — изображения не получат публичных адресов',
    );
  } else if (mediaBase.endsWith('/')) {
    report('fail', 'NEXT_PUBLIC_MEDIA_BASE_URL', `${mediaBase} — уберите слэш на конце`);
  } else if (written) {
    /**
     * The check the API round trip cannot make.
     *
     * A bucket stays private until public access is switched on, and that
     * switch is separate from the API token. Miss it and everything looks
     * right — uploads succeed, the media library lists them, the admin renders
     * thumbnails through signed URLs — while every photo on the public site is
     * a broken image. The only way to know is to fetch the object the way a
     * visitor would.
     */
    try {
      const response = await fetch(`${mediaBase}/${key}`, { redirect: 'follow' });
      if (!response.ok) {
        report(
          'fail',
          'Публичный доступ',
          `${response.status} на ${mediaBase}/… — включите public access у бакета`,
        );
      } else if (!Buffer.from(await response.arrayBuffer()).equals(body)) {
        report('fail', 'Публичный доступ', `${mediaBase} отдаёт не то содержимое`);
      } else {
        report('ok', 'Публичный доступ', `${mediaBase} отдаёт загруженный файл`);
      }
    } catch (error) {
      report(
        'fail',
        'Публичный доступ',
        `${mediaBase} недоступен: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  if (written) {
    try {
      await driver.delete(key);
    } catch {
      report('warn', 'Хранилище', `пробный файл остался в бакете: ${key}`);
    }
  }
}

// --- run --------------------------------------------------------------------

await checkEnvironment();
await checkDatabase();
await checkStorage();

const ICON: Record<Level, string> = { ok: '  OK  ', warn: ' ЖДЁТ ', fail: 'ОШИБКА' };

console.log('');
for (const line of results) {
  console.log(`[${ICON[line.level]}] ${line.label.padEnd(28)} ${line.detail}`);
}

const failures = results.filter((line) => line.level === 'fail').length;
const warnings = results.filter((line) => line.level === 'warn').length;

console.log('');
if (failures > 0) {
  console.log(`${failures} ошибок и ${warnings} незакрытых пунктов. Деплоить рано.`);
  process.exit(1);
}
console.log(
  warnings > 0
    ? `Готово к деплою. ${warnings} пунктов ждут владельца — сайт заработает и без них.`
    : 'Готово к деплою, всё заполнено.',
);
process.exit(0);
