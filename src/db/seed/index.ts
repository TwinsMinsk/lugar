/**
 * Database seed.
 *
 * Idempotent by construction: every insert is keyed on a stable natural key and
 * uses ON CONFLICT DO NOTHING, so re-running after launch can never clobber the
 * owner's edits. Re-run it freely.
 *
 *   npm run db:seed
 *
 * M1 seeds configuration and taxonomy. Page documents, content blocks and the
 * placeholder media library are seeded in M2, once the block registry exists.
 */
import '../../../scripts/load-env';

import { db, pgClient } from '../client';
import { leadStatuses, portfolioCategories, serviceCategories, siteSettings } from '../schema';
import { LEAD_STATUSES, PORTFOLIO_CATEGORIES, SERVICE_CATEGORIES, SITE_SETTINGS } from './taxonomy';

async function seedLeadStatuses() {
  const rows = LEAD_STATUSES.map((s) => ({
    slug: s.slug,
    sortOrder: s.sortOrder,
    label: s.label,
    color: s.color,
    isDefaultEntry: s.isDefaultEntry ?? false,
    isWon: s.isWon ?? false,
    isLost: s.isLost ?? false,
    isTerminal: s.isTerminal ?? false,
  }));
  const inserted = await db
    .insert(leadStatuses)
    .values(rows)
    .onConflictDoNothing({ target: leadStatuses.slug })
    .returning({ slug: leadStatuses.slug });
  return inserted.length;
}

async function seedPortfolioCategories() {
  const inserted = await db
    .insert(portfolioCategories)
    .values(
      PORTFOLIO_CATEGORIES.map((c) => ({
        slug: c.slug,
        sortOrder: c.sortOrder,
        label: c.label,
        filterSlug: c.filterSlug,
      })),
    )
    .onConflictDoNothing({ target: portfolioCategories.slug })
    .returning({ slug: portfolioCategories.slug });
  return inserted.length;
}

async function seedServiceCategories() {
  const inserted = await db
    .insert(serviceCategories)
    .values(
      SERVICE_CATEGORIES.map((c) => ({
        slug: c.slug,
        direction: c.direction,
        sortOrder: c.sortOrder,
        label: c.label,
        note: c.note ?? null,
      })),
    )
    .onConflictDoNothing({ target: serviceCategories.slug })
    .returning({ slug: serviceCategories.slug });
  return inserted.length;
}

async function seedSiteSettings() {
  const inserted = await db
    .insert(siteSettings)
    .values(
      SITE_SETTINGS.map((s) => ({
        key: s.key,
        group: s.group,
        value: s.value,
        needsReview: s.needsReview,
        description: s.description,
      })),
    )
    .onConflictDoNothing({ target: siteSettings.key })
    .returning({ key: siteSettings.key });
  return inserted.length;
}

async function main() {
  const statuses = await seedLeadStatuses();
  const portfolio = await seedPortfolioCategories();
  const services = await seedServiceCategories();
  const settings = await seedSiteSettings();

  const pending = SITE_SETTINGS.filter((s) => s.needsReview).length;

  console.log('\n  Seed complete (new rows this run):\n');
  console.log(`    lead_statuses         ${statuses}/${LEAD_STATUSES.length}`);
  console.log(`    portfolio_categories  ${portfolio}/${PORTFOLIO_CATEGORIES.length}`);
  console.log(`    service_categories    ${services}/${SERVICE_CATEGORIES.length}`);
  console.log(`    site_settings         ${settings}/${SITE_SETTINGS.length}`);
  console.log(`\n  ${pending} settings are flagged needs_review — the owner must supply real`);
  console.log(
    '  values (social URLs, address, legal details, logo, analytics IDs) before launch.\n',
  );
}

try {
  await main();
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await pgClient.end({ timeout: 5 });
}
