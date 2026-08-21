import type { z } from 'zod';

/**
 * Discovering the image slots inside a block.
 *
 * The text side of the editor walks the *value* and recognises localised
 * strings by their shape. That approach cannot work for images: a brand with no
 * logo yet has no `logo` key at all, and an unfilled slot is precisely the one
 * the owner came to fill. Walking the value would offer a picker only where a
 * picture already exists.
 *
 * So this walks the *schema* instead, following the value alongside it only to
 * learn how many items each list holds and what is already chosen. Slots are
 * found by the `media: true` marker on `mediaRef`, so a new block type gets its
 * pickers for free — the same bargain the text fields already have.
 */
export type MediaSlot = {
  /** Dot/bracket path into the block's data, e.g. `brands[0].logo`. */
  path: string;
  label: string;
  /** Currently chosen asset, or null when the slot is empty. */
  assetId: string | null;
  /**
   * Whether the schema allows clearing it. Offering "remove" on a required slot
   * would build a block that cannot be saved.
   */
  optional: boolean;
};

type AnyDef = {
  type?: string;
  shape?: Record<string, unknown>;
  element?: unknown;
  innerType?: unknown;
};

function defOf(schema: unknown): AnyDef | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const holder = schema as { def?: AnyDef; _def?: AnyDef };
  return holder.def ?? holder._def;
}

function metaOf(schema: unknown): Record<string, unknown> | undefined {
  const holder = schema as { meta?: () => Record<string, unknown> | undefined };
  return typeof holder?.meta === 'function' ? holder.meta() : undefined;
}

/**
 * Strip the wrappers that do not change the shape — `optional`, `nullable`,
 * `default` — and report whether any of them made the slot droppable.
 */
function unwrap(schema: unknown): { node: unknown; optional: boolean } {
  let node = schema;
  let optional = false;

  // Wrappers nest, so keep peeling: `.optional().default()` is one slot.
  for (let guard = 0; guard < 10; guard += 1) {
    const def = defOf(node);
    const type = def?.type;
    if (type === 'optional' || type === 'nullable' || type === 'nullish') {
      optional = true;
      node = def?.innerType;
      continue;
    }
    if (type === 'default' || type === 'prefault' || type === 'catch') {
      node = def?.innerType;
      continue;
    }
    break;
  }

  return { node, optional };
}

const LABELS: Record<string, string> = {
  media: 'Изображение',
  logo: 'Логотип',
  cover: 'Обложка',
  image: 'Изображение',
  background: 'Фон',
};

function labelFor(path: string): string {
  const segments = path.replace(/\[\d+\]/g, '').split('.');
  const last = segments[segments.length - 1] ?? path;
  const base = LABELS[last] ?? 'Изображение';
  // Keep the index visible so repeated items stay distinguishable.
  const index = /\[(\d+)\]/.exec(path);
  return index ? `${base} · ${Number(index[1]) + 1}` : base;
}

export function collectMediaSlots(schema: z.ZodType, data: unknown): MediaSlot[] {
  const found: MediaSlot[] = [];

  const walk = (node: unknown, value: unknown, path: string, optional: boolean) => {
    const unwrapped = unwrap(node);
    const inner = unwrapped.node;
    const isOptional = optional || unwrapped.optional;

    if (metaOf(inner)?.media === true) {
      const ref = value as { assetId?: unknown } | undefined | null;
      const assetId = typeof ref?.assetId === 'string' ? ref.assetId : null;
      found.push({ path, label: labelFor(path), assetId, optional: isOptional });
      return;
    }

    const def = defOf(inner);

    if (def?.type === 'object' && def.shape) {
      for (const [key, child] of Object.entries(def.shape)) {
        const childValue = (value as Record<string, unknown> | undefined)?.[key];
        walk(child, childValue, path ? `${path}.${key}` : key, false);
      }
      return;
    }

    if (def?.type === 'array') {
      // Only real items get a slot — there is nothing to attach a picture to on
      // a list entry that does not exist yet.
      if (!Array.isArray(value)) return;
      value.forEach((item, index) => walk(def.element, item, `${path}[${index}]`, false));
    }
  };

  walk(schema, data, '', false);
  return found;
}
