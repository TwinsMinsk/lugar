/**
 * One-time bootstrap of the first `owner` account.
 *
 * Deliberately a CLI script and not an HTTP route: a setup endpoint is a
 * permanent piece of public attack surface that has to be defended forever,
 * whereas this has no network surface at all. It also refuses to run once any
 * owner exists, so re-running it can never mint a second administrator.
 *
 *   npm run auth:bootstrap
 *
 * Prints a generated password once. The owner signs in and changes it, then
 * invites everyone else from /admin — there is no public sign-up.
 */
import './load-env';

import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { db } from '../src/db/client';
import { user } from '../src/db/schema/auth';
import { auth } from '../src/lib/auth/server';

function generatePassword(): string {
  // Ambiguous glyphs removed so the password survives being read off a screen.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  const bytes = randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  const email = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.error('INITIAL_OWNER_EMAIL is not set. Add it to .env.local and retry.');
    process.exit(1);
  }

  const existingOwners = await db.select({ id: user.id }).from(user).where(eq(user.role, 'owner'));
  if (existingOwners.length > 0) {
    console.error(
      `Refusing to run: ${existingOwners.length} owner account(s) already exist.\n` +
        'Invite additional users from /admin instead.',
    );
    process.exit(1);
  }

  const ctx = await auth.$context;
  const password = generatePassword();

  const created = await ctx.internalAdapter.createUser({
    email,
    name: 'Owner',
    emailVerified: true,
    role: 'owner',
  });

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(password),
  });

  console.log('\n  Owner account created.\n');
  console.log(`    email:    ${email}`);
  console.log(`    password: ${password}\n`);
  console.log('  This password is shown once. Sign in at /admin and change it immediately.\n');
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error('Bootstrap failed:', error);
  process.exit(1);
}
