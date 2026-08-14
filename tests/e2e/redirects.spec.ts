import { expect, test } from '@playwright/test';

import { live, LIVE } from './live';

/**
 * Redirects, end to end.
 *
 * The claim under test is not that the form saves a row — rows were being saved
 * long before anything served them. It is that a request to the old address
 * actually arrives at the new one.
 */
test.describe('redirects', () => {
  // They share one table and assert on its contents, so they must not race.
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const oldPath = `/e2e-staryy-adres-${stamp}`;

  test('an added rule sends a visitor from the old address to the new one', async ({ page }) => {
    // Prove the address is dead first, so the redirect afterwards cannot be
    // mistaken for something that was already there.
    const before = await page.goto(oldPath);
    expect(before?.status()).toBe(404);

    await page.goto('/admin/redirects');
    await page.getByLabel('Старый адрес').fill(oldPath);
    await page.getByLabel('Куда вести').fill('/');
    await page.getByLabel('Зачем это правило').fill('E2E');
    await page.getByRole('button', { name: 'Добавить' }).click();

    await expect(page.getByText(oldPath)).toBeVisible({ timeout: 15_000 });

    // The old address must now land on the home page. Asserted on where the
    // browser ended up, not on a status code: the response the test sees is the
    // 200 from the redirect's destination.
    await expect
      .poll(
        live(page, oldPath, async () => new URL(page.url()).pathname),
        LIVE,
      )
      .toBe('/');
  });

  test('refuses a rule that would trap a visitor in a loop', async ({ page }) => {
    const a = `/e2e-loop-a-${stamp}`;
    const b = `/e2e-loop-b-${stamp}`;

    await page.goto('/admin/redirects');
    const form = page.locator('form').first();

    await form.getByLabel('Старый адрес').fill(a);
    await form.getByLabel('Куда вести').fill(b);
    await form.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByText(a)).toBeVisible({ timeout: 15_000 });

    // The mirror image of the rule that already exists.
    await form.getByLabel('Старый адрес').fill(b);
    await form.getByLabel('Куда вести').fill(a);
    await form.getByRole('button', { name: 'Добавить' }).click();

    await expect(form.getByRole('alert')).toContainText('кольцо');

    // Refused, not saved-and-broken.
    await page.reload();
    await expect(page.getByText(`${b} → ${a}`)).toHaveCount(0);
  });

  test('rejects a destination that leaves the site', async ({ page }) => {
    await page.goto('/admin/redirects');
    const form = page.locator('form').first();

    await form.getByLabel('Старый адрес').fill(`/e2e-external-${stamp}`);
    // Protocol-relative: a browser treats this as a different origin.
    await form.getByLabel('Куда вести').fill('//evil.example');
    await form.getByRole('button', { name: 'Добавить' }).click();

    await expect(form.getByRole('alert')).toBeVisible();
  });

  test('the journal shows who created the rule', async ({ page }) => {
    await page.goto('/admin/audit?action=redirect.created');

    const entry = page.getByRole('listitem').filter({ hasText: 'Создан редирект' }).first();
    await expect(entry).toBeVisible();
    await expect(entry).toContainText(process.env.E2E_ADMIN_EMAIL ?? '@');
  });

  test('cleanup: removes the rules this suite created', async ({ page }) => {
    await page.goto('/admin/redirects');

    for (const path of [oldPath, `/e2e-loop-a-${stamp}`]) {
      const row = page.getByRole('listitem').filter({ hasText: path });
      if ((await row.count()) === 0) continue;
      await row.first().getByRole('button', { name: 'Удалить' }).click();
      await expect(page.getByText(path)).toHaveCount(0, { timeout: 15_000 });
    }

    // And the address goes back to being a 404, which proves deletion took
    // effect on the public side and not only in the table.
    await expect
      .poll(
        live(page, oldPath, async () => new URL(page.url()).pathname),
        LIVE,
      )
      .toBe(oldPath);
  });
});
