/**
 * Put the current legal drafts into a database that already has content.
 *
 * The seed cannot do this. It is `ON CONFLICT DO NOTHING` by design — re-running
 * it must never clobber the owner's edits — so a revised policy reaches a
 * running site only through something that deliberately overwrites, and this is
 * that something, kept narrow enough to be safe: it touches the two legal
 * documents and nothing else.
 *
 * It writes the **draft** and stops. Publishing legal text is a decision a
 * person makes after reading it, and often after a lawyer has read it, so the
 * script leaves the site exactly as it was and the owner publishes from the
 * panel — where the preview link now works for unpublished locales too.
 *
 *   npm run legal:apply            # show what would change
 *   npm run legal:apply -- --write # write the drafts
 *
 * Aimed at whichever database DATABASE_URL points to, so running it against
 * production is a matter of the environment, not of a flag.
 */
import './load-env';

import { eq } from 'drizzle-orm';

import { anyBlockSchema } from '../src/content/blocks/union';
import { LEGAL_PLACEHOLDERS, LEGAL_TEXTS } from '../src/content/legal';
import { db, pgClient } from '../src/db/client';
import { documentRevisions, documents } from '../src/db/schema';
import { DOCUMENT_IDS } from '../src/db/seed/content';

const write = process.argv.includes('--write');

const TARGETS = [
  {
    documentId: DOCUMENT_IDS.PRIVACY,
    key: 'privacy' as const,
    label: 'Политика конфиденциальности',
  },
  { documentId: DOCUMENT_IDS.COOKIES, key: 'cookies' as const, label: 'Файлы cookie' },
];

async function main() {
  let changed = 0;

  for (const target of TARGETS) {
    const [document] = await db
      .select({ id: documents.id, draftRevisionId: documents.draftRevisionId })
      .from(documents)
      .where(eq(documents.id, target.documentId))
      .limit(1);

    if (!document?.draftRevisionId) {
      console.log(`— ${target.label}: документа нет в этой базе, пропускаю`);
      continue;
    }

    const [revision] = await db
      .select({ id: documentRevisions.id, blocks: documentRevisions.blocks })
      .from(documentRevisions)
      .where(eq(documentRevisions.id, document.draftRevisionId))
      .limit(1);
    if (!revision) {
      console.log(`— ${target.label}: черновая версия не найдена, пропускаю`);
      continue;
    }

    const blocks = (revision.blocks as unknown[]).map((block) => {
      const parsed = block as { type?: string; data?: Record<string, unknown> };
      if (parsed.type !== 'legal_rich_text') return block;
      return {
        ...parsed,
        data: {
          ...parsed.data,
          heading: LEGAL_TEXTS[target.key].heading,
          content: LEGAL_TEXTS[target.key].content,
        },
      };
    });

    // Validated before writing, with the same schema `saveDraft` uses: a block
    // list that fails validation is not saved by the panel either, and finding
    // that out here is better than finding it out when the owner presses save.
    for (const block of blocks) {
      const parsed = anyBlockSchema.safeParse(block);
      if (!parsed.success) {
        console.error(`✗ ${target.label}: блок не прошёл проверку`);
        console.error(JSON.stringify(parsed.error.issues.slice(0, 3), null, 2));
        process.exitCode = 1;
        return;
      }
    }

    if (JSON.stringify(blocks) === JSON.stringify(revision.blocks)) {
      console.log(`= ${target.label}: черновик уже совпадает с текущим текстом`);
      continue;
    }

    changed += 1;
    if (write) {
      await db
        .update(documentRevisions)
        .set({ blocks: blocks as never })
        .where(eq(documentRevisions.id, revision.id));
      console.log(`✓ ${target.label}: черновик обновлён`);
    } else {
      console.log(`~ ${target.label}: черновик отличается и будет обновлён с --write`);
    }
  }

  console.log('');
  console.log(
    `Осталось заполнить в тексте: ${LEGAL_PLACEHOLDERS.join(', ')} — и сроки хранения в квадратных скобках.`,
  );
  if (changed > 0 && write) {
    console.log(
      'Ничего не опубликовано. Откройте страницы в панели, проверьте и опубликуйте сами.',
    );
  }
}

await main();
await pgClient.end();
