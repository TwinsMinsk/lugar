/**
 * Removes portfolio projects created by the end-to-end suite.
 *
 * Development only. Projects are archived rather than deleted in the
 * application, deliberately — revisions and media usage rows are what make
 * rollback work. This script hard-deletes, so it matches only the slug shapes
 * the specs generate and refuses to run against a database that is not local.
 */
import './load-env';

import { inArray, like, or } from 'drizzle-orm';

import { db, pgClient } from '../src/db/client';
import { documentLocales, documents, invitation, user } from '../src/db/schema';

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
  // orphans behind.
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

try {
  await main();
  await cleanTestUsers();
} catch (error) {
  console.error('Cleanup failed:', error);
  process.exitCode = 1;
} finally {
  await pgClient.end({ timeout: 5 });
}
