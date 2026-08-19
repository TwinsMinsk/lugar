import Link from 'next/link';

import { listDocuments, type AdminDocumentSummary } from '@/data/admin/documents';
import { DocumentRemoval } from '@/features/admin/document-removal';
import { LOCALES } from '@/i18n/routing';

export const metadata = { title: 'Страницы' };

const STATUS_LABEL: Record<string, string> = {
  published: 'опубликовано',
  draft: 'черновик',
  archived: 'снято',
};

export default async function AdminPagesList() {
  const [pages, archived] = await Promise.all([
    listDocuments('page'),
    listDocuments('page', { archived: true }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Страницы</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Каждая страница собрана из блоков. Правки сохраняются в черновик и попадают на сайт только
          после публикации — отдельно для каждого языка.
        </p>
      </div>

      <PageTable pages={pages} caption="Страницы" archived={false} />

      {archived.length > 0 ? (
        <section>
          <h2 className="font-display mb-2 text-[19px]">Убранные страницы</h2>
          <p className="text-ink-faint mb-3 max-w-[70ch] text-[13px]">
            Убранная страница не показывается на сайте и не занимает место в рабочем списке. Её
            можно вернуть. Постоянные страницы сайта убрать нельзя — их можно только снять с сайта.
          </p>
          <PageTable pages={archived} caption="Убранные страницы" archived />
        </section>
      ) : null}
    </div>
  );
}

function PageTable({
  pages,
  caption,
  archived,
}: {
  pages: AdminDocumentSummary[];
  caption: string;
  archived: boolean;
}) {
  return (
    <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
      <table className="w-full min-w-[760px] text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Страница</th>
            <th className="px-4 py-3 font-medium">Адрес (ru)</th>
            {LOCALES.map((locale) => (
              <th key={locale} className="px-4 py-3 font-medium">
                {locale}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium">Действия</th>
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
                <td className="text-ink-soft px-4 py-3 font-mono text-[13px]">/{ru?.slug ?? ''}</td>
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
                <td className="px-4 py-3">
                  <DocumentRemoval
                    documentId={page.id}
                    kind="page"
                    isSystem={page.isSystem}
                    archived={archived}
                    everPublished={page.everPublished}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
