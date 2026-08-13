import { v5 as uuidv5 } from 'uuid';

import type { AnyBlock, TemplateId } from '@/content/blocks/union';

/**
 * Page content seed, taken from the approved prototype's ru/es/en dictionaries.
 *
 * Two rules govern everything in this file:
 *
 *  1. **Nothing is invented.** Every sentence exists in the prototype. Facts the
 *     owner has not supplied — social URLs, address, legal details — are absent
 *     rather than plausible-looking, and live in site_settings behind
 *     needs_review.
 *  2. **No fake portfolio.** The brief forbids seeded works, so the portfolio
 *     index ships empty with an honest empty state. It fills up the moment the
 *     owner adds a real project with real photographs.
 *
 * Ids are UUIDv5 derived from a stable key, so re-running the seed produces
 * exactly the same ids — which keeps block ids, and therefore media usage rows,
 * stable across runs.
 */
const NAMESPACE = '6f9b1d5e-2a3c-4c8f-9d1b-7e2a4f6c8d10';

export const id = (key: string): string => uuidv5(key, NAMESPACE);

const block = <T extends AnyBlock['type']>(
  key: string,
  type: T,
  data: Extract<AnyBlock, { type: T }>['data'],
  anchor?: string,
): AnyBlock =>
  ({
    id: id(`block:${key}`),
    type,
    hidden: false,
    ...(anchor ? { anchor } : {}),
    data,
  }) as AnyBlock;

const media = (key: string) => ({ assetId: id(`media:${key}`) });

export type PlaceholderAsset = {
  key: string;
  width: number;
  height: number;
  alt: { ru: string; es: string; en: string };
};

/**
 * Placeholder imagery.
 *
 * These rows carry `is_placeholder = true` and no file: the renderer draws a
 * magenta hatch reading ЗАМЕНИТЬ / REEMPLAZAR / REPLACE instead of loading
 * anything. Fabricating image bytes would be the one thing worse than an
 * obviously-empty slot.
 */
export const PLACEHOLDER_ASSETS: PlaceholderAsset[] = [
  {
    key: 'hero-home',
    width: 2400,
    height: 1350,
    alt: {
      ru: 'Главное фото — кухня на заказ, горизонтальное',
      es: 'Foto principal — cocina a medida, horizontal',
      en: 'Hero photo — custom kitchen, landscape',
    },
  },
  {
    key: 'dir-korpusnaya',
    width: 1200,
    height: 900,
    alt: { ru: 'Кухня на заказ', es: 'Cocina a medida', en: 'Custom kitchen' },
  },
  {
    key: 'dir-mebel',
    width: 1200,
    height: 900,
    alt: { ru: 'Диван / мягкая мебель', es: 'Sofá / tapizado', en: 'Sofa / upholstery' },
  },
  {
    key: 'dir-dveri',
    width: 1200,
    height: 900,
    alt: { ru: 'Межкомнатная дверь', es: 'Puerta de interior', en: 'Interior door' },
  },
  {
    key: 'founder',
    width: 1200,
    height: 1500,
    alt: {
      ru: 'Фото Максима Казакова, вертикальное',
      es: 'Foto de Maxim Kazakov, vertical',
      en: 'Photo of Maxim Kazakov, portrait',
    },
  },
];

export type PageSeed = {
  seedKey: string;
  template: TemplateId;
  slugs: { ru: string; es: string; en: string };
  isSystem: boolean;
  /** Reachable and shareable, but kept out of search results. */
  noindex?: boolean;
  seo: {
    ru: { title: string; description: string };
    es: { title: string; description: string };
    en: { title: string; description: string };
  };
  blocks: AnyBlock[];
};

const HOME = id('doc:page.home');
const KORPUS = id('doc:page.korpusnaya-mebel');
const MEBEL = id('doc:page.mebel');
const DVERI = id('doc:page.dveri');
const RABOTY = id('doc:page.raboty');
const ABOUT = id('doc:page.o-kompanii');
const CONTACTS = id('doc:page.kontakty');
const PRIVACY = id('doc:page.politika-konfidencialnosti');
const COOKIES = id('doc:page.cookies');

export const DOCUMENT_IDS = {
  HOME,
  KORPUS,
  MEBEL,
  DVERI,
  RABOTY,
  ABOUT,
  CONTACTS,
  PRIVACY,
  COOKIES,
} as const;

const CTA_CALCULATE = {
  label: {
    ru: 'Получить расчёт в WhatsApp',
    es: 'Pedir presupuesto por WhatsApp',
    en: 'Get a quote on WhatsApp',
  },
  target: { kind: 'form' as const, form: 'calculate' as const },
  variant: 'primary' as const,
};

const CONTACT_BLOCK_DATA = {
  eyebrow: { ru: 'Контакты', es: 'Contacto', en: 'Contact' },
  heading: {
    ru: 'Расскажите о проекте',
    es: 'Cuéntanos tu proyecto',
    en: 'Tell us about your project',
  },
  lead: {
    ru: 'Пришлите планировку или пару фото помещения — вернёмся с расчётом и сроками.',
    es: 'Envíanos el plano o unas fotos del espacio y te respondemos con presupuesto y plazos.',
    en: "Send us a floor plan or a couple of photos of the space and we'll come back with a quote and timing.",
  },
  primaryCta: CTA_CALCULATE,
  showPhone: true,
  showSocial: true,
  showServiceArea: true,
  showForm: false,
  tone: 'dark' as const,
};

export const PAGE_SEEDS: PageSeed[] = [
  // -------------------------------------------------------------------- home
  {
    seedKey: 'page.home',
    template: 'home',
    slugs: { ru: '', es: '', en: '' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Мебель на заказ в Испании',
        description:
          'Студия дизайна интерьера и мебели на заказ. Проектируем, изготавливаем и устанавливаем под ключ.',
      },
      es: {
        title: 'Muebles a medida en España',
        description:
          'Estudio de interiorismo y mobiliario a medida. Diseñamos, fabricamos e instalamos llave en mano.',
      },
      en: {
        title: 'Custom furniture in Spain',
        description:
          'Interior design and custom furniture studio. We design, manufacture and install turnkey.',
      },
    },
    blocks: [
      block('home.hero', 'hero', {
        variant: 'full_bleed',
        eyebrow: {
          ru: 'Мебель на заказ · Испания',
          es: 'Muebles a medida · España',
          en: 'Custom furniture · Spain',
        },
        heading: {
          ru: 'Мебель, сделанная точно под ваш дом',
          es: 'Muebles hechos exactamente para tu casa',
          en: 'Furniture built exactly for your home',
        },
        subheading: {
          ru: 'Студия дизайна интерьера и мебели на заказ. Проектируем, изготавливаем и устанавливаем под ключ.',
          es: 'Estudio de interiorismo y mobiliario a medida. Diseñamos, fabricamos e instalamos llave en mano.',
          en: 'Interior design and custom furniture studio. We design, manufacture and install turnkey.',
        },
        media: media('hero-home'),
        overlay: 'gradient',
        primaryCta: CTA_CALCULATE,
        secondaryCta: {
          label: { ru: 'Наши работы', es: 'Ver proyectos', en: 'See our work' },
          target: { kind: 'document', documentId: RABOTY },
          variant: 'secondary',
        },
      }),
      block('home.directions', 'service_grid', {
        eyebrow: { ru: 'Направления', es: 'Servicios', en: 'What we do' },
        heading: {
          ru: 'Три направления, один подрядчик',
          es: 'Tres servicios, un solo equipo',
          en: 'Three services, one team',
        },
        source: {
          mode: 'manual',
          items: [
            {
              id: id('item:home.dir.korpus'),
              title: {
                ru: 'Корпусная мебель на заказ',
                es: 'Muebles a medida',
                en: 'Custom built-in furniture',
              },
              description: {
                ru: 'Кухни, шкафы, гардеробные, ТВ-зоны, спальни — полностью по вашим размерам.',
                es: 'Cocinas, armarios, vestidores, muebles de TV y dormitorios con tus medidas exactas.',
                en: 'Kitchens, wardrobes, dressing rooms, TV walls and bedrooms — made to your exact measurements.',
              },
              media: media('dir-korpusnaya'),
              link: {
                label: { ru: 'Смотреть', es: 'Ver más', en: 'View' },
                target: { kind: 'document', documentId: KORPUS },
                variant: 'link',
              },
            },
            {
              id: id('item:home.dir.mebel'),
              title: { ru: 'Мебель', es: 'Mobiliario', en: 'Furniture' },
              description: {
                ru: 'Диваны, столы, стулья, кровати — подбираем под интерьер и бюджет.',
                es: 'Sofás, mesas, sillas y camas seleccionados para tu interior y presupuesto.',
                en: 'Sofas, tables, chairs and beds selected for your interior and budget.',
              },
              media: media('dir-mebel'),
              link: {
                label: { ru: 'Смотреть', es: 'Ver más', en: 'View' },
                target: { kind: 'document', documentId: MEBEL },
                variant: 'link',
              },
            },
            {
              id: id('item:home.dir.dveri'),
              title: {
                ru: 'Межкомнатные двери под ключ',
                es: 'Puertas llave en mano',
                en: 'Turnkey interior doors',
              },
              description: {
                ru: 'Распашные, раздвижные, скрытые и стеклянные. Замер, изготовление, установка.',
                es: 'Abatibles, correderas, ocultas y de cristal. Medición, fabricación e instalación.',
                en: 'Hinged, sliding, hidden and glass. Measuring, manufacturing and installation.',
              },
              media: media('dir-dveri'),
              link: {
                label: { ru: 'Смотреть', es: 'Ver más', en: 'View' },
                target: { kind: 'document', documentId: DVERI },
                variant: 'link',
              },
            },
          ],
        },
        variant: 'card',
        aspect: '4/3',
        columns: 3,
        showItemCta: false,
        minItemWidth: 280,
      }),
      block('home.works', 'portfolio_teaser', {
        eyebrow: { ru: 'Наши работы', es: 'Proyectos', en: 'Our work' },
        heading: {
          ru: 'Проекты, которые уже живут в домах клиентов',
          es: 'Proyectos que ya viven en casa de nuestros clientes',
          en: "Projects already living in our clients' homes",
        },
        source: { mode: 'latest', limit: 6 },
        aspect: '4/5',
        columns: 3,
        linkLabel: { ru: 'Все работы', es: 'Ver todo', en: 'View all' },
        linkTargetDocumentId: RABOTY,
      }),
      block('home.materials', 'materials_quality', {
        eyebrow: {
          ru: 'Материалы и качество',
          es: 'Materiales y calidad',
          en: 'Materials & quality',
        },
        heading: {
          ru: 'Материалы, которые служат десятилетиями',
          es: 'Materiales que duran décadas',
          en: 'Materials that last for decades',
        },
        text: {
          ru: 'Используем качественные материалы EGGER и надёжную мебельную фурнитуру BLUM и HETTICH.',
          es: 'Trabajamos con materiales de calidad EGGER y herrajes fiables BLUM y HETTICH.',
          en: 'We use quality EGGER materials and reliable BLUM and HETTICH furniture hardware.',
        },
        brands: [
          {
            id: id('item:brand.egger'),
            name: 'EGGER',
            kind: { ru: 'Материалы', es: 'Materiales', en: 'Materials' },
          },
          {
            id: id('item:brand.blum'),
            name: 'BLUM',
            kind: { ru: 'Фурнитура', es: 'Herrajes', en: 'Hardware' },
          },
          {
            id: id('item:brand.hettich'),
            name: 'HETTICH',
            kind: { ru: 'Фурнитура', es: 'Herrajes', en: 'Hardware' },
          },
        ],
        tone: 'muted',
      }),
      block(
        'home.founder',
        'founder_profile',
        {
          eyebrow: { ru: 'О компании', es: 'Estudio', en: 'Studio' },
          heading: {
            ru: 'Работаем в Испании три года',
            es: 'Tres años trabajando en España',
            en: 'Three years working in Spain',
          },
          paragraphs: [
            {
              ru: 'LUGAR работает на территории Испании 3 года. Мы напрямую сотрудничаем с производствами и контролируем качество и сроки каждого проекта.',
              es: 'LUGAR lleva 3 años trabajando en España. Colaboramos directamente con las fábricas y controlamos la calidad y los plazos de cada proyecto.',
              en: 'LUGAR has been working in Spain for 3 years. We work directly with the factories and control the quality and timing of every project.',
            },
            {
              ru: 'В нашей команде 5 высококвалифицированных монтажных бригад. Срок изготовления мебели — до 30 дней, в зависимости от проекта и выбранных материалов.',
              es: 'Contamos con 5 equipos de instalación altamente cualificados. El plazo de fabricación es de hasta 30 días, según el proyecto y los materiales elegidos.',
              en: 'Our team includes 5 highly qualified installation crews. Production takes up to 30 days, depending on the project and the materials chosen.',
            },
          ],
          stats: [
            {
              id: id('item:stat.years'),
              value: { ru: '3 года', es: '3 años', en: '3 years' },
              label: {
                ru: 'работаем в Испании',
                es: 'trabajando en España',
                en: 'working in Spain',
              },
            },
            {
              id: id('item:stat.crews'),
              value: { ru: '5', es: '5', en: '5' },
              label: {
                ru: 'монтажных бригад',
                es: 'equipos de instalación',
                en: 'installation crews',
              },
            },
            {
              id: id('item:stat.leadtime'),
              value: { ru: 'до 30 дней', es: 'hasta 30 días', en: 'up to 30 days' },
              label: {
                ru: 'срок изготовления',
                es: 'plazo de fabricación',
                en: 'production time',
              },
            },
          ],
          media: media('founder'),
          name: 'Максим Казаков',
          role: {
            ru: 'Основатель LUGAR и руководитель отдела продаж',
            es: 'Fundador de LUGAR y director comercial',
            en: 'Founder of LUGAR and head of sales',
          },
        },
        'about',
      ),
      block('home.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // --------------------------------------------------------- корпусная мебель
  {
    seedKey: 'page.korpusnaya-mebel',
    template: 'service',
    slugs: { ru: 'korpusnaya-mebel', es: 'muebles-a-medida', en: 'built-in-furniture' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Корпусная мебель на заказ',
        description:
          'Мебель полностью по вашим размерам: кухни, шкафы, гардеробные, ТВ-зоны, спальни, прихожие, ванные.',
      },
      es: {
        title: 'Muebles a medida',
        description:
          'Muebles totalmente adaptados a tus medidas: cocinas, armarios, vestidores, muebles de TV, dormitorios, recibidores y baños.',
      },
      en: {
        title: 'Custom built-in furniture',
        description:
          'Furniture made entirely to your measurements: kitchens, wardrobes, dressing rooms, TV walls, bedrooms, hallways and bathrooms.',
      },
    },
    blocks: [
      block('korpus.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Основное направление', es: 'Servicio principal', en: 'Main service' },
        heading: {
          ru: 'Корпусная мебель на заказ',
          es: 'Muebles a medida',
          en: 'Custom built-in furniture',
        },
        subheading: {
          ru: 'Мебель полностью по вашим размерам и пожеланиям: от планировки до последней ручки. Проектируем под конкретную квартиру, а не под каталог.',
          es: 'Muebles totalmente adaptados a tus medidas y necesidades: desde la distribución hasta el último tirador. Diseñamos para tu vivienda, no para un catálogo.',
          en: 'Furniture made entirely to your measurements and wishes — from the layout to the last handle. Designed for your home, not for a catalogue.',
        },
        overlay: 'none',
      }),
      block('korpus.grid', 'service_grid', {
        source: { mode: 'direction', direction: 'korpusnaya' },
        variant: 'card',
        aspect: '3/2',
        columns: 3,
        showItemCta: true,
        itemCtaLabel: {
          ru: 'Узнать стоимость',
          es: 'Consultar precio',
          en: 'Ask for a price',
        },
        minItemWidth: 300,
      }),
      block('korpus.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // ------------------------------------------------------------------- мебель
  {
    seedKey: 'page.mebel',
    template: 'service',
    slugs: { ru: 'mebel', es: 'mobiliario', en: 'furniture' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Мебель для готового интерьера',
        description:
          'Подбираем и поставляем мебель под уже спроектированный интерьер: диваны, столы, стулья, кровати.',
      },
      es: {
        title: 'Mobiliario para interiores terminados',
        description:
          'Seleccionamos y suministramos muebles para un interior ya proyectado: sofás, mesas, sillas y camas.',
      },
      en: {
        title: 'Furniture for a finished interior',
        description:
          'We select and supply furniture for an interior that is already designed: sofas, tables, chairs and beds.',
      },
    },
    blocks: [
      block('mebel.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Мебель', es: 'Mobiliario', en: 'Furniture' },
        heading: {
          ru: 'Мебель для готового интерьера',
          es: 'Mobiliario para interiores terminados',
          en: 'Furniture for a finished interior',
        },
        subheading: {
          ru: 'Подбираем и поставляем мебель под уже спроектированный интерьер. Фото, название, цена по запросу.',
          es: 'Seleccionamos y suministramos muebles para un interior ya proyectado. Foto, nombre y precio bajo consulta.',
          en: 'We select and supply furniture for an interior that is already designed. Photo, name and price on request.',
        },
        overlay: 'none',
      }),
      block('mebel.grid', 'service_grid', {
        source: { mode: 'direction', direction: 'mebel' },
        variant: 'plain',
        aspect: '1/1',
        columns: 3,
        showItemCta: true,
        itemCtaLabel: {
          ru: 'Узнать стоимость',
          es: 'Consultar precio',
          en: 'Ask for a price',
        },
        minItemWidth: 270,
      }),
      block('mebel.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // -------------------------------------------------------------------- двери
  {
    seedKey: 'page.dveri',
    template: 'service',
    slugs: { ru: 'dveri', es: 'puertas', en: 'doors' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Межкомнатные двери под ключ',
        description:
          'Подбор, изготовление и установка дверей: распашные, раздвижные, скрытые, стеклянные, по индивидуальным размерам.',
      },
      es: {
        title: 'Puertas de interior llave en mano',
        description:
          'Selección, fabricación e instalación de puertas: abatibles, correderas, ocultas, de cristal y a medida.',
      },
      en: {
        title: 'Turnkey interior doors',
        description:
          'Selection, manufacturing and installation of doors: hinged, sliding, hidden, glass and made to measure.',
      },
    },
    blocks: [
      block('dveri.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Двери', es: 'Puertas', en: 'Doors' },
        heading: {
          ru: 'Межкомнатные двери под ключ',
          es: 'Puertas de interior llave en mano',
          en: 'Turnkey interior doors',
        },
        subheading: {
          ru: 'Подбор, изготовление и установка дверей. Один подрядчик от замера до финальной регулировки.',
          es: 'Selección, fabricación e instalación de puertas. Un solo responsable desde la medición hasta el ajuste final.',
          en: 'Selection, manufacturing and installation of doors. One contractor from measuring to the final adjustment.',
        },
        overlay: 'none',
      }),
      block('dveri.grid', 'service_grid', {
        source: { mode: 'direction', direction: 'dveri' },
        variant: 'plain',
        aspect: '3/4',
        columns: 4,
        showItemCta: false,
        minItemWidth: 230,
      }),
      block('dveri.process', 'process_steps', {
        heading: { ru: 'Как проходит работа', es: 'Cómo trabajamos', en: 'How it works' },
        steps: [
          {
            id: id('item:step.measure'),
            name: { ru: 'Замер', es: 'Medición', en: 'Measuring' },
            note: {
              ru: 'Приезжаем на объект и снимаем точные размеры проёмов.',
              es: 'Visitamos la obra y tomamos las medidas exactas.',
              en: 'We visit the site and take exact opening sizes.',
            },
          },
          {
            id: id('item:step.manufacture'),
            name: { ru: 'Изготовление', es: 'Fabricación', en: 'Manufacturing' },
            note: {
              ru: 'Производство под ваш размер и выбранное покрытие.',
              es: 'Producción con tu medida y acabado elegido.',
              en: 'Production in your size and chosen finish.',
            },
          },
          {
            id: id('item:step.delivery'),
            name: { ru: 'Доставка', es: 'Entrega', en: 'Delivery' },
            note: {
              ru: 'Привозим на объект в согласованный день.',
              es: 'Llevamos todo a la obra el día acordado.',
              en: 'Everything arrives on site on the agreed day.',
            },
          },
          {
            id: id('item:step.install'),
            name: { ru: 'Установка', es: 'Instalación', en: 'Installation' },
            note: {
              ru: 'Монтаж, наличники, фурнитура, регулировка.',
              es: 'Montaje, tapajuntas, herrajes y ajuste.',
              en: 'Fitting, trims, hardware and adjustment.',
            },
          },
        ],
        tone: 'muted',
        cta: CTA_CALCULATE,
      }),
      block('dveri.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // ------------------------------------------------------------- наши работы
  {
    seedKey: 'page.raboty',
    template: 'portfolio_index',
    slugs: { ru: 'raboty', es: 'proyectos', en: 'work' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Наши работы',
        description: 'Реальные проекты LUGAR: кухни, гардеробные, ТВ-зоны, ванные, двери и мебель.',
      },
      es: {
        title: 'Nuestros proyectos',
        description:
          'Proyectos reales de LUGAR: cocinas, vestidores, muebles de TV, baños, puertas y mobiliario.',
      },
      en: {
        title: 'Our work',
        description:
          'Real LUGAR projects: kitchens, dressing rooms, TV walls, bathrooms, doors and furniture.',
      },
    },
    blocks: [
      block('raboty.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Наши работы', es: 'Proyectos', en: 'Our work' },
        heading: { ru: 'Наши работы', es: 'Nuestros proyectos', en: 'Our work' },
        subheading: {
          ru: 'Реальные проекты LUGAR: кухни, гардеробные, ТВ-зоны, ванные, двери и мебель.',
          es: 'Proyectos reales de LUGAR: cocinas, vestidores, muebles de TV, baños, puertas y mobiliario.',
          en: 'Real LUGAR projects: kitchens, dressing rooms, TV walls, bathrooms, doors and furniture.',
        },
        overlay: 'none',
      }),
      block('raboty.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // --------------------------------------------------------------- о компании
  {
    seedKey: 'page.o-kompanii',
    template: 'about',
    slugs: { ru: 'o-kompanii', es: 'estudio', en: 'about' },
    isSystem: true,
    seo: {
      ru: {
        title: 'О компании',
        description:
          'LUGAR работает в Испании 3 года, сотрудничает напрямую с производствами, 5 монтажных бригад.',
      },
      es: {
        title: 'Estudio',
        description:
          'LUGAR lleva 3 años en España, colabora directamente con las fábricas y cuenta con 5 equipos de instalación.',
      },
      en: {
        title: 'Studio',
        description:
          'LUGAR has worked in Spain for 3 years, partners directly with factories and has 5 installation crews.',
      },
    },
    blocks: [
      block('about.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'О компании', es: 'Estudio', en: 'Studio' },
        heading: {
          ru: 'Работаем в Испании три года',
          es: 'Tres años trabajando en España',
          en: 'Three years working in Spain',
        },
        overlay: 'none',
      }),
      block('about.founder', 'founder_profile', {
        heading: {
          ru: 'Прямое сотрудничество с производствами',
          es: 'Colaboración directa con las fábricas',
          en: 'Working directly with the factories',
        },
        paragraphs: [
          {
            ru: 'LUGAR работает на территории Испании 3 года. Мы напрямую сотрудничаем с производствами и контролируем качество и сроки каждого проекта.',
            es: 'LUGAR lleva 3 años trabajando en España. Colaboramos directamente con las fábricas y controlamos la calidad y los plazos de cada proyecto.',
            en: 'LUGAR has been working in Spain for 3 years. We work directly with the factories and control the quality and timing of every project.',
          },
          {
            ru: 'В нашей команде 5 высококвалифицированных монтажных бригад. Срок изготовления мебели — до 30 дней, в зависимости от проекта и выбранных материалов.',
            es: 'Contamos con 5 equipos de instalación altamente cualificados. El plazo de fabricación es de hasta 30 días, según el proyecto y los materiales elegidos.',
            en: 'Our team includes 5 highly qualified installation crews. Production takes up to 30 days, depending on the project and the materials chosen.',
          },
        ],
        stats: [
          {
            id: id('item:about.stat.years'),
            value: { ru: '3 года', es: '3 años', en: '3 years' },
            label: { ru: 'работаем в Испании', es: 'trabajando en España', en: 'working in Spain' },
          },
          {
            id: id('item:about.stat.crews'),
            value: { ru: '5', es: '5', en: '5' },
            label: {
              ru: 'монтажных бригад',
              es: 'equipos de instalación',
              en: 'installation crews',
            },
          },
          {
            id: id('item:about.stat.leadtime'),
            value: { ru: 'до 30 дней', es: 'hasta 30 días', en: 'up to 30 days' },
            label: { ru: 'срок изготовления', es: 'plazo de fabricación', en: 'production time' },
          },
        ],
        media: media('founder'),
        name: 'Максим Казаков',
        role: {
          ru: 'Основатель LUGAR и руководитель отдела продаж',
          es: 'Fundador de LUGAR y director comercial',
          en: 'Founder of LUGAR and head of sales',
        },
        cta: CTA_CALCULATE,
      }),
      block('about.materials', 'materials_quality', {
        eyebrow: {
          ru: 'Материалы и качество',
          es: 'Materiales y calidad',
          en: 'Materials & quality',
        },
        heading: {
          ru: 'Материалы, которые служат десятилетиями',
          es: 'Materiales que duran décadas',
          en: 'Materials that last for decades',
        },
        text: {
          ru: 'Используем качественные материалы EGGER и надёжную мебельную фурнитуру BLUM и HETTICH.',
          es: 'Trabajamos con materiales de calidad EGGER y herrajes fiables BLUM y HETTICH.',
          en: 'We use quality EGGER materials and reliable BLUM and HETTICH furniture hardware.',
        },
        brands: [
          {
            id: id('item:about.brand.egger'),
            name: 'EGGER',
            kind: { ru: 'Материалы', es: 'Materiales', en: 'Materials' },
          },
          {
            id: id('item:about.brand.blum'),
            name: 'BLUM',
            kind: { ru: 'Фурнитура', es: 'Herrajes', en: 'Hardware' },
          },
          {
            id: id('item:about.brand.hettich'),
            name: 'HETTICH',
            kind: { ru: 'Фурнитура', es: 'Herrajes', en: 'Hardware' },
          },
        ],
        tone: 'muted',
      }),
      block('about.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },

  // ----------------------------------------------------------------- контакты
  {
    seedKey: 'page.kontakty',
    template: 'contact',
    slugs: { ru: 'kontakty', es: 'contacto', en: 'contact' },
    isSystem: true,
    seo: {
      ru: {
        title: 'Контакты',
        description:
          'Телефон и WhatsApp LUGAR. Пришлите планировку — вернёмся с расчётом и сроками.',
      },
      es: {
        title: 'Contacto',
        description:
          'Teléfono y WhatsApp de LUGAR. Envíanos el plano y te respondemos con presupuesto y plazos.',
      },
      en: {
        title: 'Contact',
        description:
          "LUGAR's phone and WhatsApp. Send us a floor plan and we'll come back with a quote and timing.",
      },
    },
    blocks: [
      block('kontakty.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Контакты', es: 'Contacto', en: 'Contact' },
        heading: {
          ru: 'Расскажите о проекте',
          es: 'Cuéntanos tu proyecto',
          en: 'Tell us about your project',
        },
        subheading: {
          ru: 'Пришлите планировку или пару фото помещения — вернёмся с расчётом и сроками.',
          es: 'Envíanos el plano o unas fotos del espacio y te respondemos con presupuesto y plazos.',
          en: "Send us a floor plan or a couple of photos of the space and we'll come back with a quote and timing.",
        },
        overlay: 'none',
        primaryCta: CTA_CALCULATE,
      }),
      block(
        'kontakty.contacts',
        'contact_block',
        { ...CONTACT_BLOCK_DATA, showForm: true },
        'contacts',
      ),
    ],
  },

  // ------------------------------------------------------------------ спасибо
  //
  // A safe landing place for a post-submission redirect. The form's own success
  // state does not navigate here — it shows inline and offers the WhatsApp
  // hand-off — but the page has to exist and be indexable-safe for the cases
  // where a redirect is the only option (JS disabled, an external return URL).
  {
    seedKey: 'page.spasibo',
    template: 'thanks',
    slugs: { ru: 'spasibo', es: 'gracias', en: 'thank-you' },
    isSystem: true,
    // A thank-you page has no search value and, indexed, would leak into
    // results as a dead end for people who never submitted anything.
    noindex: true,
    seo: {
      ru: { title: 'Спасибо за заявку', description: 'Мы получили вашу заявку и скоро свяжемся.' },
      es: {
        title: 'Gracias por tu solicitud',
        description: 'Hemos recibido tu solicitud y te contactaremos en breve.',
      },
      en: {
        title: 'Thank you for your enquiry',
        description: 'We have received your enquiry and will be in touch shortly.',
      },
    },
    blocks: [
      block('spasibo.hero', 'hero', {
        variant: 'text',
        eyebrow: { ru: 'Заявка отправлена', es: 'Solicitud enviada', en: 'Enquiry sent' },
        heading: {
          ru: 'Спасибо! Мы получили вашу заявку',
          es: '¡Gracias! Hemos recibido tu solicitud',
          en: 'Thank you! We have received your enquiry',
        },
        subheading: {
          ru: 'Свяжемся с вами в ближайшее время. Если хотите ускорить — напишите нам в WhatsApp.',
          es: 'Te contactaremos en breve. Si quieres ir más rápido, escríbenos por WhatsApp.',
          en: 'We will be in touch shortly. To speed things up, message us on WhatsApp.',
        },
        overlay: 'none',
        primaryCta: {
          label: {
            ru: 'Написать в WhatsApp',
            es: 'Escribir por WhatsApp',
            en: 'Message on WhatsApp',
          },
          target: { kind: 'whatsapp' },
          variant: 'primary',
        },
        secondaryCta: {
          label: { ru: 'Наши работы', es: 'Ver proyectos', en: 'See our work' },
          target: { kind: 'document', documentId: RABOTY },
          variant: 'outline',
        },
      }),
      block('spasibo.contacts', 'contact_block', CONTACT_BLOCK_DATA, 'contacts'),
    ],
  },
];

/**
 * Legal pages.
 *
 * Shipped as clearly-labelled templates with the notice banner switched on.
 * The owner must have both reviewed by a lawyer before launch; presenting a
 * template as finished legal text would be worse than shipping nothing.
 */
export const LEGAL_SEEDS: PageSeed[] = [
  {
    seedKey: 'page.politika-konfidencialnosti',
    template: 'legal',
    slugs: {
      ru: 'politika-konfidencialnosti',
      es: 'politica-de-privacidad',
      en: 'privacy-policy',
    },
    isSystem: true,
    seo: {
      ru: {
        title: 'Политика конфиденциальности',
        description: 'Как LUGAR обрабатывает персональные данные.',
      },
      es: {
        title: 'Política de privacidad',
        description: 'Cómo trata LUGAR los datos personales.',
      },
      en: { title: 'Privacy policy', description: 'How LUGAR processes personal data.' },
    },
    blocks: [
      block('privacy.body', 'legal_rich_text', {
        heading: {
          ru: 'Политика конфиденциальности',
          es: 'Política de privacidad',
          en: 'Privacy policy',
        },
        content: {
          ru: paragraphs([
            'Этот текст является шаблоном и требует проверки юристом до публикации.',
            'LUGAR обрабатывает персональные данные, которые вы указываете в форме на сайте: имя, номер телефона, город и комментарий к заявке. Данные используются только для того, чтобы связаться с вами и подготовить расчёт.',
            'Мы храним данные заявки в собственной системе учёта. Мы не продаём и не передаём их третьим лицам, за исключением случаев, предусмотренных законом.',
            'Вы можете запросить доступ к своим данным, их исправление или удаление, написав нам по контактам, указанным на сайте.',
          ]),
          es: paragraphs([
            'Este texto es una plantilla y debe ser revisado por un abogado antes de su publicación.',
            'LUGAR trata los datos personales que facilitas en el formulario de la web: nombre, teléfono, ciudad y comentario. Los datos se utilizan únicamente para contactar contigo y preparar un presupuesto.',
            'Conservamos los datos de la solicitud en nuestro propio sistema. No los vendemos ni los cedemos a terceros, salvo obligación legal.',
            'Puedes solicitar el acceso, la rectificación o la supresión de tus datos escribiéndonos a los contactos indicados en la web.',
          ]),
          en: paragraphs([
            'This text is a template and must be reviewed by a lawyer before publication.',
            'LUGAR processes the personal data you provide in the website form: name, phone number, city and comment. The data is used solely to contact you and prepare a quote.',
            'We store enquiry data in our own system. We do not sell or share it with third parties except where required by law.',
            'You may request access to, correction of, or deletion of your data by writing to the contacts listed on the website.',
          ]),
        },
        lastUpdated: '2026-08-13',
        showTemplateNotice: true,
      }),
    ],
  },
  {
    seedKey: 'page.cookies',
    template: 'legal',
    slugs: { ru: 'cookies', es: 'cookies', en: 'cookies' },
    isSystem: true,
    seo: {
      ru: { title: 'Файлы cookie', description: 'Какие cookie использует сайт LUGAR.' },
      es: { title: 'Cookies', description: 'Qué cookies utiliza la web de LUGAR.' },
      en: { title: 'Cookies', description: 'Which cookies the LUGAR website uses.' },
    },
    blocks: [
      block('cookies.body', 'legal_rich_text', {
        heading: { ru: 'Файлы cookie', es: 'Cookies', en: 'Cookies' },
        content: {
          ru: paragraphs([
            'Этот текст является шаблоном и требует проверки юристом до публикации.',
            'Необходимые cookie обеспечивают базовую работу сайта: выбор языка и корректную обработку формы. Они не требуют согласия.',
            'Аналитические и маркетинговые cookie не устанавливаются до тех пор, пока вы не дадите согласие в баннере. Вы можете изменить выбор в любой момент через ссылку «Настройки cookie» в футере.',
          ]),
          es: paragraphs([
            'Este texto es una plantilla y debe ser revisado por un abogado antes de su publicación.',
            'Las cookies necesarias permiten el funcionamiento básico de la web: la selección de idioma y el envío correcto del formulario. No requieren consentimiento.',
            'Las cookies analíticas y de marketing no se instalan hasta que das tu consentimiento en el banner. Puedes cambiar tu elección en cualquier momento desde «Preferencias de cookies» en el pie de página.',
          ]),
          en: paragraphs([
            'This text is a template and must be reviewed by a lawyer before publication.',
            'Necessary cookies keep the site working: language selection and correct form submission. They do not require consent.',
            'Analytics and marketing cookies are not set until you grant consent in the banner. You can change your choice at any time via "Cookie preferences" in the footer.',
          ]),
        },
        lastUpdated: '2026-08-13',
        showTemplateNotice: true,
      }),
    ],
  },
];

function paragraphs(lines: string[]) {
  return {
    type: 'doc' as const,
    content: lines.map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    })),
  };
}

export const NAVIGATION_SEED = {
  header: [
    {
      key: 'nav.korpus',
      documentId: KORPUS,
      label: { ru: 'Корпусная мебель', es: 'Muebles a medida', en: 'Built-in furniture' },
    },
    {
      key: 'nav.mebel',
      documentId: MEBEL,
      label: { ru: 'Мебель', es: 'Mobiliario', en: 'Furniture' },
    },
    { key: 'nav.dveri', documentId: DVERI, label: { ru: 'Двери', es: 'Puertas', en: 'Doors' } },
    {
      key: 'nav.raboty',
      documentId: RABOTY,
      label: { ru: 'Наши работы', es: 'Proyectos', en: 'Our work' },
    },
    {
      key: 'nav.about',
      documentId: ABOUT,
      label: { ru: 'О компании', es: 'Estudio', en: 'Studio' },
    },
    {
      key: 'nav.contacts',
      documentId: CONTACTS,
      label: { ru: 'Контакты', es: 'Contacto', en: 'Contact' },
    },
  ],
  footer_legal: [
    {
      key: 'nav.privacy',
      documentId: PRIVACY,
      label: {
        ru: 'Политика конфиденциальности',
        es: 'Política de privacidad',
        en: 'Privacy policy',
      },
    },
    {
      key: 'nav.cookies',
      documentId: COOKIES,
      label: { ru: 'Cookies', es: 'Cookies', en: 'Cookies' },
    },
  ],
} as const;
