import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import type { LocalizedText } from '@/content/i18n';
import { db } from '@/db/client';
import { siteSettings } from '@/db/schema';
import { PUBLIC_CACHE_PROFILE, tags } from '../cache-tags';

/**
 * Global settings.
 *
 * Values the owner has not supplied yet are stored as `null`, never as a
 * plausible-looking placeholder. The renderers below therefore treat "absent"
 * as "render nothing" — an omitted Instagram link is honest, a fake one is a
 * lie that would reach production unnoticed.
 */
export type SiteSettings = {
  contact: {
    phone: string | null;
    phoneE164: string | null;
    whatsappNumber: string | null;
    email: string | null;
    serviceArea: LocalizedText | null;
    address: string | null;
  };
  social: {
    instagram: string | null;
    facebook: string | null;
  };
  legal: {
    companyName: string | null;
    consentVersion: string;
  };
  seo: {
    defaultTitle: LocalizedText | null;
    ogImageAssetId: string | null;
  };
  analytics: {
    enabled: boolean;
  };
  /** Keys still awaiting a real value. Surfaced on the admin dashboard. */
  pendingReview: string[];
};

/**
 * Coerce a JSONB-stored scalar setting to a string.
 *
 * Values stored in JSONB do NOT reliably round-trip as strings: an all-digit
 * value such as the WhatsApp number "34624527303" comes back as a JS number,
 * while "+34 624 52 73 03" survives only because the '+' makes it unparseable
 * as one. That asymmetry is exactly the kind of bug that reaches production —
 * it broke `whatsappLink()`, which calls `.replace()` on its argument, and
 * would otherwise have shipped a dead click-to-chat link.
 *
 * Exported so the behaviour is pinned by a test rather than rediscovered.
 */
export function coerceSettingString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  'use cache';
  cacheLife(PUBLIC_CACHE_PROFILE);
  cacheTag(tags.settings());

  const rows = await db
    .select({
      key: siteSettings.key,
      value: siteSettings.value,
      needsReview: siteSettings.needsReview,
    })
    .from(siteSettings);

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = <T>(key: string): T | null => (map.get(key) ?? null) as T | null;

  const readString = (key: string): string | null => coerceSettingString(map.get(key));

  return {
    contact: {
      phone: readString('contact.phone'),
      phoneE164: readString('contact.phoneE164'),
      whatsappNumber: readString('contact.whatsappNumber'),
      email: readString('contact.email'),
      serviceArea: read<LocalizedText>('contact.serviceArea'),
      address: readString('contact.address'),
    },
    social: {
      instagram: readString('social.instagram'),
      facebook: readString('social.facebook'),
    },
    legal: {
      companyName: readString('legal.companyName'),
      consentVersion: readString('legal.consentVersion') ?? '1',
    },
    seo: {
      defaultTitle: read<LocalizedText>('seo.defaultTitle'),
      ogImageAssetId: readString('seo.ogImage'),
    },
    analytics: {
      enabled: read<boolean>('analytics.enabled') === true,
    },
    pendingReview: rows.filter((row) => row.needsReview).map((row) => row.key),
  };
}
