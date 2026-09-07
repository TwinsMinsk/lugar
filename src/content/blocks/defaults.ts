import { BLOCK_REGISTRY } from './registry';
import type { AnyBlock, BlockType } from './union';

/**
 * A new block's starting data.
 *
 * Hand-written per type, and it has to be: not one of the fourteen schemas
 * accepts `{}`. `localizedText` requires a non-empty Russian string after
 * trimming, so even a placeholder of `''` is rejected, and six of the schemas
 * carry arrays with a floor (`process_steps` needs two steps, `statistics`
 * two figures, `faq` one question). Deriving defaults from `.default()` would
 * produce something that cannot be saved.
 *
 * That matters more than it sounds. `saveDraft` validates the whole block list
 * and persists nothing if any block fails, so a palette that inserted an
 * invalid block would not just add a broken section — it would make the entire
 * page unsavable until the owner worked out which block to delete.
 *
 * The text is deliberately real Russian rather than "Lorem ipsum" or an empty
 * frame: the owner is going to publish this page, and copy that reads as
 * instructions is easier to spot and replace than copy that reads as nothing.
 */

type Localized = { ru: string };

const EMPTY_DOC = { type: 'doc', content: [] } as const;

function id(): string {
  return crypto.randomUUID();
}

function text(value: string): Localized {
  return { ru: value };
}

/**
 * Two block types cannot exist without a picture: `text_with_media` requires a
 * media reference, and `portfolio_gallery` requires at least one item that
 * carries one. The palette asks for an asset id up front rather than inserting
 * something unsavable, and hides those two entries while the library is empty.
 */
export const BLOCK_TYPES_NEEDING_MEDIA: readonly BlockType[] = [
  'text_with_media',
  'portfolio_gallery',
];

export function blockNeedsMedia(type: BlockType): boolean {
  return BLOCK_TYPES_NEEDING_MEDIA.includes(type);
}

export function defaultBlockData(type: BlockType, assetId: string | null): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return { heading: text('Заголовок') };

    case 'rich_text':
      return { content: { ru: EMPTY_DOC } };

    case 'text_with_media':
      return { heading: text('Заголовок'), media: { assetId } };

    case 'service_grid':
      // The `direction` arm pulls categories live from the CRM taxonomy, so it
      // needs no items — the `manual` arm would need at least one.
      return { heading: text('Услуги'), source: { mode: 'direction', direction: 'korpusnaya' } };

    case 'portfolio_teaser':
      return { heading: text('Наши работы'), source: { mode: 'latest' } };

    case 'portfolio_gallery':
      return { items: [{ id: id(), media: { assetId } }] };

    case 'materials_quality':
      return {
        heading: text('Материалы и качество'),
        brands: [{ id: id(), name: 'Название', kind: text('Тип') }],
      };

    case 'process_steps':
      return {
        heading: text('Как мы работаем'),
        steps: [
          { id: id(), name: text('Первый шаг') },
          { id: id(), name: text('Второй шаг') },
        ],
      };

    case 'statistics':
      return {
        items: [
          { id: id(), value: text('10'), label: text('Показатель') },
          { id: id(), value: text('20'), label: text('Показатель') },
        ],
      };

    case 'founder_profile':
      return {
        heading: text('О нас'),
        paragraphs: [text('Текст о студии.')],
        name: 'Имя',
        role: text('Должность'),
      };

    case 'cta_banner':
      return {
        heading: text('Заголовок'),
        primaryCta: { label: text('Получить расчёт'), target: { kind: 'form', form: 'calculate' } },
      };

    case 'contact_block':
      return { heading: text('Контакты') };

    case 'faq':
      return {
        heading: text('Вопросы и ответы'),
        items: [{ id: id(), question: text('Вопрос'), answer: { ru: EMPTY_DOC } }],
      };

    case 'legal_rich_text':
      return { heading: text('Заголовок'), content: { ru: EMPTY_DOC } };
  }
}

/**
 * A complete block, ready to append to a draft.
 *
 * Parsed through the type's own schema before being returned, so a default
 * that stops satisfying its schema fails here rather than at save time on the
 * owner's page — and `.default()` values (tone, columns, aspect) are filled in
 * by the parse rather than repeated above.
 */
export function createBlock(type: BlockType, assetId: string | null): AnyBlock {
  const parsed = BLOCK_REGISTRY[type].schema.safeParse(defaultBlockData(type, assetId));
  if (!parsed.success) {
    throw new Error(`Default data for block "${type}" does not satisfy its own schema`);
  }
  return { id: id(), type, data: parsed.data } as AnyBlock;
}
