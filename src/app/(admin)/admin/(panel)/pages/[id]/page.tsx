import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDocumentForEditing, listRevisions } from '@/data/admin/documents';
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
            {document.template}
            <span className="text-ink-faint ml-3 font-sans text-[14px]">
              черновик · версия {document.draftRevisionNumber}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Preview enters draft mode for this document, so the page renders
              the unsaved-to-public draft. Requires an admin session. */}
          <a
            href={`/api/preview?documentId=${document.id}&locale=ru`}
            target="_blank"
            rel="noopener"
            className="text-accent text-[13px] underline underline-offset-2"
          >
            Посмотреть черновик ↗
          </a>
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
        <p className="rounded-[--radius-card] border border-[oklch(0.75_0.15_25)] bg-[oklch(0.97_0.04_25)] px-4 py-3 text-[13px] text-[oklch(0.45_0.15_25)]">
          {document.invalidBlocks} блок(ов) не прошли проверку и не показаны здесь. На сайте они
          тоже не отображаются. Это означает несовпадение данных со схемой — сообщите разработчику,
          не пересохраняйте страницу, иначе они будут потеряны.
        </p>
      ) : null}

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
