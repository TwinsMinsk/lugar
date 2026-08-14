import 'server-only';

import { asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { siteSettings } from '@/db/schema';
import { requireCapability } from '@/lib/auth/guards';

/**
 * Raw settings for the admin form.
 *
 * Deliberately not `getSiteSettings()`: that shapes values for rendering and
 * coerces types for the public site. The editor needs what is actually stored,
 * including which keys are still awaiting a real value.
 */
export async function listRawSettings(): Promise<
  Array<{ key: string; value: unknown; needsReview: boolean; description: string | null }>
> {
  await requireCapability('settings.write');

  return db
    .select({
      key: siteSettings.key,
      value: siteSettings.value,
      needsReview: siteSettings.needsReview,
      description: siteSettings.description,
    })
    .from(siteSettings)
    .orderBy(asc(siteSettings.group), asc(siteSettings.key));
}
