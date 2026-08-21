import Link from 'next/link';
import { notFound } from 'next/navigation';

import { t } from '@/content/i18n';
import { getDocumentForEditing, listRevisions } from '@/data/admin/documents';
import { getProjectMeta, listCategoriesForAdmin, listPickableAssets } from '@/data/admin/portfolio';
import { AddressEditor } from '@/features/admin/address-editor';
import { SeoEditor } from '@/features/admin/seo-editor';
import { BlockEditor } from '@/features/admin/block-editor';
import { ProjectMetaForm } from '@/features/admin/portfolio-forms';

export const metadata = { title: 'Проект' };

export default async function AdminProjectEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const document = await getDocumentForEditing(id);
  if (!document || document.kind !== 'project') notFound();

  const [meta, revisions, assets, categories] = await Promise.all([
    getProjectMeta(id),
    listRevisions(id),
    listPickableAssets(),
    listCategoriesForAdmin(),
  ]);
  if (!meta) notFound();

  const ru = document.locales.find((entry) => entry.locale === 'ru');
  const publishedLocales = document.locales
    .filter((entry) => entry.status === 'published')
    .map((entry) => entry.locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/portfolio" className="text-ink-faint hover:text-accent text-[13px]">
            ← Наши работы
          </Link>
          <h1 className="font-display mt-2 text-[30px] leading-tight">
            /raboty/{ru?.slug ?? ''}
            <span className="text-ink-faint ml-3 font-sans text-[14px]">
              черновик · версия {document.draftRevisionNumber}
            </span>
          </h1>
        </div>

        {/* One link per published locale — see the pages editor for why. */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink-faint text-[13px]">Черновик:</span>
          {document.locales
            .filter((entry) => entry.status === 'published')
            .map((entry) => (
              <a
                key={entry.locale}
                href={`/api/preview?documentId=${document.id}&locale=${entry.locale}`}
                target="_blank"
                rel="noopener"
                className="text-accent text-[13px] uppercase underline underline-offset-2"
              >
                {entry.locale} ↗
              </a>
            ))}
          {document.locales.every((entry) => entry.status !== 'published') ? (
            <span className="text-ink-faint text-[13px]">появится после первой публикации</span>
          ) : null}
        </div>
      </div>

      <ProjectMetaForm
        documentId={document.id}
        assets={assets}
        categories={categories.map((category) => ({
          id: category.id,
          label: t(category.label, 'ru') ?? category.slug,
        }))}
        initial={{
          coverAssetId: meta.coverAssetId,
          categoryIds: meta.categoryIds,
          city: meta.city,
          isFeatured: meta.isFeatured,
          sortOrder: meta.sortOrder,
        }}
      />

      <SeoEditor documentId={document.id} initial={document.meta.seo ?? {}} />

      <AddressEditor
        documentId={document.id}
        locales={document.locales.map((entry) => ({
          locale: entry.locale,
          slug: entry.slug,
          status: entry.status,
        }))}
        prefix="raboty/"
      />

      <BlockEditor
        assets={assets}
        documentId={document.id}
        initialBlocks={document.blocks}
        publishedLocales={publishedLocales}
        revisions={revisions.map((revision) => ({
          id: revision.id,
          revisionNumber: revision.revisionNumber,
          isDraft: revision.isDraft,
          createdAt: revision.createdAt.toISOString(),
          authorName: revision.authorName,
          liveFor: revision.liveFor,
        }))}
      />
    </div>
  );
}
