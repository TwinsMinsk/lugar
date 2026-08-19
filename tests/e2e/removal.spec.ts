import { expect, test, type Page } from '@playwright/test';

/**
 * Removal, in two levels.
 *
 * This exists because the owner could not delete a test project: the panel
 * offered "снять с сайта", which changes publication only, and the row stayed
 * in the list forever with its address permanently taken.
 *
 * The rules being asserted here are the ones that make the second level safe to
 * offer at all — it appears only inside the archive, and never for a record
 * that has been on the site.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function createProject(page: Page, slug: string, title = 'Тестовый проект') {
  await page.goto('/admin/portfolio');
  const titleField = page.getByLabel('Название');
  const slugField = page.getByLabel('Адрес страницы');

  /**
   * The address derives from the title in the browser, so waiting for that
   * derivation is how this waits for hydration.
   *
   * It matters: a value typed before React attaches is discarded when it does,
   * and the submit then runs as a native form GET that reloads the page and
   * creates nothing. Under a full parallel run this screen hydrates slowly
   * enough for that to happen, and the failure looks exactly like a broken
   * create action.
   */
  await expect(async () => {
    await titleField.fill(title);
    await expect(slugField).not.toHaveValue('', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await slugField.fill(slug);
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await expect(page).toHaveURL(/\/admin\/portfolio\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split('/').pop()!;
}

// Exact: "Убранные проекты" contains "Проекты", and the default substring
// match would make the live table locator resolve to both.
const liveTable = (page: Page) => page.getByRole('table', { name: 'Проекты', exact: true });
const archiveTable = (page: Page) => page.getByRole('table', { name: 'Убранные проекты' });

/** Takes the project out of the working list, through the inline confirmation. */
async function archive(page: Page, slug: string) {
  await page.goto('/admin/portfolio');
  const row = liveTable(page).getByRole('row').filter({ hasText: slug });
  await row.getByRole('button', { name: 'Убрать' }).click();
  // The trigger is replaced by the question and its own confirm button, so the
  // name is the same and the row scope is what disambiguates.
  await row.getByRole('button', { name: 'Убрать' }).click();
  await expect(archiveTable(page).getByRole('row').filter({ hasText: slug })).toHaveCount(1, {
    timeout: 15_000,
  });
}

test.describe('removal', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  // They all read the same two lists on the same screen.
  test.describe.configure({ mode: 'serial' });

  test('a project leaves the working list and can be brought back', async ({ page }) => {
    const slug = `test-proekt-ubrat-${Date.now()}`;
    await createProject(page, slug);

    await archive(page, slug);
    await expect(liveTable(page).getByRole('row').filter({ hasText: slug })).toHaveCount(0);

    await archiveTable(page)
      .getByRole('row')
      .filter({ hasText: slug })
      .getByRole('button', { name: 'Вернуть' })
      .click();

    await expect(liveTable(page).getByRole('row').filter({ hasText: slug })).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(archiveTable(page).getByRole('row').filter({ hasText: slug })).toHaveCount(0);
  });

  test('the address stays occupied while the project is only archived', async ({ page }) => {
    const slug = `test-proekt-adres-${Date.now()}`;
    await createProject(page, slug);
    await archive(page, slug);

    await page.goto('/admin/portfolio');
    const titleField = page.getByLabel('Название');
    const slugField = page.getByLabel('Адрес страницы');
    await expect(async () => {
      await titleField.fill('Второй');
      await expect(slugField).not.toHaveValue('', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await slugField.fill(slug);
    await page.getByRole('button', { name: 'Создать проект' }).click();

    // Naming the archive is the whole point: a bare "address is taken" would
    // send the owner searching a list that cannot contain the culprit.
    await expect(page.locator('form').getByRole('alert')).toContainText('убранным проектом');
  });

  test('a project that was never published can be deleted for good', async ({ page }) => {
    const slug = `test-proekt-navsegda-${Date.now()}`;
    await createProject(page, slug);
    await archive(page, slug);

    const row = archiveTable(page).getByRole('row').filter({ hasText: slug });
    await row.getByRole('button', { name: 'Удалить навсегда' }).click();

    const dialog = page.getByRole('dialog', { name: 'Удалить навсегда?' });
    await expect(dialog).toBeVisible();
    // Cancel takes the focus, so Enter never confirms a destructive action.
    await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Удалить навсегда' }).click();

    await expect(row).toHaveCount(0, { timeout: 15_000 });
    await expect(liveTable(page).getByRole('row').filter({ hasText: slug })).toHaveCount(0);

    // And the address is free again — which is the difference between the two
    // levels, stated as a test rather than as a comment.
    await createProject(page, slug, 'Переиспользованный адрес');
  });
});
