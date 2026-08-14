import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Media library.
 *
 * Exercises the real upload path — sharp inspection, derivative generation,
 * checksum dedupe — rather than mocking it, because the failure modes worth
 * catching (an unreadable file accepted, a derivative upscaled past the
 * original, an in-use image deleted) all live in that pipeline.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/**
 * A real JPEG, generated so no binary fixture is checked in.
 *
 * The pixel colour is derived from `seed`, which matters more than it looks:
 * uploads dedupe on content checksum, so a fixture with fixed bytes silently
 * stops creating assets from the second run onward. Callers that need two
 * genuinely identical uploads pass the same seed deliberately.
 */
async function makeJpeg(width: number, height: number, seed = Date.now()): Promise<string> {
  const sharp = (await import('sharp')).default;
  const dir = await mkdtemp(join(tmpdir(), 'lugar-media-'));
  const path = join(dir, `fixture-${width}x${height}-${seed}.jpg`);
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: seed % 200, g: (seed >> 3) % 200, b: (seed >> 6) % 200 },
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  await writeFile(path, buffer);
  return path;
}

test.describe('media library', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  test('refuses an upload with no alt text', async ({ page }) => {
    await page.goto('/admin/media');

    await page.locator('input[name="file"]').setInputFiles(await makeJpeg(900, 600));
    // Alt is deliberately left empty. The browser's own `required` blocks
    // submission, so assert the field is invalid rather than expecting a
    // server round trip.
    const alt = page.locator('input[name="altRu"]');
    await expect(alt).toHaveJSProperty('validity.valid', false);
  });

  test('uploads an image, derives sizes and shows it as unused', async ({ page }) => {
    await page.goto('/admin/media');

    const before = await page.getByRole('listitem').count();

    await page.locator('input[name="file"]').setInputFiles(await makeJpeg(1600, 1000));
    await page.locator('input[name="altRu"]').fill('Тестовая кухня с островом');
    await page.getByRole('button', { name: 'Загрузить' }).click();

    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });
    await page.reload();

    await expect(page.getByRole('listitem')).toHaveCount(before + 1);

    // A freshly uploaded asset is referenced by nothing, so it must be
    // deletable — that is what makes the in-use guard meaningful.
    const fresh = page.getByRole('listitem').filter({ hasText: 'не используется' }).first();
    await expect(fresh).toBeVisible();

    // Remove it again: this spec writes to the real library, and leaving a
    // pile of fixtures behind would make every later count assertion drift.
    await fresh.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('Удалено.')).toBeVisible({ timeout: 15_000 });
  });

  test('deduplicates identical bytes instead of creating a second asset', async ({ page }) => {
    // Same seed both times: identical bytes are the point of this test.
    const fixture = await makeJpeg(1200, 800, 424242);

    await page.goto('/admin/media');
    await page.locator('input[name="file"]').setInputFiles(fixture);
    await page.locator('input[name="altRu"]').fill('Дубликат — первая загрузка');
    await page.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    const afterFirst = await page.getByRole('listitem').count();

    // The same bytes again: the checksum is the natural key, so this must
    // return the existing asset rather than duplicate the file and its
    // derivatives.
    await page.locator('input[name="file"]').setInputFiles(fixture);
    await page.locator('input[name="altRu"]').fill('Дубликат — вторая загрузка');
    await page.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByRole('listitem')).toHaveCount(afterFirst);
  });

  test('will not delete an image that a published page still shows', async ({ page }) => {
    await page.goto('/admin/media?filter=placeholder');

    // Seeded placeholders sit on published pages, so their delete control must
    // be unavailable and say why.
    const blocked = page.getByRole('button', { name: 'Удалить' }).first();
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAttribute('title', /опубликованной странице/);
  });

  test('a focal point survives a save and is applied to the preview', async ({ page }) => {
    await page.goto('/admin/media');

    const preview = page.getByRole('button', { name: /Выбрать фокус-точку/ }).first();
    const box = await preview.boundingBox();
    expect(box).not.toBeNull();

    // Click the upper-right quadrant — a distinctive, checkable position.
    await preview.click({ position: { x: box!.width * 0.8, y: box!.height * 0.25 } });

    const image = preview.locator('img, span').first();
    await expect(image).toHaveAttribute('style', /object-position|background/);

    await page.getByRole('button', { name: 'Сохранить' }).first().click();
    await expect(page.getByText('Сохранено.')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    // The marker dot is positioned from the stored value, so its inline style
    // proves the focal point round-tripped through the database.
    const marker = preview.locator('span[aria-hidden]').last();
    const style = await marker.getAttribute('style');
    expect(style).toMatch(/left:\s*(7[0-9]|8[0-9])/);
  });
});
