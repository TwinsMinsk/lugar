'use server';

import { randomUUID } from 'node:crypto';

import { and, eq, isNotNull } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import type { AnyBlock } from '@/content/blocks/union';
import { tags } from '@/data/cache-tags';
import { db } from '@/db/client';
import {
  documentLocales,
  documentRevisions,
  documents,
  portfolioProjectCategories,
  portfolioProjects,
} from '@/db/schema';
import { LOCALES, type Locale } from '@/i18n/routing';
import { recordAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Portfolio projects.
 *
 * A project is an ordinary `documents` row (kind='project'), so it inherits the
 * same locale slugs, revisions, draft/publish and rollback machinery as any
 * page — there is no second publishing system to keep in step. The
 * `portfolio_projects` table only holds the fields the index needs to *query*
 * on (cover, category, featured, order), which would be unusable buried in
 * block JSONB.
 *
 * Note on redirects: `redirect()` throws a control-flow exception, so it must
 * never sit inside these try/catch blocks — the catch would swallow it and
 * report a failure that did not happen. These actions return the id and let the
 * caller navigate.
 */

export type PortfolioResult = { ok: true; documentId?: string } | { ok: false; error: string };

async function requestContext() {
  const headerList = await headers();
  return {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(96).regex(slugPattern, 'slug_format'),
  city: z.string().trim().max(120).optional(),
  categorySlugs: z.array(z.string().max(48)).max(8).optional(),
});

/**
 * Create a project.
 *
 * Starts from a real block skeleton — heading, gallery, related work, contact —
 * rather than an empty page, because an empty editor gives the owner nothing to
 * react to and invites a project published with no photographs at all.
 *
 * Created unpublished in every locale. Nothing reaches the site until the owner
 * publishes it deliberately.
 */
export async function createProject(input: z.input<typeof createSchema>): Promise<PortfolioResult> {
  const { user } = await requireCapability('content.write');

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message === 'slug_format' ? 'slug_format' : 'invalid_input' };
  }
  const { title, slug, city, categorySlugs } = parsed.data;

  // Checked before the insert rather than inferred from the unique-index
  // violation below: an archived project is out of the list, so "this address
  // is taken" would otherwise send the owner searching a list that cannot
  // contain the culprit.
  const [archivedHolder] = await db
    .select({ id: documents.id })
    .from(documentLocales)
    .innerJoin(documents, eq(documents.id, documentLocales.documentId))
    .where(
      and(
        eq(documentLocales.kind, 'project'),
        eq(documentLocales.slug, slug),
        isNotNull(documents.archivedAt),
      ),
    )
    .limit(1);
  if (archivedHolder) return { ok: false, error: 'slug_taken_archived' };

  const documentId = randomUUID();
  const draftRevisionId = randomUUID();
  const context = await requestContext();

  const starterBlocks: AnyBlock[] = [
    {
      id: randomUUID(),
      type: 'hero',
      hidden: false,
      data: { variant: 'text', heading: { ru: title }, overlay: 'none' },
    },
    {
      id: randomUUID(),
      type: 'portfolio_gallery',
      hidden: false,
      data: { items: [], layout: 'grid', columns: 2 },
    },
    {
      id: randomUUID(),
      type: 'portfolio_teaser',
      hidden: false,
      data: {
        heading: { ru: 'Похожие работы', es: 'Proyectos relacionados', en: 'Related projects' },
        source: { mode: 'latest', limit: 3 },
        aspect: '4/5',
        columns: 3,
      },
    },
  ] as AnyBlock[];

  try {
    await db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        kind: 'project',
        template: 'project',
        baseSlug: slug,
        isSystem: false,
        draftRevisionId,
      });

      await tx.insert(documentRevisions).values({
        id: draftRevisionId,
        documentId,
        revisionNumber: 1,
        isDraft: true,
        blocks: starterBlocks,
        // The listing reads its title from here, so a rollback restores the
        // card title together with the page rather than leaving them apart.
        meta: { title: { ru: title }, seo: { ru: { title } } },
        createdBy: user.id,
      });

      await tx.insert(documentLocales).values(
        LOCALES.map((locale) => ({
          documentId,
          locale,
          kind: 'project' as const,
          slug,
          status: 'draft' as const,
        })),
      );

      await tx.insert(portfolioProjects).values({
        documentId,
        city: city ?? null,
        sortOrder: 0,
      });

      if (categorySlugs && categorySlugs.length > 0) {
        const { portfolioCategories } = await import('@/db/schema');
        const rows = await tx.select().from(portfolioCategories);
        const byslug = new Map(rows.map((row) => [row.slug, row.id]));
        const links = categorySlugs
          .map((categorySlug) => byslug.get(categorySlug))
          .filter((id): id is string => Boolean(id))
          .map((categoryId) => ({ documentId, categoryId }));
        if (links.length > 0) {
          await tx.insert(portfolioProjectCategories).values(links).onConflictDoNothing();
        }
      }

      await recordAudit(
        {
          actorUserId: user.id,
          action: 'portfolio.created',
          entityType: 'document',
          entityId: documentId,
          after: { slug, title },
          ...context,
        },
        tx,
      );
    });
  } catch {
    // The unique index on (kind, locale, slug) is what rejects a collision.
    return { ok: false, error: 'slug_taken' };
  }

  for (const locale of LOCALES) updateTag(tags.projectsIndex(locale));
  return { ok: true, documentId };
}

const metaSchema = z.object({
  documentId: z.uuid(),
  coverAssetId: z.uuid().nullable().optional(),
  primaryCategoryId: z.uuid().nullable().optional(),
  categoryIds: z.array(z.uuid()).max(8).optional(),
  city: z.string().trim().max(120).nullable().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/** Update the queryable project fields the portfolio index sorts and filters on. */
export async function updateProjectMeta(
  input: z.input<typeof metaSchema>,
): Promise<PortfolioResult> {
  const { user } = await requireCapability('content.write');

  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { documentId, categoryIds, ...fields } = parsed.data;

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(portfolioProjects)
      .set({
        ...(fields.coverAssetId !== undefined ? { coverAssetId: fields.coverAssetId } : {}),
        ...(fields.primaryCategoryId !== undefined
          ? { primaryCategoryId: fields.primaryCategoryId }
          : {}),
        ...(fields.city !== undefined ? { city: fields.city } : {}),
        ...(fields.isFeatured !== undefined ? { isFeatured: fields.isFeatured } : {}),
        ...(fields.sortOrder !== undefined ? { sortOrder: fields.sortOrder } : {}),
      })
      .where(eq(portfolioProjects.documentId, documentId));

    if (categoryIds) {
      // Replace wholesale: the form submits the complete set, so a diff would
      // only add a way for the two to disagree.
      await tx
        .delete(portfolioProjectCategories)
        .where(eq(portfolioProjectCategories.documentId, documentId));
      if (categoryIds.length > 0) {
        await tx
          .insert(portfolioProjectCategories)
          .values(categoryIds.map((categoryId) => ({ documentId, categoryId })))
          .onConflictDoNothing();
      }
    }

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'portfolio.meta_updated',
        entityType: 'document',
        entityId: documentId,
        after: { ...fields, categoryCount: categoryIds?.length },
        ...context,
      },
      tx,
    );
  });

  for (const locale of LOCALES) {
    updateTag(tags.projectsIndex(locale));
    updateTag(tags.document(documentId, locale));
  }
  return { ok: true };
}

/**
 * Archive a project in every locale.
 *
 * Archive rather than delete: the revisions, the media usage rows and the
 * project's history stay intact, so an accidental removal is one click to undo
 * and a rollback still renders. Nothing about a portfolio justifies destroying
 * records.
 */
export async function archiveProject(documentId: string): Promise<PortfolioResult> {
  const { user } = await requireCapability('content.publish');
  if (!z.uuid().safeParse(documentId).success) return { ok: false, error: 'invalid_input' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const locale of LOCALES) {
      await tx
        .update(documentLocales)
        .set({ status: 'archived' })
        .where(
          and(
            eq(documentLocales.documentId, documentId),
            eq(documentLocales.locale, locale as Locale),
          ),
        );
    }

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'portfolio.archived',
        entityType: 'document',
        entityId: documentId,
        ...context,
      },
      tx,
    );
  });

  for (const locale of LOCALES) {
    updateTag(tags.projectsIndex(locale));
    updateTag(tags.document(documentId, locale));
  }
  return { ok: true };
}
