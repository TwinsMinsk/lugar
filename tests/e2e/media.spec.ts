import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

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

const library = (page: Page) => page.getByRole('list', { name: 'Фотографии' });
const archive = (page: Page) => page.getByRole('list', { name: 'Убранные изображения' });

test.describe('media library', () => {
  // These specs upload to and delete from the *same* library, so a count
  // assertion in one races an upload in another. Serial execution is a
  // property of the fixture, not a workaround for flakiness.
  test.describe.configure({ mode: 'serial' });

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
    // Named per run, and asserted on by name rather than by the library's total.
    // Pictures now arrive from the media picker too, so a count of everything
    // measures whatever else the suite happens to be uploading at that moment.
    const alt = `Тестовая кухня с островом ${Date.now()}`;

    await page.goto('/admin/media');

    await page.locator('input[name="file"]').setInputFiles(await makeJpeg(1600, 1000));
    await page.locator('input[name="altRu"]').fill(alt);
    await page.getByRole('button', { name: 'Загрузить' }).click();

    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });
    await page.reload();

    // A freshly uploaded asset is referenced by nothing, so it must be
    // deletable — that is what makes the in-use guard meaningful.
    const fresh = library(page)
      .getByRole('listitem')
      .filter({ has: page.locator(`input[value="${alt}"]`) });
    await expect(fresh).toHaveCount(1);
    await expect(fresh).toContainText('не используется');

    // Remove it again: this spec writes to the real library, and leaving a
    // pile of fixtures behind would make every later count assertion drift.
    // Both levels, so the fixture leaves nothing at all behind — and so the
    // permanent removal is exercised on something nothing references.
    await fresh.getByRole('button', { name: 'Убрать' }).click();
    const confirm = page.getByRole('dialog', { name: 'Убрать изображение?' });
    await expect(confirm.getByRole('button', { name: 'Отмена' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Убрать' }).click();
    await expect(page.getByText('Изображение убрано.')).toBeVisible({ timeout: 15_000 });

    const removed = archive(page).getByRole('listitem').filter({ hasText: alt }).first();
    await removed.getByRole('button', { name: 'Удалить навсегда' }).click();
    await page
      .getByRole('dialog', { name: 'Удалить навсегда?' })
      .getByRole('button', { name: 'Удалить навсегда' })
      .click();
    await expect(page.getByText('Изображение удалено навсегда.')).toBeVisible({ timeout: 15_000 });
  });

  test('deduplicates identical bytes instead of creating a second asset', async ({ page }) => {
    // Same seed both times: identical bytes are the point of this test.
    const fixture = await makeJpeg(1200, 800, 424242);

    await page.goto('/admin/media');
    await page.locator('input[name="file"]').setInputFiles(fixture);
    await page.locator('input[name="altRu"]').fill('Дубликат — первая загрузка');
    await page.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });

    // The same bytes again: the checksum is the natural key, so this must
    // return the existing asset rather than duplicate the file and its
    // derivatives.
    await page.locator('input[name="file"]').setInputFiles(fixture);
    await page.locator('input[name="altRu"]').fill('Дубликат — вторая загрузка');
    await page.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    // Asserted on the bytes rather than on the library's total: the second
    // upload kept the first one's description, which is what "the same asset
    // came back" looks like from here. A count of everything would instead be
    // measuring the rest of the suite.
    const items = library(page).getByRole('listitem');
    await expect(
      items.filter({ has: page.locator('input[value="Дубликат — первая загрузка"]') }),
    ).toHaveCount(1);
    await expect(
      items.filter({ has: page.locator('input[value="Дубликат — вторая загрузка"]') }),
    ).toHaveCount(0);
  });

  test('will not delete an image that a published page still shows', async ({ page }) => {
    await page.goto('/admin/media?filter=placeholder');

    // Seeded placeholders sit on published pages. The reason takes the place of
    // the control rather than sitting behind a disabled button: a greyed-out
    // button that never explains itself just gets clicked repeatedly.
    const card = library(page).getByRole('listitem').first();
    await expect(card).toContainText('стоит на опубликованной странице');
    await expect(card.getByRole('button', { name: 'Убрать' })).toHaveCount(0);
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
