import { describe, expect, it } from 'vitest';

import { breadcrumbJsonLd, localBusinessJsonLd } from '@/components/seo/structured-data';
import type { SiteSettings } from '@/data/public/settings';

const EMPTY_SETTINGS: SiteSettings = {
  contact: {
    phone: null,
    phoneE164: null,
    whatsappNumber: null,
    email: null,
    serviceArea: null,
    address: null,
  },
  social: { instagram: null, facebook: null },
  legal: { companyName: null, consentVersion: '2026-08-13' },
  seo: { defaultTitle: null, ogImageAssetId: null },
  analytics: { enabled: false },
  pendingReview: [],
};

describe('localBusinessJsonLd', () => {
  it('omits every field the owner has not filled in, rather than emitting empty values', () => {
    const data = localBusinessJsonLd(EMPTY_SETTINGS, 'ru', 'https://lugar.es');

    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'LUGAR',
      url: 'https://lugar.es',
    });
    // The absence has to be a missing key, not `undefined` — schema.org
    // validators and Google's Rich Results Test both flag a present key with
    // a null/undefined value as malformed, which is worse than omitting it.
    expect('telephone' in data).toBe(false);
    expect('address' in data).toBe(false);
    expect('sameAs' in data).toBe(false);
  });

  it('includes every filled-in field, and only the social links that are set', () => {
    const settings: SiteSettings = {
      ...EMPTY_SETTINGS,
      contact: {
        ...EMPTY_SETTINGS.contact,
        phoneE164: '+34624527303',
        email: 'estudio@lugar.es',
        address: 'Calle Falsa 123, Marbella',
        serviceArea: { ru: 'Испания', es: 'España', en: 'Spain' },
      },
      social: { instagram: 'https://instagram.com/lugar', facebook: null },
      legal: { ...EMPTY_SETTINGS.legal, companyName: 'LUGAR Estudio S.L.' },
    };

    const data = localBusinessJsonLd(settings, 'es', 'https://lugar.es');

    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'LUGAR Estudio S.L.',
      url: 'https://lugar.es',
      telephone: '+34624527303',
      email: 'estudio@lugar.es',
      address: 'Calle Falsa 123, Marbella',
      areaServed: 'España',
      sameAs: ['https://instagram.com/lugar'],
    });
  });
});

describe('breadcrumbJsonLd', () => {
  it('builds a two-item trail: home, then the current page', () => {
    const data = breadcrumbJsonLd('https://lugar.es', 'https://lugar.es/o-kompanii', 'О компании');

    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LUGAR', item: 'https://lugar.es' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'О компании',
          item: 'https://lugar.es/o-kompanii',
        },
      ],
    });
  });
});
