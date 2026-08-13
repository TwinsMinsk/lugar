import type { z } from 'zod';

import type { Locale } from '../i18n';
import {
  contactBlockSchema,
  ctaBannerSchema,
  faqSchema,
  founderProfileSchema,
  heroSchema,
  legalRichTextSchema,
  materialsQualitySchema,
  portfolioGallerySchema,
  portfolioTeaserSchema,
  processStepsSchema,
  richTextSchema,
  serviceGridSchema,
  statisticsSchema,
  textWithMediaSchema,
} from './schemas';
import type { BlockData, BlockType, TemplateId } from './union';

/**
 * The block registry.
 *
 * Deliberately data-only — no React components. Render components live in
 * `./render` and editor components in `./editor`, so the public bundle never
 * pulls in the admin editor, and this module stays importable from anywhere
 * (server, client, seed scripts, tests).
 *
 * Adding a block type is: a schema, an entry here, a render component and an
 * editor component. No existing page, migration or query is touched — blocks
 * are JSONB, and a document simply never references a type it does not use.
 */
export type BlockDefinition<T extends BlockType> = {
  type: T;
  /** Shown in the admin "add block" palette. */
  label: Record<Locale, string>;
  description: Record<Locale, string>;
  schema: z.ZodType<BlockData<T>>;
  /** '*' means every template. */
  allowedOn: readonly TemplateId[] | '*';
  maxPerPage?: number;
  /** Blocks the owner should not be able to remove from a system page. */
  structural?: boolean;
};

type Registry = { [K in BlockType]: BlockDefinition<K> };

export const BLOCK_REGISTRY: Registry = {
  hero: {
    type: 'hero',
    label: { ru: 'Обложка', es: 'Portada', en: 'Hero' },
    description: {
      ru: 'Заголовок страницы. Вариант с фото — только для главной.',
      es: 'Cabecera de la página. La variante con foto es solo para la portada.',
      en: 'Page header. The photo variant is for the home page only.',
    },
    schema: heroSchema as z.ZodType<BlockData<'hero'>>,
    allowedOn: ['home', 'service', 'portfolio_index', 'about', 'contact', 'legal', 'thanks'],
    maxPerPage: 1,
    structural: true,
  },
  rich_text: {
    type: 'rich_text',
    label: { ru: 'Текст', es: 'Texto', en: 'Text' },
    description: {
      ru: 'Форматированный текст: абзацы, списки, ссылки.',
      es: 'Texto con formato: párrafos, listas, enlaces.',
      en: 'Formatted text: paragraphs, lists, links.',
    },
    schema: richTextSchema as z.ZodType<BlockData<'rich_text'>>,
    allowedOn: '*',
  },
  text_with_media: {
    type: 'text_with_media',
    label: { ru: 'Текст с изображением', es: 'Texto con imagen', en: 'Text with image' },
    description: {
      ru: 'Две колонки: текст и фотография.',
      es: 'Dos columnas: texto y fotografía.',
      en: 'Two columns: copy and a photograph.',
    },
    schema: textWithMediaSchema as z.ZodType<BlockData<'text_with_media'>>,
    allowedOn: '*',
  },
  service_grid: {
    type: 'service_grid',
    label: { ru: 'Сетка направлений', es: 'Cuadrícula de servicios', en: 'Service grid' },
    description: {
      ru: 'Категории карточками. Может брать список из таксономии услуг.',
      es: 'Categorías en tarjetas. Puede tomar la lista de la taxonomía de servicios.',
      en: 'Categories as cards. Can pull its list from the service taxonomy.',
    },
    schema: serviceGridSchema as z.ZodType<BlockData<'service_grid'>>,
    allowedOn: ['home', 'service', 'about'],
  },
  portfolio_teaser: {
    type: 'portfolio_teaser',
    label: { ru: 'Избранные работы', es: 'Proyectos destacados', en: 'Selected work' },
    description: {
      ru: 'Подборка проектов: вручную, последние или избранные.',
      es: 'Selección de proyectos: manual, recientes o destacados.',
      en: 'A selection of projects: manual, latest or featured.',
    },
    schema: portfolioTeaserSchema as z.ZodType<BlockData<'portfolio_teaser'>>,
    allowedOn: ['home', 'service', 'about', 'project'],
  },
  portfolio_gallery: {
    type: 'portfolio_gallery',
    label: { ru: 'Галерея', es: 'Galería', en: 'Gallery' },
    description: {
      ru: 'Фотографии проекта с подписями.',
      es: 'Fotografías del proyecto con pies de foto.',
      en: 'Project photographs with captions.',
    },
    schema: portfolioGallerySchema as z.ZodType<BlockData<'portfolio_gallery'>>,
    allowedOn: ['project', 'service'],
  },
  materials_quality: {
    type: 'materials_quality',
    label: { ru: 'Материалы и качество', es: 'Materiales y calidad', en: 'Materials & quality' },
    description: {
      ru: 'Бренды материалов и фурнитуры. Логотипы — только с разрешения.',
      es: 'Marcas de materiales y herrajes. Logotipos solo con permiso.',
      en: 'Material and hardware brands. Logos only with permission.',
    },
    schema: materialsQualitySchema as z.ZodType<BlockData<'materials_quality'>>,
    allowedOn: ['home', 'service', 'about'],
  },
  process_steps: {
    type: 'process_steps',
    label: { ru: 'Этапы работы', es: 'Cómo trabajamos', en: 'How it works' },
    description: {
      ru: 'Последовательность: замер → изготовление → доставка → установка.',
      es: 'Secuencia: medición → fabricación → entrega → instalación.',
      en: 'Sequence: measuring → manufacturing → delivery → installation.',
    },
    schema: processStepsSchema as z.ZodType<BlockData<'process_steps'>>,
    allowedOn: ['home', 'service', 'about'],
  },
  statistics: {
    type: 'statistics',
    label: { ru: 'Цифры', es: 'Cifras', en: 'Figures' },
    description: {
      ru: 'Ключевые показатели. Указывайте только проверяемые факты.',
      es: 'Indicadores clave. Solo hechos verificables.',
      en: 'Key figures. Verifiable facts only.',
    },
    schema: statisticsSchema as z.ZodType<BlockData<'statistics'>>,
    allowedOn: '*',
  },
  founder_profile: {
    type: 'founder_profile',
    label: { ru: 'Основатель', es: 'Fundador', en: 'Founder' },
    description: {
      ru: 'О компании: текст, цифры и портрет основателя.',
      es: 'Sobre el estudio: texto, cifras y retrato del fundador.',
      en: 'About the studio: copy, figures and the founder portrait.',
    },
    schema: founderProfileSchema as z.ZodType<BlockData<'founder_profile'>>,
    allowedOn: ['home', 'about'],
    maxPerPage: 1,
  },
  cta_banner: {
    type: 'cta_banner',
    label: { ru: 'Призыв к действию', es: 'Llamada a la acción', en: 'Call to action' },
    description: {
      ru: 'Полоса с кнопкой: расчёт, замер или WhatsApp.',
      es: 'Banda con botón: presupuesto, medición o WhatsApp.',
      en: 'A band with a button: quote, measurement or WhatsApp.',
    },
    schema: ctaBannerSchema as z.ZodType<BlockData<'cta_banner'>>,
    allowedOn: '*',
  },
  contact_block: {
    type: 'contact_block',
    label: { ru: 'Контакты', es: 'Contacto', en: 'Contact' },
    description: {
      ru: 'Тёмная секция с телефоном, соцсетями и географией работ.',
      es: 'Sección oscura con teléfono, redes y zona de trabajo.',
      en: 'Dark section with phone, social links and service area.',
    },
    schema: contactBlockSchema as z.ZodType<BlockData<'contact_block'>>,
    allowedOn: '*',
    maxPerPage: 1,
  },
  faq: {
    type: 'faq',
    label: { ru: 'Вопросы и ответы', es: 'Preguntas frecuentes', en: 'FAQ' },
    description: {
      ru: 'Раскрывающиеся вопросы. Разметку FAQPage включайте только для настоящих FAQ.',
      es: 'Preguntas desplegables. Active el marcado FAQPage solo si son FAQ reales.',
      en: 'Collapsible questions. Enable FAQPage markup only for genuine FAQs.',
    },
    schema: faqSchema as z.ZodType<BlockData<'faq'>>,
    allowedOn: '*',
  },
  legal_rich_text: {
    type: 'legal_rich_text',
    label: { ru: 'Юридический текст', es: 'Texto legal', en: 'Legal text' },
    description: {
      ru: 'Политика конфиденциальности и cookie. Требует юридической проверки.',
      es: 'Política de privacidad y cookies. Requiere revisión legal.',
      en: 'Privacy and cookie policy. Requires legal review.',
    },
    schema: legalRichTextSchema as z.ZodType<BlockData<'legal_rich_text'>>,
    allowedOn: ['legal'],
  },
};

/** Which block types an editor may add to a given template. */
export function blocksAllowedOn(template: TemplateId): BlockDefinition<BlockType>[] {
  return (Object.values(BLOCK_REGISTRY) as BlockDefinition<BlockType>[]).filter(
    (definition) => definition.allowedOn === '*' || definition.allowedOn.includes(template),
  );
}

export function isKnownBlockType(type: string): type is BlockType {
  return type in BLOCK_REGISTRY;
}
