import { getMediaAssets } from '@/data/public/media';
import { getSiteSettings } from '@/data/public/settings';
import { mediaUrl } from '@/components/ui/media-image';
import type { BrandLogo } from '@/components/layout/logo';

/**
 * The uploaded logo, or nothing.
 *
 * One read shared by the header, the footer and the mobile menu — all three
 * render the wordmark, and all three have to agree. Returns null while the
 * setting is empty or points at a placeholder, which is the honest state
 * before the owner uploads anything: the text treatment is what shows.
 */
export async function brandLogo(): Promise<BrandLogo | null> {
  const settings = await getSiteSettings();
  const assetId = settings.brand.logoAssetId;
  if (!assetId) return null;

  const asset = (await getMediaAssets([assetId])).get(assetId);
  if (!asset || asset.isPlaceholder) return null;

  return { url: mediaUrl(asset), width: asset.width, height: asset.height };
}
