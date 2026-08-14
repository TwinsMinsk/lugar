import { expect, test, type Page } from '@playwright/test';

/**
 * Contacts.
 *
 * A lead is one enquiry; a contact is the person. The claim worth proving is
 * that two enquiries from the same number land on one card — because the
 * alternative is a manager ringing a customer to ask something the customer
 * already answered months ago.
 */
test.describe('contacts', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const name = `E2E Клиент ${stamp}`;
  const phone = `+34 6${String(stamp).slice(-8)}`;
  let contactHref: string;

  async function submitLead(page: Page, values: { name: string; phone: string; comment?: string }) {
    await page.goto('/');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя').fill(values.name);
    await dialog.getByLabel('Телефон').fill(values.phone);
    if (values.comment) await dialog.getByLabel('Комментарий').fill(values.comment);
    await dialog.locator('input[name="consentPersonalData"]').check();
    // Dwell guard: a submission faster than a human can type is discarded.
    await page.waitForTimeout(3000);
    await dialog.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(dialog.getByText('Заявка отправлена')).toBeVisible({ timeout: 15_000 });
  }

  test('two enquiries from one number become one client with two leads', async ({ page }) => {
    // A fresh caller identity: submissions are rate limited per IP and per
    // number, and that limit is production behaviour, not a test obstacle.
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(stamp / 1000) % 256}.${stamp % 256}.13`,
    });

    await submitLead(page, { name, phone, comment: 'Первое обращение' });
    await submitLead(page, { name, phone, comment: 'Второе обращение' });

    await page.goto(`/admin/contacts?q=${encodeURIComponent(name)}`);
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    // One person, both enquiries — not two half-empty records.
    await expect(row).toContainText('2');

    contactHref = (await row.getByRole('link').first().getAttribute('href'))!;
    expect(contactHref).toMatch(/^\/admin\/contacts\/[0-9a-f-]{36}$/);
  });

  test('the card lists every enquiry and the consent trail', async ({ page }) => {
    await page.goto(contactHref);
    await expect(page.getByRole('heading', { name })).toBeVisible();

    await expect(page.getByRole('link', { name: /^LG-/ })).toHaveCount(2);

    // Consent is a record of what was agreed and when, not a switch.
    await expect(page.getByText('Обработка персональных данных').first()).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('the phone number is shown but cannot be edited', async ({ page }) => {
    await page.goto(contactHref);

    // It is the key the CRM joins on and the one inbound WhatsApp matches
    // against, so it is deliberately not a field.
    await expect(page.getByText(phone.replace(/\s/g, ''))).toBeVisible();
    await expect(page.getByLabel('Телефон')).toHaveCount(0);
  });

  test('a note about the person is saved and stays on the card', async ({ page }) => {
    await page.goto(contactHref);

    const note = `Живёт в Марбелье, второй объект ${stamp}`;
    await page.getByLabel('Заметки о клиенте').fill(note);
    await page.getByLabel('Город').fill('Marbella');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено.')).toBeVisible({ timeout: 15_000 });

    await page.goto(contactHref);
    await expect(page.getByLabel('Заметки о клиенте')).toHaveValue(note);
    await expect(page.getByLabel('Город')).toHaveValue('Marbella');
  });

  test('search finds the client by the last digits of the phone', async ({ page }) => {
    const tail = phone.replace(/\D/g, '').slice(-6);
    await page.goto(`/admin/contacts?q=${tail}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  });

  test('a lead links to its client, and back', async ({ page }) => {
    await page.goto(contactHref);
    const lead = page.getByRole('link', { name: /^LG-/ }).first();
    const leadHref = await lead.getAttribute('href');

    await page.goto(leadHref!);
    await page.getByRole('link', { name: 'Клиент ↗' }).click();
    await expect(page).toHaveURL(new RegExp(contactHref.replace(/\//g, '\\/')));
  });
});
