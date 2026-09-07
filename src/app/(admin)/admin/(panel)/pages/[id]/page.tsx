import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDocumentForEditing, listRevisions } from '@/data/admin/documents';
import { listPickableAssets } from '@/data/admin/portfolio';
import { AddressEditor } from '@/features/admin/address-editor';
import { pageLabel } from '@/features/admin/page-labels';
import { SeoEditor } from '@/features/admin/seo-editor';
import type { TemplateId } from '@/content/blocks/union';
import { BlockEditor } from '@/features/admin/block-editor';
import { documentPath, localePath } from '@/lib/routes';

export const metadata = { title: 'Редактор страницы' };

export default async function AdminPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const document = await getDocumentForEditing(id);
  if (!document) notFound();

  const [revisions, assets] = await Promise.all([listRevisions(id), listPickableAssets()]);
  const ru = document.locales.find((entry) => entry.locale === 'ru');
  const publishedLocales = document.locales
    .filter((entry) => entry.status === 'published')
    .map((entry) => entry.locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/pages" className="text-ink-faint hover:text-accent text-[13px]">
            ← Страницы
          </Link>
          <h1 className="font-display mt-2 text-[30px] leading-tight">
            {pageLabel(document.seedKey, document.template)}
            <span className="text-ink-faint ml-3 font-sans text-[14px]">
              черновик · версия {document.draftRevisionNumber}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Preview enters draft mode for this document, so the page renders
              the unsaved-to-public draft. Requires an admin session.

              One link per locale, and every locale — including one that has
              never been published, which is exactly when proofreading matters:
              Spanish is the main market, and asking a native speaker to check
              a translation after it is already live is the wrong order. The
              published-only filter that used to sit here was not a policy, it
              was the route's own limitation showing through the interface. */}
          <span className="text-ink-faint text-[13px]">Черновик:</span>
          {document.locales.map((entry) => (
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
          {ru && ru.status === 'published' ? (
            <Link
              href={localePath('ru', documentPath(document.kind, ru.slug, 'raboty'))}
              target="_blank"
              rel="noopener"
              className="text-ink-faint hover:text-accent text-[13px]"
            >
              Открыть опубликованную ↗
            </Link>
          ) : null}
        </div>
      </div>

      {document.invalidBlocks > 0 ? (
        <p className="border-danger-line bg-danger-surface text-danger-ink rounded-[--radius-card] border px-4 py-3 text-[13px]">
          {document.invalidBlocks} блок(ов) не прошли проверку и не показаны здесь. На сайте они
          тоже не отображаются. Это означает несовпадение данных со схемой — сообщите разработчику,
          не пересохраняйте страницу, иначе они будут потеряны.
        </p>
      ) : null}

      <SeoEditor documentId={document.id} initial={document.meta.seo ?? {}} />

      <AddressEditor
        documentId={document.id}
        locales={document.locales.map((entry) => ({
          locale: entry.locale,
          slug: entry.slug,
          status: entry.status,
        }))}
      />

      <BlockEditor
        template={document.template as TemplateId}
        isSystem={document.isSystem}
        documentId={document.id}
        initialBlocks={document.blocks}
        publishedLocales={publishedLocales}
        assets={assets}
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
