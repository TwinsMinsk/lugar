/**
 * Seed data for taxonomy and pipeline configuration.
 *
 * Every label is lifted from the approved prototype's ru/es/en dictionaries.
 * Nothing here is invented, and nothing here is a business claim — these are
 * category names and internal pipeline labels only.
 */

export type Trilingual = { ru: string; es: string; en: string };

export const LEAD_STATUSES: Array<{
  slug: string;
  sortOrder: number;
  label: Trilingual;
  color: string;
  isDefaultEntry?: boolean;
  isWon?: boolean;
  isLost?: boolean;
  isTerminal?: boolean;
}> = [
  {
    slug: 'novaya',
    sortOrder: 100,
    color: '#4a7c59',
    isDefaultEntry: true,
    label: { ru: 'Новая', es: 'Nueva', en: 'New' },
  },
  {
    slug: 'svyazatsya',
    sortOrder: 200,
    color: '#6b8e5a',
    label: { ru: 'Связаться', es: 'Contactar', en: 'To contact' },
  },
  {
    slug: 'kvalifikaciya',
    sortOrder: 300,
    color: '#8a9a5b',
    label: { ru: 'Квалификация', es: 'Cualificación', en: 'Qualification' },
  },
  {
    slug: 'zamer-naznachen',
    sortOrder: 400,
    color: '#a89a4e',
    label: { ru: 'Замер назначен', es: 'Medición programada', en: 'Measurement booked' },
  },
  {
    slug: 'smeta-gotovitsya',
    sortOrder: 500,
    color: '#b8924a',
    label: { ru: 'Смета готовится', es: 'Presupuesto en preparación', en: 'Quote in progress' },
  },
  {
    slug: 'smeta-otpravlena',
    sortOrder: 600,
    color: '#c08a45',
    label: { ru: 'Смета отправлена', es: 'Presupuesto enviado', en: 'Quote sent' },
  },
  {
    slug: 'peregovory',
    sortOrder: 700,
    color: '#a97742',
    label: { ru: 'Переговоры', es: 'Negociación', en: 'Negotiation' },
  },
  {
    slug: 'vyigrana',
    sortOrder: 800,
    color: '#3f7d3f',
    isWon: true,
    isTerminal: true,
    label: { ru: 'Выиграна', es: 'Ganada', en: 'Won' },
  },
  {
    slug: 'proigrana',
    sortOrder: 900,
    color: '#8a8a8a',
    isLost: true,
    isTerminal: true,
    label: { ru: 'Проиграна', es: 'Perdida', en: 'Lost' },
  },
];

/** Portfolio filters, exactly as the prototype lists them (minus "All", which is UI-only). */
export const PORTFOLIO_CATEGORIES: Array<{
  slug: string;
  sortOrder: number;
  label: Trilingual;
  filterSlug: Trilingual;
}> = [
  {
    slug: 'kitchens',
    sortOrder: 100,
    label: { ru: 'Кухни', es: 'Cocinas', en: 'Kitchens' },
    filterSlug: { ru: 'kuhni', es: 'cocinas', en: 'kitchens' },
  },
  {
    slug: 'wardrobes',
    sortOrder: 200,
    label: { ru: 'Шкафы', es: 'Armarios', en: 'Wardrobes' },
    filterSlug: { ru: 'shkafy', es: 'armarios', en: 'wardrobes' },
  },
  {
    slug: 'dressing-rooms',
    sortOrder: 300,
    label: { ru: 'Гардеробные', es: 'Vestidores', en: 'Dressing rooms' },
    filterSlug: { ru: 'garderobnye', es: 'vestidores', en: 'dressing-rooms' },
  },
  {
    slug: 'tv-zones',
    sortOrder: 400,
    label: { ru: 'ТВ-зоны', es: 'Muebles de TV', en: 'TV walls' },
    filterSlug: { ru: 'tv-zony', es: 'muebles-de-tv', en: 'tv-walls' },
  },
  {
    slug: 'bedrooms',
    sortOrder: 500,
    label: { ru: 'Спальни', es: 'Dormitorios', en: 'Bedrooms' },
    filterSlug: { ru: 'spalni', es: 'dormitorios', en: 'bedrooms' },
  },
  {
    slug: 'bathrooms',
    sortOrder: 600,
    label: { ru: 'Ванные', es: 'Baños', en: 'Bathrooms' },
    filterSlug: { ru: 'vannye', es: 'banos', en: 'bathrooms' },
  },
  {
    slug: 'furniture',
    sortOrder: 700,
    label: { ru: 'Мебель', es: 'Mobiliario', en: 'Furniture' },
    filterSlug: { ru: 'mebel', es: 'mobiliario', en: 'furniture' },
  },
  {
    slug: 'doors',
    sortOrder: 800,
    label: { ru: 'Двери', es: 'Puertas', en: 'Doors' },
    filterSlug: { ru: 'dveri', es: 'puertas', en: 'doors' },
  },
];

export const SERVICE_CATEGORIES: Array<{
  slug: string;
  direction: 'korpusnaya' | 'mebel' | 'dveri';
  sortOrder: number;
  label: Trilingual;
  note?: Trilingual;
}> = [
  // --- Корпусная мебель на заказ (7) ---
  {
    slug: 'korpus-kitchens',
    direction: 'korpusnaya',
    sortOrder: 100,
    label: { ru: 'Кухни', es: 'Cocinas', en: 'Kitchens' },
    note: {
      ru: 'Прямые, угловые, П-образные, с островом, до потолка.',
      es: 'Rectas, en L, en U, con isla, hasta el techo.',
      en: 'Straight, L-shaped, U-shaped, with an island, up to the ceiling.',
    },
  },
  {
    slug: 'korpus-wardrobes',
    direction: 'korpusnaya',
    sortOrder: 200,
    label: {
      ru: 'Шкафы и гардеробные',
      es: 'Armarios y vestidores',
      en: 'Wardrobes & dressing rooms',
    },
    note: {
      ru: 'Встроенные и отдельно стоящие, с любым наполнением.',
      es: 'Empotrados o exentos, con el interior que necesites.',
      en: 'Built-in or free-standing, with any interior fit-out.',
    },
  },
  {
    slug: 'korpus-tv',
    direction: 'korpusnaya',
    sortOrder: 300,
    label: { ru: 'ТВ-зоны и гостиные', es: 'Muebles de TV y salón', en: 'TV walls & living rooms' },
    note: {
      ru: 'Медиастенки, ниши, системы хранения.',
      es: 'Paneles, hornacinas y sistemas de almacenaje.',
      en: 'Media walls, niches and storage systems.',
    },
  },
  {
    slug: 'korpus-bedrooms',
    direction: 'korpusnaya',
    sortOrder: 400,
    label: { ru: 'Спальни', es: 'Dormitorios', en: 'Bedrooms' },
    note: {
      ru: 'Кровати с подиумом, тумбы, шкафы в нишу.',
      es: 'Camas con tarima, mesillas y armarios en hueco.',
      en: 'Platform beds, nightstands, wardrobes in a niche.',
    },
  },
  {
    slug: 'korpus-hallways',
    direction: 'korpusnaya',
    sortOrder: 500,
    label: { ru: 'Прихожие', es: 'Recibidores', en: 'Hallways' },
    note: {
      ru: 'Компактные решения под узкие пространства.',
      es: 'Soluciones compactas para espacios estrechos.',
      en: 'Compact solutions for narrow spaces.',
    },
  },
  {
    slug: 'korpus-bathrooms',
    direction: 'korpusnaya',
    sortOrder: 600,
    label: { ru: 'Ванные комнаты', es: 'Baños', en: 'Bathrooms' },
    note: {
      ru: 'Влагостойкие материалы и фурнитура.',
      es: 'Materiales y herrajes resistentes a la humedad.',
      en: 'Moisture-resistant materials and hardware.',
    },
  },
  {
    slug: 'korpus-other',
    direction: 'korpusnaya',
    sortOrder: 700,
    label: {
      ru: 'Другая корпусная мебель',
      es: 'Otros muebles a medida',
      en: 'Other built-in furniture',
    },
    note: {
      ru: 'По индивидуальным размерам под любую задачу.',
      es: 'Cualquier medida especial, sin límites de catálogo.',
      en: 'Any custom size, for any task.',
    },
  },

  // --- Мебель (6) ---
  {
    slug: 'furn-sofas',
    direction: 'mebel',
    sortOrder: 100,
    label: { ru: 'Диваны и мягкая мебель', es: 'Sofás y tapizados', en: 'Sofas & upholstery' },
  },
  {
    slug: 'furn-tables',
    direction: 'mebel',
    sortOrder: 200,
    label: { ru: 'Столы', es: 'Mesas', en: 'Tables' },
  },
  {
    slug: 'furn-chairs',
    direction: 'mebel',
    sortOrder: 300,
    label: { ru: 'Стулья', es: 'Sillas', en: 'Chairs' },
  },
  {
    slug: 'furn-beds',
    direction: 'mebel',
    sortOrder: 400,
    label: { ru: 'Кровати и мебель для спальни', es: 'Camas y dormitorio', en: 'Beds & bedroom' },
  },
  {
    slug: 'furn-living',
    direction: 'mebel',
    sortOrder: 500,
    label: { ru: 'Мебель для гостиной', es: 'Muebles de salón', en: 'Living room furniture' },
  },
  {
    slug: 'furn-other',
    direction: 'mebel',
    sortOrder: 600,
    label: { ru: 'Другая мебель', es: 'Otros muebles', en: 'Other furniture' },
  },

  // --- Двери (5) ---
  {
    slug: 'door-hinged',
    direction: 'dveri',
    sortOrder: 100,
    label: { ru: 'Распашные', es: 'Abatibles', en: 'Hinged' },
  },
  {
    slug: 'door-sliding',
    direction: 'dveri',
    sortOrder: 200,
    label: { ru: 'Раздвижные', es: 'Correderas', en: 'Sliding' },
  },
  {
    slug: 'door-hidden',
    direction: 'dveri',
    sortOrder: 300,
    label: { ru: 'Скрытые', es: 'Ocultas', en: 'Hidden' },
  },
  {
    slug: 'door-glass',
    direction: 'dveri',
    sortOrder: 400,
    label: { ru: 'Стеклянные', es: 'De cristal', en: 'Glass' },
  },
  {
    slug: 'door-custom',
    direction: 'dveri',
    sortOrder: 500,
    label: { ru: 'По индивидуальным размерам', es: 'A medida', en: 'Made to measure' },
  },
];

/**
 * Global settings.
 *
 * `needsReview: true` marks a value the owner must supply before launch. These
 * are deliberately NOT invented: an empty social URL is honest, a plausible
 * fake one is a lie that ends up in three locales of three pages.
 */
export const SITE_SETTINGS: Array<{
  key: string;
  group: string;
  value: unknown;
  needsReview: boolean;
  description: string;
}> = [
  {
    key: 'contact.phone',
    group: 'contact',
    value: '+34 624 52 73 03',
    needsReview: false,
    description: 'Публичный телефон, как он отображается на сайте.',
  },
  {
    key: 'contact.phoneE164',
    group: 'contact',
    value: '+34624527303',
    needsReview: false,
    description: 'Тот же номер в E.164 — для tel: и wa.me.',
  },
  {
    key: 'contact.whatsappNumber',
    group: 'contact',
    value: '34624527303',
    needsReview: false,
    description: 'Цифры без «+» для ссылок wa.me.',
  },
  {
    key: 'contact.email',
    group: 'contact',
    value: null,
    needsReview: true,
    description: 'Публичный email. Не заполнен — уточнить у владельца.',
  },
  {
    key: 'contact.serviceArea',
    group: 'contact',
    value: { ru: 'Испания', es: 'España', en: 'Spain' },
    needsReview: true,
    description: 'География работ. Уточнить, называть ли конкретные регионы.',
  },
  {
    key: 'contact.address',
    group: 'contact',
    value: null,
    needsReview: true,
    description: 'Физический адрес. Публиковать только если владелец подтвердит.',
  },
  {
    key: 'social.instagram',
    group: 'social',
    value: null,
    needsReview: true,
    description: 'Реальный URL Instagram. В прототипе стоял заглушечный корневой адрес.',
  },
  {
    key: 'social.facebook',
    group: 'social',
    value: null,
    needsReview: true,
    description: 'Реальный URL Facebook. В прототипе стоял заглушечный корневой адрес.',
  },
  {
    key: 'legal.companyName',
    group: 'legal',
    value: null,
    needsReview: true,
    description: 'Юридическое наименование и NIF/CIF для футера и юр. страниц.',
  },
  {
    key: 'legal.consentVersion',
    group: 'legal',
    value: '2026-08-13',
    needsReview: false,
    description: 'Версия текста согласия. Меняется при каждой правке формулировки.',
  },
  {
    key: 'seo.defaultTitle',
    group: 'seo',
    value: {
      ru: 'LUGAR — мебель на заказ в Испании',
      es: 'LUGAR — muebles a medida en España',
      en: 'LUGAR — custom furniture in Spain',
    },
    needsReview: false,
    description: 'Заголовок по умолчанию, если у страницы не задан свой.',
  },
  {
    key: 'seo.ogImage',
    group: 'seo',
    value: null,
    needsReview: true,
    description: 'Изображение для соцсетей 1200×630. Нужен реальный файл.',
  },
  {
    key: 'brand.logo',
    group: 'brand',
    value: null,
    needsReview: true,
    description: 'Логотип. Пока используется текстовое начертание Alegreya, как в прототипе.',
  },
  {
    key: 'brand.materialLogos',
    group: 'brand',
    value: null,
    needsReview: true,
    description:
      'Логотипы EGGER/BLUM/HETTICH. Использовать только с разрешения правообладателя; ' +
      'иначе остаётся текстовое начертание.',
  },
  {
    key: 'analytics.enabled',
    group: 'analytics',
    value: false,
    needsReview: true,
    description: 'Включается только после получения ID и настройки согласия.',
  },
];
