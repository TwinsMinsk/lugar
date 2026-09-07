import Link from 'next/link';

import { listDocuments, type AdminDocumentSummary } from '@/data/admin/documents';
import {
  listCategoriesForAdmin,
  listProjectCards,
  type AdminProjectCard,
} from '@/data/admin/portfolio';
import { t } from '@/content/i18n';
import { DocumentRemoval } from '@/features/admin/document-removal';
import { CreateProjectForm } from '@/features/admin/portfolio-forms';
import { LOCALES } from '@/i18n/routing';
import { can } from '@/lib/auth/guards';

export const metadata = { title: 'Наши работы' };

const STATUS_LABEL: Record<string, string> = {
  published: 'на сайте',
  draft: 'черновик',
  archived: 'снят',
};

export default async function AdminPortfolioList() {
  // Asked once here rather than inside the table: the removal controls are
  // owner-only (`content.delete`), and rendering them for an editor who will
  // be refused by the server is the trapdoor this closes.
  const canRemove = await can('content.delete');

  const [projects, archived, categories, cards] = await Promise.all([
    listDocuments('project'),
    listDocuments('project', { archived: true }),
    listCategoriesForAdmin(),
    listProjectCards(),
  ]);

  const publishedCount = projects.filter((project) =>
    project.locales.some((entry) => entry.status === 'published'),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Наши работы</h1>
        <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
          Раздел «Наши работы» собирается из этих проектов.{' '}
          {publishedCount === 0
            ? 'Опубликованных пока нет, поэтому на сайте показывается честная заглушка вместо пустой сетки.'
            : `На сайте показывается ${publishedCount} ${publishedCount === 1 ? 'проект' : 'проектов'}.`}
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
        <ProjectTable
          projects={projects}
          cards={cards}
          caption="Проекты"
          archived={false}
          canRemove={canRemove}
        />
      )}

      {archived.length > 0 ? (
        <section>
          <h2 className="font-display mb-2 text-[19px]">Убранные проекты</h2>
          <p className="text-ink-faint mb-3 max-w-[70ch] text-[13px]">
            Убранный проект не показывается на сайте и не занимает место в рабочем списке, но
            остаётся в базе. Его можно вернуть. Насовсем удаляются только те, что никогда не были
            опубликованы.
          </p>
          <ProjectTable
            projects={archived}
            cards={cards}
            caption="Убранные проекты"
            archived
            canRemove={canRemove}
          />
        </section>
      ) : null}
    </div>
  );
}

function ProjectTable({
  projects,
  cards,
  caption,
  archived,
  canRemove,
}: {
  projects: AdminDocumentSummary[];
  cards: Map<string, AdminProjectCard>;
  caption: string;
  archived: boolean;
  /**
   * Whether this reader may remove anything at all. When they may not, the
   * column goes with the buttons: all three controls behind it are owner-only,
   * so leaving the header over empty cells would explain nothing and take
   * space on a table that already scrolls sideways.
   */
  canRemove: boolean;
}) {
  return (
    <div className="border-line bg-surface overflow-x-auto rounded-[--radius-card] border">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-line text-ink-faint border-b text-[12px] tracking-wide uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">
              <span className="sr-only">Обложка</span>
            </th>
            <th className="px-4 py-3 font-medium">Проект</th>
            <th className="px-4 py-3 font-medium">Адрес</th>
            {LOCALES.map((locale) => (
              <th key={locale} className="px-4 py-3 font-medium">
                {locale}
              </th>
            ))}
            {canRemove ? <th className="px-4 py-3 text-right font-medium">Действия</th> : null}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {projects.map((project) => {
            const ru = project.locales.find((entry) => entry.locale === 'ru');
            const card = cards.get(project.id);
            return (
              <tr key={project.id}>
                {/* A list of работ without pictures is wrong for a furniture
                    studio by its nature — the slug told the owner nothing about
                    which project a row was. */}
                <td className="py-2 pr-0 pl-4">
                  <div className="bg-slot h-11 w-16 overflow-hidden rounded-[--radius-btn]">
                    {card?.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-ink-ghost flex h-full w-full items-center justify-center text-[10px]">
                        нет
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/portfolio/${project.id}`}
                    className="text-ink hover:text-accent font-medium"
                  >
                    {card?.title ?? ru?.slug ?? project.id.slice(0, 8)}
                  </Link>
                  {card?.city ? (
                    <div className="text-ink-faint text-[12px]">{card.city}</div>
                  ) : null}
                  {card?.isFeatured ? (
                    <span className="text-ink-faint text-[11px]">избранный</span>
                  ) : null}
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
                {canRemove ? (
                  <td className="px-4 py-3">
                    <DocumentRemoval
                      documentId={project.id}
                      kind="project"
                      isSystem={project.isSystem}
                      archived={archived}
                      everPublished={project.everPublished}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
