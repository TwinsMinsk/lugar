import { expect, test, type Page } from '@playwright/test';

/**
 * The M3 acceptance path: a non-technical owner changes a heading, publishes,
 * sees it live, and rolls it back — without a developer.
 *
 * Credentials come from the environment so no password is ever committed. The
 * suite skips rather than fails when they are absent, because a missing local
 * secret is a setup gap, not a regression.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('admin', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  test('rejects a wrong password without revealing whether the account exists', async ({
    browser,
  }) => {
    // A fresh context: the suite is otherwise pre-authenticated, and a signed-in
    // visitor is redirected away from the login form.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Пароль').fill('wrong-password-entirely');
    await page.getByRole('button', { name: 'Войти' }).click();

    // Next's route announcer is also role="alert", so scope to the form.
    const message = page.locator('form').getByRole('alert');
    await expect(message).toBeVisible();
    // Identical wording for unknown account and wrong password: distinguishing
    // them turns this form into an account-enumeration oracle.
    await expect(message).toHaveText('Неверный email или пароль.');
    await expect(page).toHaveURL(/\/admin\/login/);
    await context.close();
  });

  test('an owner can edit a heading, publish it, see it live and roll it back', async ({
    page,
  }) => {
    const marker = `Проверка ${Date.now()}`;

    // Already authenticated by the setup project.
    // Open the home page in the editor.
    await page.goto('/admin/pages');
    await page.getByRole('link', { name: 'home' }).click();
    await expect(page.getByRole('heading', { name: /home/i })).toBeVisible();

    // The hero block is expanded by default; change its heading.
    // Exact match is essential: "Надзаголовок" contains "Заголовок", so a
    // substring match would silently edit the eyebrow instead.
    const heading = page.getByLabel('Заголовок', { exact: true }).first();
    const original = await heading.inputValue();
    expect(original.length).toBeGreaterThan(0);
    await heading.fill(marker);

    await page.getByRole('button', { name: 'Опубликовать RU' }).click();
    await expect(page.getByText(/Опубликовано \(RU\)/)).toBeVisible({ timeout: 15_000 });

    // The change must be live on the public site.
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText(marker);

    // Roll back to the revision that preceded it.
    await page.goto('/admin/pages');
    await page.getByRole('link', { name: 'home' }).click();
    // The newest revision is the one currently live, so its rollback button is
    // deliberately disabled — restoring what is already served is a no-op.
    // Target the first *enabled* one, which is the preceding revision.
    const rollback = page.getByRole('button', { name: '↩ ru' }).and(page.locator(':enabled'));
    await rollback.first().click();
    await expect(page.getByText(/восстановлена \(RU\)/)).toBeVisible({ timeout: 15_000 });

    await page.goto('/');
    await expect(page.locator('h1')).not.toHaveText(marker);

    // Restore explicitly rather than relying on the rollback target. This spec
    // edits real seeded content, so leaving it mutated would poison both the
    // next run and anyone looking at the local site afterwards.
    await page.goto('/admin/pages');
    await page.getByRole('link', { name: 'home' }).click();
    await page.getByLabel('Заголовок', { exact: true }).first().fill(original);
    await page.getByRole('button', { name: 'Опубликовать RU' }).click();
    await expect(page.getByText(/Опубликовано \(RU\)/)).toBeVisible({ timeout: 15_000 });

    await page.goto('/');
    await expect(page.locator('h1')).toHaveText(original);
  });

  test('a draft edit does not reach the public site until published', async ({ page }) => {
    const marker = `Черновик ${Date.now()}`;

    await page.goto('/admin/pages');
    await page.getByRole('link', { name: 'kontakty' }).click();

    await page.getByLabel('Заголовок', { exact: true }).first().fill(marker);
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await expect(page.getByText('Черновик сохранён')).toBeVisible({ timeout: 15_000 });

    await page.goto('/kontakty');
    // Saved, but never published — the public page must be unchanged.
    await expect(page.locator('h1')).not.toHaveText(marker);
  });
});

test.describe('draft preview', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  test('a draft is visible in preview, absent publicly, and never indexable', async ({ page }) => {
    const marker = `Превью ${Date.now()}`;

    await page.goto('/admin/pages');
    await page.getByRole('link', { name: 'dveri' }).click();

    await page.getByLabel('Заголовок', { exact: true }).first().fill(marker);
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await expect(page.getByText('Черновик сохранён')).toBeVisible({ timeout: 15_000 });

    // Public: unchanged, because nothing was published.
    await page.goto('/dveri');
    await expect(page.locator('h1')).not.toHaveText(marker);

    // Preview: the same URL now renders the draft.
    await page.goto('/api/preview?documentId=' + (await documentIdFromUrl(page)) + '&locale=ru');
    await expect(page.locator('h1')).toHaveText(marker);
    await expect(page.getByText('Черновик.')).toBeVisible();
    // A preview render must never be indexable, whatever the page's own setting.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    // Leaving draft mode returns the published page.
    await page.getByRole('link', { name: 'Выйти из черновика' }).click();
    await expect(page.locator('h1')).not.toHaveText(marker);
    await expect(page.getByText('Черновик.')).toBeHidden();
  });

  test('preview refuses an unsigned request from a stranger', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // No session and no token: the endpoint must not reveal that the document
    // exists, let alone enable draft mode.
    const response = await page.goto(
      '/api/preview?documentId=00000000-0000-4000-8000-000000000000&locale=ru',
    );
    expect(response?.status()).toBe(404);
    await context.close();
  });
});

/** Reads the document id out of the editor URL the test just visited. */
async function documentIdFromUrl(page: Page): Promise<string> {
  await page.goto('/admin/pages');
  const href = await page.getByRole('link', { name: 'dveri' }).getAttribute('href');
  return href!.split('/').pop()!;
}
