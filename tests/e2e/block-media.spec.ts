import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ADMIN_STORAGE_STATE } from './storage-state';
import { live, LIVE } from './live';

/**
 * Attaching a picture to a block, end to end.
 *
 * The block editor discovers its text fields by walking the block's *value*,
 * which works because a heading is always there to be found. Images are the
 * opposite case: the slot the owner needs is the empty one, and an unset
 * optional field has no value to walk to. Until the editor learned to read the
 * schema, six media fields across the block types — brand logos among them —
 * existed in the data model with no way to fill them from the admin at all.
 *
 * So this covers the whole chain rather than the picker alone: upload a real
 * file, choose it for a slot that started empty, publish, and read the public
 * page to confirm a picture is what a visitor gets.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/** A real JPEG, generated so no binary fixture is checked in. */
async function makeJpeg(seed: number): Promise<string> {
  const sharp = (await import('sharp')).default;
  const dir = await mkdtemp(join(tmpdir(), 'lugar-logo-'));
  const path = join(dir, `logo-${seed}.jpg`);
  const buffer = await sharp({
    create: {
      width: 600,
      height: 200,
      channels: 3,
      // Uploads dedupe on checksum, so the colour has to vary per run or the
      // second run silently reuses the first run's asset.
      background: { r: seed % 200, g: (seed >> 3) % 200, b: (seed >> 6) % 200 },
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  await writeFile(path, buffer);
  return path;
}

async function publishRu(page: Page) {
  await page.getByRole('button', { name: 'Опубликовать RU' }).click();
  await page
    .getByRole('dialog', { name: 'Опубликовать RU?' })
    .getByRole('button', { name: 'Опубликовать' })
    .click();
  await expect(page.getByText(/Опубликовано \(RU\)/)).toBeVisible({ timeout: 15_000 });
}

/** Opens the home page in the editor and expands the materials block. */
async function openMaterialsBlock(page: Page) {
  await page.goto('/admin/pages');
  await page.getByRole('link', { name: 'Главная', exact: true }).click();
  // Exact: the move buttons carry the block's name in their aria-label too.
  await page.getByRole('button', { name: 'Материалы и качество', exact: true }).click();
}

/** How many pictures the materials section shows to a visitor. */
async function liveLogoCount(page: Page): Promise<number> {
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /Материалы, которые служат/ }) });
  return section.locator('img').count();
}

test.describe('block media', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  test.afterAll(async ({ browser }, testInfo) => {
    // Put the seeded block back: this spec publishes to the same site the rest
    // of the suite reads. A page opened straight off the browser inherits none
    // of the project's `use` options, so baseURL has to be handed over.
    const page = await browser.newPage({
      storageState: ADMIN_STORAGE_STATE,
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      await openMaterialsBlock(page);
      const remove = page.getByRole('button', { name: 'Убрать' });
      while ((await remove.count()) > 0) await remove.first().click();
      await publishRu(page);
    } finally {
      await page.close();
    }
  });

  test('an owner can put a logo on a brand that had none', async ({ page }) => {
    const seed = Date.now();
    const alt = `Логотип для теста ${seed}`;

    // 1. A real file through the real upload path.
    await page.goto('/admin/media');
    await page.locator('input[name="file"]').setInputFiles(await makeJpeg(seed));
    await page
      .getByLabel(/Описание/)
      .first()
      .fill(alt);
    await page.getByRole('button', { name: 'Загрузить' }).click();
    // The library renders its thumbnails with an empty alt, inside the
    // focal-point button — the status line is what confirms the upload landed.
    await expect(page.getByText('Изображение загружено.')).toBeVisible({ timeout: 30_000 });

    // 2. The slot exists at all. This is the regression: brand logos are
    //    optional and unset, so a value-walking editor offered nothing here.
    await openMaterialsBlock(page);
    const slot = page.getByText('Логотип · 1', { exact: true });
    await expect(slot, 'the empty logo slot must be offered').toBeVisible();

    // 3. Choose the uploaded picture for it.
    await page.getByRole('button', { name: 'Выбрать' }).first().click();
    const chooser = page.getByRole('dialog', { name: 'Выбор изображения' });
    await chooser.getByRole('button', { name: alt }).click();
    // The picker's own state is the honest signal: the announcement lives in an
    // sr-only live region, which is a weak thing to assert visibility on.
    await expect(page.getByRole('button', { name: 'Заменить' }).first()).toBeVisible();

    await publishRu(page);

    // 4. What a visitor actually gets.
    await expect
      .poll(
        live(page, '/', () => liveLogoCount(page)),
        LIVE,
      )
      .toBeGreaterThan(0);
  });
});
