'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { coerceSettingValue, SETTINGS_BY_KEY } from '@/content/settings-registry';
import { db } from '@/db/client';
import { siteSettings } from '@/db/schema';
import { recordAudit } from '@/lib/audit';
import { invalidatePublicPages } from '@/lib/cache-invalidation';
import { requireCapability } from '@/lib/auth/guards';

export type SettingsResult = { ok: true } | { ok: false; errors: Record<string, string> };

const inputSchema = z.object({
  /** key → value, or null to clear it back to "awaiting a real value". */
  values: z.record(z.string().max(64), z.unknown()),
});

/**
 * Save global settings.
 *
 * Each value is validated against its registry entry, never accepted as typed.
 * These reach public HTML — a social URL becomes an anchor, a phone number a
 * `tel:` and a `wa.me` link — so an unvalidated paste would put a broken or
 * hostile link on every page of the site.
 *
 * Clearing a value restores `needs_review`, so the dashboard counter goes back
 * up rather than silently reporting the field as done.
 */
export async function updateSettings(input: z.input<typeof inputSchema>): Promise<SettingsResult> {
  const { user } = await requireCapability('settings.write');

  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, errors: { _form: 'invalid_input' } };

  const errors: Record<string, string> = {};
  const accepted: Array<{ key: string; value: unknown; needsReview: boolean }> = [];

  for (const [key, rawInput] of Object.entries(parsedInput.data.values)) {
    const definition = SETTINGS_BY_KEY.get(key);
    // An unknown key is a client that has drifted from the registry — refuse
    // it rather than writing a setting nothing will ever read.
    if (!definition) {
      errors[key] = 'unknown_setting';
      continue;
    }

    // Normalise before validating, so a value the database itself supplied
    // cannot fail its own schema on a type JSONB did not preserve.
    const raw = coerceSettingValue(definition.kind, rawInput);

    // Booleans have no meaningful "empty": false is a real answer, not an
    // unfilled field, so they never fall through to the clearing branch.
    if (definition.kind === 'boolean') {
      accepted.push({ key, value: raw === true, needsReview: false });
      continue;
    }

    const isEmpty =
      raw === null ||
      raw === undefined ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (typeof raw === 'object' &&
        !Array.isArray(raw) &&
        Object.values(raw as Record<string, unknown>).every(
          (entry) => typeof entry !== 'string' || entry.trim() === '',
        ));

    if (isEmpty) {
      // Clearing restores needs_review, so the dashboard counter goes back up
      // rather than reporting the field as done.
      accepted.push({ key, value: null, needsReview: true });
      continue;
    }

    const parsed = definition.schema.safeParse(raw);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? 'invalid';
      continue;
    }

    accepted.push({ key, value: parsed.data, needsReview: false });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const headerList = await headers();
  const context = {
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  };

  await db.transaction(async (tx) => {
    for (const entry of accepted) {
      await tx
        .update(siteSettings)
        .set({ value: entry.value as never, needsReview: entry.needsReview })
        .where(eq(siteSettings.key, entry.key));
    }

    await recordAudit(
      {
        actorUserId: user.id,
        action: 'settings.updated',
        entityType: 'site_settings',
        // Keys only — the values themselves can include contact details, and an
        // audit log is not the place to keep a second copy of them.
        after: { keys: accepted.map((entry) => entry.key) },
        ...context,
      },
      tx,
    );
  });

  // Settings reach the header and footer as well as page content, so the
  // whole public site is invalidated rather than only the settings tag.
  await invalidatePublicPages();
  return { ok: true };
}
