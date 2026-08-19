import { expect, test, type Page } from '@playwright/test';

/**
 * Invitations and roles.
 *
 * The claim worth proving is not that the form works — it is that a role is a
 * real boundary. A content editor is invited, signs in, and is refused CRM and
 * user administration by the *server*, not by a hidden menu item.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('users and invitations', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  // They share the user table, and sign-in is rate limited, so these must not
  // race each other.
  test.describe.configure({ mode: 'serial' });

  test('refuses an invitation token that does not exist', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto('/admin/invite/this-token-was-never-issued-000000000000');
    await page.getByLabel('Как вас зовут').fill('Никто');
    await page.getByLabel('Пароль').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Завершить' }).click();

    // Same message for wrong, expired, revoked and already-used, so probing
    // reveals nothing about which tokens exist.
    await expect(page.locator('form').getByRole('alert')).toContainText('недействительно');
    await context.close();
  });

  test('will not demote the last owner', async ({ page }) => {
    await page.goto('/admin/users');

    const ownerRow = page.getByRole('listitem').filter({ hasText: 'это вы' });
    // Choosing a role no longer applies it: an arrow key used to demote the
    // owner outright. The change is staged, then confirmed.
    await ownerRow.getByRole('combobox').selectOption('manager');
    await ownerRow.getByRole('button', { name: 'Применить' }).click();
    await page
      .getByRole('dialog', { name: 'Сменить роль?' })
      .getByRole('button', { name: 'Сменить роль' })
      .click();

    // An installation with no owner cannot invite anyone or change any setting,
    // and would need database access to recover.
    await expect(page.getByRole('alert').filter({ hasText: 'последний владелец' })).toBeVisible();

    await page.reload();
    await expect(ownerRow.getByRole('combobox')).toHaveValue('owner');
  });

  test('an invited editor gets in, and is refused what their role excludes', async ({
    page,
    browser,
  }) => {
    const email = `editor-${Date.now()}@example.test`;
    const password = 'redaktor-parol-12345';

    await page.goto('/admin/users');
    // Scope to the invite form: each user row also has a "Роль для …" select.
    const inviteForm = page.locator('form');
    await inviteForm.getByLabel('Email').fill(email);
    await inviteForm.getByLabel('Роль', { exact: true }).selectOption('content_editor');
    await inviteForm.getByRole('button', { name: 'Пригласить' }).click();

    // The link is shown whether or not email is configured, so a studio without
    // Resend can still grant access.
    const link = page.locator('code').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    const inviteUrl = (await link.textContent())!.trim();
    expect(inviteUrl).toContain('/admin/invite/');

    // Accept in a clean context — an invitee has no session.
    const invitee = await browser.newContext({ storageState: undefined });
    const inviteePage = await invitee.newPage();
    await inviteePage.goto(new URL(inviteUrl).pathname);
    await inviteePage.getByLabel('Как вас зовут').fill('Тестовый Редактор');
    await inviteePage.getByLabel('Пароль').fill(password);
    await inviteePage.getByRole('button', { name: 'Завершить' }).click();
    await expect(inviteePage.getByText('Теперь войдите с этим паролем')).toBeVisible({
      timeout: 15_000,
    });

    // The same token must not work twice.
    await inviteePage.goto(new URL(inviteUrl).pathname);
    await inviteePage.getByLabel('Как вас зовут').fill('Дубликат');
    await inviteePage.getByLabel('Пароль').fill(password);
    await inviteePage.getByRole('button', { name: 'Завершить' }).click();
    await expect(inviteePage.locator('form').getByRole('alert')).toBeVisible();

    await signIn(inviteePage, email, password);

    // Content is theirs.
    await inviteePage.goto('/admin/pages');
    await expect(inviteePage.getByRole('heading', { name: 'Страницы' })).toBeVisible();

    // CRM, settings and user administration are not. The refusal comes from
    // the server, so navigating straight to the URL does not get around it.
    //
    // Asserted on *content*, not status: the guard runs inside the streamed
    // part of the response, so the 200 shell has already been flushed by the
    // time it throws. What matters is that none of the protected content
    // reaches the page — a 200 carrying a not-found body leaks nothing.
    await inviteePage.goto('/admin/users');
    await expect(inviteePage.getByRole('heading', { name: 'Пригласить сотрудника' })).toHaveCount(
      0,
    );

    await inviteePage.goto('/admin/settings');
    await expect(inviteePage.getByLabel('Instagram')).toHaveCount(0);

    // The CRM holds names and phone numbers. A content editor has no business
    // there, and the export route guards itself separately from the pages.
    await inviteePage.goto('/admin/leads');
    await expect(inviteePage.getByRole('heading', { name: 'Заявки' })).toHaveCount(0);
    const csv = await inviteePage.request.get('/api/admin/leads/export');
    expect(csv.status()).toBe(404);

    // And the navigation does not offer what they cannot reach.
    await inviteePage.goto('/admin');
    await expect(inviteePage.getByRole('link', { name: 'Сотрудники' })).toHaveCount(0);
    await expect(inviteePage.getByRole('link', { name: 'Заявки' })).toHaveCount(0);
    await expect(inviteePage.getByRole('link', { name: 'Настройки' })).toHaveCount(0);
    await expect(inviteePage.getByRole('link', { name: 'Страницы' })).toBeVisible();

    await invitee.close();
  });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
