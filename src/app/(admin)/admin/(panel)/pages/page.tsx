import Link from 'next/link';

import { listDocuments } from '@/data/admin/documents';
import { LOCALES } from '@/i18n/routing';

export const metadata = { title: 'Страницы' };

const STATUS_LABEL: Record<string, string> = {
  published: 'опубликовано',
  draft: 'черновик',
  archived: 'снято',
};

export default async function AdminPagesList() {
  const pages = await listDocuments('page');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Страницы</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Каждая страница собрана из блоков. Правки сохраняются в черновик и попадают на сайт только
          после публикации — отдельно для каждого языка.
        </p>
      </div>

      <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Страница</th>
              <th className="px-4 py-3 font-medium">Адрес (ru)</th>
              {LOCALES.map((locale) => (
                <th key={locale} className="px-4 py-3 font-medium">
                  {locale}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {pages.map((page) => {
              const ru = page.locales.find((entry) => entry.locale === 'ru');
              return (
                <tr key={page.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/pages/${page.id}`}
                      className="text-ink hover:text-accent font-medium"
                    >
                      {page.seedKey?.replace('page.', '') ?? page.template}
                    </Link>
                    {page.isSystem ? (
                      <span className="text-ink-faint ml-2 text-[11px]">системная</span>
                    ) : null}
                  </td>
                  <td className="text-ink-soft px-4 py-3 font-mono text-[13px]">
                    /{ru?.slug ?? ''}
                  </td>
                  {LOCALES.map((locale) => {
                    const entry = page.locales.find((item) => item.locale === locale);
                    return (
                      <td key={locale} className="px-4 py-3">
                        <span className="text-ink-soft text-[13px]">
                          {STATUS_LABEL[entry?.status ?? 'draft']}
                        </span>
                        {entry?.hasUnpublishedChanges ? (
                          <span
                            title="Есть неопубликованные правки"
                            className="ml-1.5 inline-block rounded-full bg-[oklch(0.75_0.13_85)] px-1.5 text-[10px] text-white"
                          >
                            •
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
