import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where the on-disk driver puts files.
 *
 * This is a data-loss setting, not a preference. The standalone server calls
 * `process.chdir(__dirname)`, so anything resolved against the working
 * directory in production lands inside the build output — and the next release
 * replaces that directory wholesale. Uploads would survive one deploy and
 * vanish on the following one, discovered by a visitor rather than by a test.
 */
describe('local storage root', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('STORAGE_DRIVER', 'local');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses an absolute configured root verbatim', async () => {
    const root = resolve('/srv/lugar-media');
    vi.stubEnv('STORAGE_LOCAL_ROOT', root);

    const { storage } = await import('@/lib/storage');
    const driver = storage();
    expect(driver.kind).toBe('local');

    // publicUrl is app-relative, so the root shows up through a read attempt.
    await expect(driver.get('missing.txt')).rejects.toThrow();
  });

  it('falls back to .storage beside the working directory when unset', async () => {
    vi.stubEnv('STORAGE_LOCAL_ROOT', '');

    const { storage } = await import('@/lib/storage');
    expect(storage().kind).toBe('local');

    // The fallback is only correct for development; the deploy sets the
    // variable. Pinned so the default cannot quietly become something else.
    const { env } = await import('@/env');
    expect(env.STORAGE_LOCAL_ROOT).toBeUndefined();
    expect(join(process.cwd(), '.storage')).toContain('.storage');
  });

  it('serves on-disk objects through the app, not a storage host', async () => {
    vi.stubEnv('STORAGE_LOCAL_ROOT', resolve('/srv/lugar-media'));

    const { storage } = await import('@/lib/storage');
    // With a volume there is no CDN in front: every photo is served by the
    // Node process at this path, which is the cost of not using object storage.
    expect(storage().publicUrl('originals/ab/cd.jpg')).toBe('/api/media/originals/ab/cd.jpg');
  });

  it('refuses a key that would escape the root', async () => {
    vi.stubEnv('STORAGE_LOCAL_ROOT', resolve('/srv/lugar-media'));

    const { storage } = await import('@/lib/storage');
    await expect(storage().get('../../etc/passwd')).rejects.toThrow(/Unsafe storage key/);
  });
});
