import { expect, test, type Page } from '@playwright/test';

import { live, LIVE } from './live';
import { ADMIN_STORAGE_STATE } from './storage-state';

/**
 * Portfolio.
 *
 * The acceptance question is narrow and important: can the owner put a real
 * project on the public site without a developer, and does the index stay
 * honest until they do?
 *
 * These specs create real documents and cannot fully remove them afterwards:
 * projects are archived rather than deleted, deliberately, so the revisions and
 * media usage rows that make rollback work are never destroyed. Adding a
 * hard-delete purely to tidy up after tests would weaken a decision that exists
 * for the owner's benefit. Clear them from a development database with:
 *
 *   npm run db:clean-test-projects
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/**
 * Publish RU, through the confirmation.
 *
 * The dialog exists because publishing is the one button on that screen whose
 * effect is outside it, and because it silently saves the draft first.
 */
async function publishRu(page: Page) {
  await page.getByRole('button', { name: 'Опубликовать RU' }).click();
  await page
    .getByRole('dialog', { name: 'Опубликовать RU?' })
    .getByRole('button', { name: 'Опубликовать' })
    .click();
}

test.describe('portfolio', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  // These share the portfolio index, so a count in one races a create in
  // another. Serial is a property of the fixture, not a flakiness patch.
  test.describe.configure({ mode: 'serial' });

  /**
   * Slugs this run put on the public site.
   *
   * A project left published by a failure is the one leftover that matters: an
   * archived draft is invisible to visitors, but a live one changes the public
   * index for every later run. Taking them down in afterAll runs whether the
   * test passed or failed.
   */
  const published: string[] = [];

  test.afterAll(async ({ browser }) => {
    if (published.length === 0) return;

    const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const page = await context.newPage();
    try {
      for (const slug of published) {
        await page.goto('/admin/portfolio');
        // Rows are labelled by title now, so the link is found through the
        // row that carries the address rather than by the slug itself.
        const link = page.getByRole('row').filter({ hasText: slug }).getByRole('link').first();
        if ((await link.count()) === 0) continue;
        await link.first().click();
        const takeDown = page.getByRole('button', { name: 'Снять со всех языков' });
        if (await takeDown.isEnabled().catch(() => false)) {
          await takeDown.click();
          await page.getByRole('button', { name: 'Снять', exact: true }).click();
          await expect(page.getByText('Проект снят с сайта.')).toBeVisible({ timeout: 15_000 });
        }
      }
    } finally {
      await context.close();
    }
  });

  test('a new project is a draft and does not reach the public index', async ({ page }) => {
    const slug = `test-proekt-${Date.now()}`;

    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Тестовый проект');
    await page.getByLabel('Адрес страницы').fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();

    // The action returns the id and the client navigates, so landing on the
    // editor is the signal that creation succeeded.
    await expect(page).toHaveURL(/\/admin\/portfolio\/[0-9a-f-]{36}$/);

    // Created unpublished: the public index must still show its empty state.
    await page.goto('/raboty');
    await expect(page.getByText('В этой категории пока нет работ.')).toBeVisible();
    await expect(page.locator(`a[href="/raboty/${slug}"]`)).toHaveCount(0);
  });

  test('rejects a slug that is already taken', async ({ page }) => {
    const slug = `dubl-${Date.now()}`;

    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Первый');
    await page.getByLabel('Адрес страницы').fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await expect(page).toHaveURL(/\/admin\/portfolio\/[0-9a-f-]{36}$/);

    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Второй');
    await page.getByLabel('Адрес страницы').fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();

    // The unique index on (kind, locale, slug) is what refuses this.
    await expect(page.locator('form').getByRole('alert')).toContainText('уже занят');
  });

  test('rejects a slug that is not URL-safe', async ({ page }) => {
    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Кухня');
    // Clear the auto-derived slug and type something invalid.
    await page.getByLabel('Адрес страницы').fill('Не Слаг!');
    await page.getByRole('button', { name: 'Создать проект' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('строчные латинские');
  });

  test('publishing a project puts it on the public index and its own page', async ({ page }) => {
    const slug = `opublikovannyy-${Date.now()}`;

    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Кухня в Марбелье');
    await page.getByLabel('Адрес страницы').fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await expect(page).toHaveURL(/\/admin\/portfolio\/[0-9a-f-]{36}$/);

    // Give it a cover so the index card is not an empty frame.
    await page.getByRole('button', { name: 'Выбрать' }).first().click();
    await page.getByRole('dialog', { name: 'Выбор изображения' }).waitFor();
    await page.getByRole('dialog').getByRole('button').nth(1).click();
    await page.getByRole('button', { name: 'Сохранить карточку' }).click();
    await expect(page.getByText('Карточка сохранена.')).toBeVisible({ timeout: 15_000 });

    await publishRu(page);
    await expect(page.getByText(/Опубликовано \(RU\)/)).toBeVisible({ timeout: 15_000 });
    published.push(slug);

    // The index now lists it, and the empty state is gone.
    const card = () => page.locator(`a[href="/raboty/${slug}"]`).count();
    await expect.poll(live(page, '/raboty', card), LIVE).toBeGreaterThan(0);
    await expect(page.getByText('В этой категории пока нет работ.')).toBeHidden();

    // And the project has its own crawlable page with exactly one h1.
    await expect
      .poll(
        live(page, `/raboty/${slug}`, () => page.locator('h1').count()),
        LIVE,
      )
      .toBe(1);
    await expect(page.locator('h1')).toHaveText('Кухня в Марбелье');

    // Take it down again. This both exercises "снять с сайта" and restores the
    // empty index — the public spec asserts on that state, and a published
    // fixture left behind would fail it from a different worker.
    await page.goBack();
    await page.goto('/admin/portfolio');
    await page.getByRole('row').filter({ hasText: slug }).getByRole('link').first().click();
    await page.getByRole('button', { name: 'Снять со всех языков' }).click();
    await page.getByRole('button', { name: 'Снять', exact: true }).click();
    await expect(page.getByText('Проект снят с сайта.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(live(page, '/raboty', card), LIVE).toBe(0);
    await expect(page.getByText('В этой категории пока нет работ.')).toBeVisible();
  });
  test('a project that has been on the site can be removed but not erased', async ({ page }) => {
    const slug = `opublikovannyy-ubrat-${Date.now()}`;

    await page.goto('/admin/portfolio');
    await page.getByLabel('Название').fill('Опубликованный проект');
    await page.getByLabel('Адрес страницы').fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await expect(page).toHaveURL(/\/admin\/portfolio\/[0-9a-f-]{36}$/);
    const documentId = page.url().split('/').pop()!;

    await publishRu(page);
    await expect(page.getByText(/Опубликовано \(RU\)/)).toBeVisible({ timeout: 15_000 });
    published.push(slug);

    // Preview works while it is published — otherwise the assertion after the
    // removal below would pass for the wrong reason.
    expect((await page.goto(`/api/preview?documentId=${documentId}&locale=ru`))?.status()).toBe(
      200,
    );
    await page.goto('/api/preview/exit');

    // Убрать: out of the working list, and off the site with it.
    await page.goto('/admin/portfolio');
    const liveTable = page.getByRole('table', { name: 'Проекты', exact: true });
    const row = liveTable.getByRole('row').filter({ hasText: slug });
    await row.getByRole('button', { name: 'Убрать' }).click();
    await row.getByRole('button', { name: 'Убрать' }).click();

    const archived = page
      .getByRole('table', { name: 'Убранные проекты' })
      .getByRole('row')
      .filter({ hasText: slug });
    await expect(archived).toHaveCount(1, { timeout: 15_000 });
    // It has been on the site, so the second level is not offered at all and
    // the reason takes its place.
    await expect(archived.getByRole('button', { name: 'Удалить навсегда' })).toHaveCount(0);
    await expect(archived).toContainText('была на сайте');

    // The public page and the shared preview link both go with it — those
    // links get sent to people.
    expect((await page.goto(`/raboty/${slug}`))?.status()).toBe(404);
    expect((await page.goto(`/api/preview?documentId=${documentId}&locale=ru`))?.status()).toBe(
      404,
    );

    await expect
      .poll(
        live(page, '/raboty', () => page.locator(`a[href="/raboty/${slug}"]`).count()),
        LIVE,
      )
      .toBe(0);
  });
});
