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

  return {
    contact: {
      phone: read<string>('contact.phone'),
      phoneE164: read<string>('contact.phoneE164'),
      whatsappNumber: read<string>('contact.whatsappNumber'),
      email: read<string>('contact.email'),
      serviceArea: read<LocalizedText>('contact.serviceArea'),
      address: read<string>('contact.address'),
    },
    social: {
      instagram: read<string>('social.instagram'),
      facebook: read<string>('social.facebook'),
    },
    legal: {
      companyName: read<string>('legal.companyName'),
      consentVersion: read<string>('legal.consentVersion') ?? '1',
    },
    seo: {
      defaultTitle: read<LocalizedText>('seo.defaultTitle'),
      ogImageAssetId: read<string>('seo.ogImage'),
    },
    analytics: {
      enabled: read<boolean>('analytics.enabled') === true,
    },
    pendingReview: rows.filter((row) => row.needsReview).map((row) => row.key),
  };
}
