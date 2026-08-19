/**
 * Removes the rows the end-to-end suite creates.
 *
 * Development only. Projects are archived rather than deleted in the
 * application, deliberately — revisions and media usage rows are what make
 * rollback work. This script hard-deletes, so it matches only the slug shapes
 * the specs generate and refuses to run against a database that is not local.
 */
import './load-env';

import { inArray, like, or } from 'drizzle-orm';

import { db, pgClient } from '../src/db/client';
import {
  contacts,
  documentLocales,
  documents,
  formSubmissions,
  invitation,
  leadStatuses,
  leads,
  user,
} from '../src/db/schema';

const TEST_SLUG_PATTERNS = ['test-proekt-%', 'dubl-%', 'opublikovannyy-%'];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error('Refusing to run: DATABASE_URL does not point at a local database.');
    process.exit(1);
  }

  const matches = await db
    .selectDistinct({ id: documentLocales.documentId })
    .from(documentLocales)
    .where(or(...TEST_SLUG_PATTERNS.map((pattern) => like(documentLocales.slug, pattern))));

  const ids = matches.map((row) => row.id);
  if (ids.length === 0) {
    console.log('No test projects found.');
    return;
  }

  // Locales and revisions cascade from documents; media_usage cascades from
  // revisions. Deleting the document is therefore sufficient and leaves no
  // orphans behind — but only after the published pointer is cleared.
  // `document_locales.published_revision_id` restricts deletion of a revision,
  // and the two cascades fire in an order Postgres does not promise, so a
  // published test project would otherwise fail here at random.
  await db
    .update(documentLocales)
    .set({ publishedRevisionId: null })
    .where(inArray(documentLocales.documentId, ids));
  await db.delete(documents).where(inArray(documents.id, ids));
  console.log(`Removed ${ids.length} test project(s).`);
}

/** Accounts the invitation specs create, which use a reserved test domain. */
async function cleanTestUsers() {
  const invitations = await db
    .delete(invitation)
    .where(like(invitation.email, '%@example.test'))
    .returning({ id: invitation.id });
  const users = await db
    .delete(user)
    .where(like(user.email, '%@example.test'))
    .returning({ id: user.id });
  if (users.length || invitations.length) {
    console.log(`Removed ${users.length} test user(s) and ${invitations.length} invitation(s).`);
  }
}

/**
 * Leads the suite submits through the public form.
 *
 * Matched on the contact name the specs generate, never on a phone prefix: a
 * real Spanish mobile could plausibly share any prefix a test picked, and this
 * script hard-deletes.
 */
async function cleanTestLeads() {
  const matches = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(like(contacts.fullName, 'E2E %'));

  const contactIds = matches.map((row) => row.id);
  if (contactIds.length === 0) return;

  // form_submissions references leads without a cascade, so it goes first.
  const removed = await db
    .delete(leads)
    .where(inArray(leads.contactId, contactIds))
    .returning({ id: leads.id });

  await db.delete(formSubmissions).where(inArray(formSubmissions.contactId, contactIds));
  await db.delete(contacts).where(inArray(contacts.id, contactIds));

  console.log(`Removed ${removed.length} test lead(s) and ${contactIds.length} contact(s).`);
}

/**
 * Pipeline stages the suite creates.
 *
 * Runs after the leads, because `leads.status_id` is a restricted foreign key:
 * a stage still referenced by any lead — including one the application would
 * only ever archive — cannot be deleted.
 */
async function cleanTestStages() {
  const removed = await db
    .delete(leadStatuses)
    .where(like(leadStatuses.slug, 'e2e-%'))
    .returning({ id: leadStatuses.id });
  if (removed.length > 0) console.log(`Removed ${removed.length} test pipeline stage(s).`);
}

try {
  await main();
  await cleanTestUsers();
  await cleanTestLeads();
  await cleanTestStages();
} catch (error) {
  console.error('Cleanup failed:', error);
  process.exitCode = 1;
} finally {
  await pgClient.end({ timeout: 5 });
}
