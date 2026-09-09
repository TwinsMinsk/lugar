import { expect, test } from '@playwright/test';

import { live, LIVE } from './live';

/**
 * Global settings.
 *
 * The design claim being tested is that an unfilled setting is *absent* rather
 * than blank: the site renders nothing instead of an empty link or a
 * plausible-looking placeholder. That only holds if filling a value makes it
 * appear and clearing it makes it disappear again.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('settings', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  // They write to the same global settings row set.
  test.describe.configure({ mode: 'serial' });

  test('rejects a phone number that is not valid E.164', async ({ page }) => {
    await page.goto('/admin/settings');

    const field = page.getByLabel('Телефон в формате E.164');
    const original = await field.inputValue();
    await field.fill('8 (999) 123-45-67');
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();

    await expect(page.getByText('Формат: + и от 7 до 15 цифр')).toBeVisible();

    // Nothing was written, so a reload restores the stored value.
    await page.reload();
    await expect(page.getByLabel('Телефон в формате E.164')).toHaveValue(original);
  });

  test('refuses a link that is not http(s)', async ({ page }) => {
    await page.goto('/admin/settings');

    // A javascript: URL in a footer anchor is stored XSS.
    await page.getByLabel('Instagram').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Не сохранено' })).toBeVisible();
  });

  test('a filled social link appears on the site, and clearing it removes it', async ({ page }) => {
    const url = 'https://www.instagram.com/lugar.test.profile/';
    const instagram = () => page.getByRole('link', { name: 'Instagram' }).count();

    // Absent to begin with: the contact block renders no Instagram link.
    await expect.poll(live(page, '/kontakty', instagram), LIVE).toBe(0);

    await page.goto('/admin/settings');
    await page.getByLabel('Instagram').fill(url);
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    // Now it is on the public site, pointing where the owner said.
    await expect.poll(live(page, '/kontakty', instagram), LIVE).toBe(1);

    const link = page.getByRole('link', { name: 'Instagram' }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('rel', /noopener/);

    // Clearing restores "not filled in" rather than leaving an empty anchor.
    await page.goto('/admin/settings');
    await page.getByLabel('Instagram').fill('');
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText('не заполнено').first()).toBeVisible();

    await expect.poll(live(page, '/kontakty', instagram), LIVE).toBe(0);
  });

  test('a filled email and address appear on the contacts page, and clearing removes them', async ({
    page,
  }) => {
    const email = 'estudio@lugar.test';
    const address = 'Calle de Prueba 12, Marbella';
    const emailLink = () => page.getByRole('link', { name: email }).count();
    const addressText = () => page.getByText(address).count();

    // Absent to begin with: contact_block renders neither.
    await expect.poll(live(page, '/kontakty', emailLink), LIVE).toBe(0);
    await expect.poll(live(page, '/kontakty', addressText), LIVE).toBe(0);

    await page.goto('/admin/settings');
    await page.getByLabel('Публичный email').fill(email);
    await page.getByLabel('Физический адрес').fill(address);
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(live(page, '/kontakty', emailLink), LIVE).toBe(1);
    await expect.poll(live(page, '/kontakty', addressText), LIVE).toBe(1);

    const link = page.getByRole('link', { name: email }).first();
    await expect(link).toHaveAttribute('href', `mailto:${email}`);

    // Clearing restores "not filled in" rather than leaving an empty slot.
    await page.goto('/admin/settings');
    await page.getByLabel('Публичный email').fill('');
    await page.getByLabel('Физический адрес').fill('');
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(live(page, '/kontakty', emailLink), LIVE).toBe(0);
    await expect.poll(live(page, '/kontakty', addressText), LIVE).toBe(0);
  });

  /**
   * The logo setting, which used to be a field that changed nothing.
   *
   * It could be filled in, it counted towards the "settings waiting for
   * values" banner, and no code read it — the header, footer and mobile menu
   * all rendered the text wordmark unconditionally. This asserts the whole
   * round trip, including that clearing it brings the wordmark back rather
   * than leaving a broken image.
   */
  test('an uploaded logo replaces the wordmark in the header, and clearing brings it back', async ({
    page,
  }) => {
    const wordmark = () => page.getByRole('banner').getByText('Lugar', { exact: true }).count();
    const image = () => page.getByRole('banner').locator('img[alt="LUGAR"]').count();

    // The honest starting state: no logo uploaded, so the text shows.
    await expect.poll(live(page, '/', wordmark), LIVE).toBe(1);
    await expect.poll(live(page, '/', image), LIVE).toBe(0);

    await page.goto('/admin/settings');
    const logoField = page.getByRole('group', { name: 'Логотип' });
    await logoField.getByRole('button', { name: 'Выбрать' }).first().click();
    const chooser = page.getByRole('dialog', { name: 'Выбор изображения' });
    await chooser.getByRole('listitem').first().getByRole('button').click();
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(live(page, '/', image), LIVE).toBe(1);
    await expect.poll(live(page, '/', wordmark), LIVE).toBe(0);

    // Cleared: the wordmark is the fallback, not an empty frame.
    await page.goto('/admin/settings');
    await page
      .getByRole('group', { name: 'Логотип' })
      .getByRole('button', { name: 'Убрать' })
      .first()
      .click();
    await page.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Настройки сохранены.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(live(page, '/', wordmark), LIVE).toBe(1);
    await expect.poll(live(page, '/', image), LIVE).toBe(0);
  });
});
