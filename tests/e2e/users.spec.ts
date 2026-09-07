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

  test('an invited editor gets in, is refused what their role excludes, and is signed out when banned', async ({
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

    // Disabling access ends the session that is already open.
    //
    // The distinction this asserts is the whole point: a ban that only sets a
    // flag leaves whoever holds the current cookie signed in, and the panel
    // answers them with a not-found body rather than the login screen. The
    // redirect is what proves the session itself is gone — the reason to
    // press this button is usually that the credential is in the wrong hands,
    // and "they cannot see anything until their cookie expires" is not the
    // same promise as "they are out".
    //
    // Reloaded first: the owner's list was rendered before this account existed.
    await page.goto('/admin/users');
    const row = page.getByRole('listitem').filter({ hasText: email });
    await row.getByRole('button', { name: 'Отключить доступ' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Отключить доступ' }).click();
    await expect(row.getByText('доступ отключён')).toBeVisible({ timeout: 15_000 });

    await inviteePage.goto('/admin/pages');
    await expect(inviteePage).toHaveURL(/\/admin\/login/);

    await invitee.close();
  });

  /**
   * Password recovery, both halves of it.
   *
   * Until this shipped there was no way to change a password anywhere in the
   * panel — the bootstrap script told the operator to do it "in the panel",
   * and the panel could not. Proven on a throwaway invited account rather than
   * on the owner: changing the owner's password would invalidate the storage
   * state every other admin spec reuses.
   */
  test('an editor changes their own password, and the owner can set one for them', async ({
    page,
    browser,
  }) => {
    const email = `pw-${Date.now()}@example.test`;
    const first = 'pervyi-parol-12345';
    const second = 'vtoroi-parol-67890';
    const third = 'tretii-parol-abcdef';

    await page.goto('/admin/users');
    const inviteForm = page.locator('form');
    await inviteForm.getByLabel('Email').fill(email);
    await inviteForm.getByLabel('Роль', { exact: true }).selectOption('content_editor');
    await inviteForm.getByRole('button', { name: 'Пригласить' }).click();

    const link = page.locator('code').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    const inviteUrl = (await link.textContent())!.trim();

    const editor = await browser.newContext({ storageState: undefined });
    const editorPage = await editor.newPage();
    await editorPage.goto(new URL(inviteUrl).pathname);
    await editorPage.getByLabel('Как вас зовут').fill('Смена Пароля');
    await editorPage.getByLabel('Пароль').fill(first);
    await editorPage.getByRole('button', { name: 'Завершить' }).click();
    await expect(editorPage.getByText('Теперь войдите с этим паролем')).toBeVisible({
      timeout: 15_000,
    });

    await signIn(editorPage, email, first);

    // The wrong current password must not change anything, or the form is an
    // unauthenticated password reset for anyone holding a stolen session.
    await editorPage.goto('/admin/profile');
    await editorPage.getByLabel('Текущий пароль').fill('sovsem-ne-tot-parol');
    await editorPage.getByLabel('Новый пароль', { exact: true }).fill(second);
    await editorPage.getByLabel('Повторите новый пароль').fill(second);
    await editorPage.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(editorPage.getByRole('alert')).toBeVisible();

    await editorPage.getByLabel('Текущий пароль').fill(first);
    await editorPage.getByLabel('Новый пароль', { exact: true }).fill(second);
    await editorPage.getByLabel('Повторите новый пароль').fill(second);
    await editorPage.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(editorPage.getByRole('status')).toContainText('Пароль изменён', {
      timeout: 15_000,
    });

    // The change is journalled — without the audit row, a password change is
    // the one account event nobody could reconstruct afterwards.
    // Scoped to the list: the action filter is built from the actions actually
    // present, so a bare text match finds its <option> and passes on a page
    // showing no entry at all.
    await page.goto('/admin/audit');
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Смена своего пароля' }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The owner's own recovery path when email is not configured: set a
    // password directly. It signs the account out, so the editor's open tab
    // lands on the login screen.
    await page.goto('/admin/users');
    const row = page.getByRole('listitem').filter({ hasText: email });
    await row.getByRole('button', { name: 'Задать пароль' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Новый пароль').fill(third);
    await dialog.getByRole('button', { name: 'Задать пароль' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Пароль задан', { timeout: 15_000 });

    await editorPage.goto('/admin/pages');
    await expect(editorPage).toHaveURL(/\/admin\/login/);

    // better-auth allows three sign-ins per ten seconds per IP, and this test
    // has already spent two. Waiting is the honest way to prove the password
    // works — a 429 here would read exactly like a wrong password.
    await editorPage.waitForTimeout(11_000);
    await signIn(editorPage, email, third);

    await editor.close();
  });

  /**
   * The forgotten-password screen, without the email.
   *
   * Delivery needs Resend, which a fresh deploy does not have — but the parts
   * that fail silently are all before delivery: the page has to be reachable
   * without a session (the panel redirects everything else to the login
   * screen, and this is the one page a locked-out person can reach), and its
   * answer must not reveal whether an address belongs to an account.
   */
  test('the reset screen is public and reveals nothing about which accounts exist', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto('/admin/login');
    await page.getByRole('link', { name: 'Забыли пароль?' }).click();
    await expect(page).toHaveURL(/\/admin\/reset-password/);

    // A stale or reused link comes back here with ?error=, and has to say so
    // rather than silently showing the request form again.
    await page.goto('/admin/reset-password?error=INVALID_TOKEN');
    // Scoped to the form: Next's route announcer is also role=alert.
    await expect(page.locator('form').getByRole('alert')).toContainText('недействительна');

    await page.goto('/admin/reset-password');
    await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.test`);
    await page.getByRole('button', { name: 'Прислать ссылку' }).click();

    // Identical wording for an address that exists and one that does not: this
    // form is public, so anything else turns it into a staff directory.
    await expect(page.getByRole('status')).toContainText('Если такая учётная запись существует', {
      timeout: 15_000,
    });

    await context.close();
  });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
