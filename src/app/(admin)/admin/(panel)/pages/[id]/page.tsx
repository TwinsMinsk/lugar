import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDocumentForEditing, listRevisions } from '@/data/admin/documents';
import { AddressEditor } from '@/features/admin/address-editor';
import { pageLabel } from '@/features/admin/page-labels';
import { SeoEditor } from '@/features/admin/seo-editor';
import { BlockEditor } from '@/features/admin/block-editor';
import { documentPath, localePath } from '@/lib/routes';

export const metadata = { title: 'Редактор страницы' };

export default async function AdminPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const document = await getDocumentForEditing(id);
  if (!document) notFound();

  const revisions = await listRevisions(id);
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

              One link per locale, not just Russian: Spanish is the main market
              and a native speaker proofreading it is what stands between a
              draft and the launch. The route always accepted any locale — only
              this link was hardwired. Offered only where the locale has been
              published, because that is the condition the route resolves on. */}
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
