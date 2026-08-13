import type { AnyBlock } from './union';

export type MediaUsageEntry = {
  assetId: string;
  blockId: string;
  fieldPath: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract every media reference in a block list.
 *
 * Walks the parsed structure looking for `mediaRef`-shaped objects rather than
 * hard-coding a path per block type. That means a new block type contributes
 * its media usage automatically — nobody has to remember to update a visitor,
 * which is exactly the kind of omission that later shows up as a published page
 * losing its photograph because the asset was considered unused.
 *
 * `fieldPath` is recorded so the admin can point at the precise field, e.g.
 * `blocks[2].source.items[0].media`.
 */
export function collectMediaUsage(blocks: AnyBlock[]): MediaUsageEntry[] {
  const found = new Map<string, MediaUsageEntry>();

  blocks.forEach((block, index) => {
    walk(block.data, `blocks[${index}]`, block.id, found);
  });

  return [...found.values()];
}

function walk(
  node: unknown,
  path: string,
  blockId: string,
  found: Map<string, MediaUsageEntry>,
): void {
  if (node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, blockId, found));
    return;
  }

  const record = node as Record<string, unknown>;

  // A mediaRef is the only shape carrying a bare `assetId` string.
  const assetId = record.assetId;
  if (typeof assetId === 'string' && UUID_RE.test(assetId)) {
    // Deduplicate on the primary key of media_usage: the same asset may
    // legitimately appear at several paths, but not twice at one path.
    found.set(`${blockId}::${path}`, { assetId, blockId, fieldPath: path });
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    walk(value, `${path}.${key}`, blockId, found);
  }
}

/** Distinct asset ids referenced anywhere in the block list. */
export function referencedAssetIds(blocks: AnyBlock[]): string[] {
  return [...new Set(collectMediaUsage(blocks).map((entry) => entry.assetId))];
}
