import Link from 'next/link';

import { listDocuments } from '@/data/admin/documents';
import { listCategoriesForAdmin } from '@/data/admin/portfolio';
import { t } from '@/content/i18n';
import { CreateProjectForm } from '@/features/admin/portfolio-forms';
import { LOCALES } from '@/i18n/routing';

export const metadata = { title: 'Портфолио' };

const STATUS_LABEL: Record<string, string> = {
  published: 'на сайте',
  draft: 'черновик',
  archived: 'снят',
};

export default async function AdminPortfolioList() {
  const [projects, categories] = await Promise.all([
    listDocuments('project'),
    listCategoriesForAdmin(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Портфолио</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Раздел «Наши работы» собирается из этих проектов. Пока ни одного опубликованного нет, на
          сайте показывается честная заглушка вместо пустой сетки.
        </p>
      </div>

      <CreateProjectForm
        categories={categories.map((category) => ({
          id: category.id,
          slug: category.slug,
          label: t(category.label, 'ru') ?? category.slug,
        }))}
      />

      {projects.length === 0 ? (
        <p className="text-ink-soft text-[14px]">Проектов пока нет.</p>
      ) : (
        <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Проект</th>
                <th className="px-4 py-3 font-medium">Адрес</th>
                {LOCALES.map((locale) => (
                  <th key={locale} className="px-4 py-3 font-medium">
                    {locale}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {projects.map((project) => {
                const ru = project.locales.find((entry) => entry.locale === 'ru');
                return (
                  <tr key={project.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/portfolio/${project.id}`}
                        className="text-ink hover:text-accent font-medium"
                      >
                        {ru?.slug ?? project.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="text-ink-soft px-4 py-3 font-mono text-[13px]">
                      /raboty/{ru?.slug ?? ''}
                    </td>
                    {LOCALES.map((locale) => {
                      const entry = project.locales.find((item) => item.locale === locale);
                      return (
                        <td key={locale} className="text-ink-soft px-4 py-3 text-[13px]">
                          {STATUS_LABEL[entry?.status ?? 'draft']}
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
      )}
    </div>
  );
}
