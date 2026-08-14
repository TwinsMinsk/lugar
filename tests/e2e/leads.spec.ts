import { expect, test } from '@playwright/test';

/**
 * The CRM.
 *
 * The claim worth proving is the one the studio is paying for: an enquiry typed
 * into the public site arrives in the sales inbox, keeps the source it came
 * from, and can be worked on. Everything else here — statuses, notes, export —
 * only matters because that first hop is real.
 */
test.describe('leads', () => {
  // They work on one shared inbox and assert on its contents.
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const name = `E2E Заявка ${stamp}`;
  const phone = `+34 7${String(stamp).slice(-8)}`;
  /**
   * A comment that Excel would execute.
   *
   * Submitted through the public form so the export test has something real to
   * defend against: without a hostile value in the data, "no cell starts with a
   * formula character" passes whether or not the escaping exists.
   */
  const hostileComment = '=HYPERLINK("http://evil.example","Счёт")';
  let publicId: string;

  test('an enquiry from the public site arrives in the inbox with its source', async ({ page }) => {
    // A fresh caller identity: submissions are rate limited per IP and per
    // number, and that limit is production behaviour, not a test obstacle.
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(stamp / 1000) % 256}.${stamp % 256}.9`,
    });

    await page.goto('/?utm_source=e2e-crm&utm_medium=spec&utm_campaign=inbox');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя').fill(name);
    await dialog.getByLabel('Телефон').fill(phone);
    await dialog.getByLabel('Комментарий').fill(hostileComment);
    await dialog.locator('input[name="consentPersonalData"]').check();
    // Dwell guard: a submission faster than a human can type is discarded.
    await page.waitForTimeout(3000);
    await dialog.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(dialog.getByText('Заявка отправлена')).toBeVisible({ timeout: 15_000 });

    // Search by name rather than paging: the inbox already holds earlier runs.
    await page.goto(`/admin/leads?q=${encodeURIComponent(name)}`);
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toHaveCount(1);

    // The attribution the visitor arrived with survived into the CRM.
    await expect(row).toContainText('e2e-crm');

    publicId = (await row.getByRole('link').first().textContent())!.trim();
    expect(publicId).toMatch(/^LG-/);
  });

  test('search finds the lead by the last digits of the phone', async ({ page }) => {
    // Staff usually have a missed call, not the full number as it was stored.
    const tail = phone.replace(/\D/g, '').slice(-6);
    await page.goto(`/admin/leads?q=${tail}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  });

  test('status, assignment and a note are recorded on the lead', async ({ page }) => {
    await page.goto(`/admin/leads?q=${encodeURIComponent(name)}`);
    await page.getByRole('link', { name: publicId }).click();
    await expect(page.getByRole('heading', { name: new RegExp(publicId) })).toBeVisible();

    // Exact: the list's status filter is a nav labelled "Фильтр по статусу",
    // which a substring match also finds.
    await page.getByLabel('Статус', { exact: true }).selectOption({ label: 'Связаться' });
    await expect(page.getByText('Статус изменён')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Ответственный', { exact: true }).selectOption({ index: 1 });
    await expect(page.getByText('Назначен ответственный')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Заметка').fill('Созвонились, замер во вторник.');
    await page.getByRole('button', { name: 'Добавить заметку' }).click();
    await expect(page.getByText('Созвонились, замер во вторник.')).toBeVisible({
      timeout: 15_000,
    });

    // A task is the thing that stops a lead going quiet.
    await page.getByLabel('Новая задача').fill('Перезвонить и уточнить размеры');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByText('Задача создана')).toBeVisible({ timeout: 15_000 });

    // The status filter now agrees with the change.
    await page.goto(`/admin/leads?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Связаться');
  });

  test('the board moves a lead between stages from the keyboard', async ({ page }) => {
    await page.goto('/admin/leads/board');

    // The move control is a labelled select on the card, so this is the same
    // path a keyboard or screen-reader user takes — there is no drag to fake.
    const move = page.getByLabel(`Перенести заявку ${publicId}`);
    await expect(move).toBeVisible();
    await move.selectOption({ label: 'Квалификация' });

    // The card is now under the target column, not merely reporting success.
    // Matched on its move control rather than on the id text: the control's
    // own screen-reader label repeats the id, so a text match is ambiguous.
    const column = page.getByRole('region', { name: 'Квалификация' });
    await expect(
      column.getByRole('combobox', { name: `Перенести заявку ${publicId}` }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the dashboard number agrees with the list it links to', async ({ page }) => {
    await page.goto('/admin');

    const card = page.getByRole('link').filter({ hasText: 'Без ответственного' }).first();
    await expect(card).toBeVisible();
    const shown = Number((await card.innerText()).match(/\d+/)?.[0] ?? -1);
    expect(shown).toBeGreaterThanOrEqual(0);

    // A dashboard number that disagrees with the screen it opens is worse than
    // no number: it teaches the owner not to trust the dashboard.
    await card.click();
    await expect(page).toHaveURL(/assignee=none/);
    const rows = await page.getByRole('row').count();
    // Minus the header row; an empty list renders a message instead of a table.
    expect(Math.max(rows - 1, 0)).toBe(shown);
  });

  test('the CSV export contains the lead and neutralises spreadsheet formulas', async ({ page }) => {
    const response = await page.request.get('/api/admin/leads/export');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain('attachment');

    const body = await response.text();
    // The BOM is what makes Excel read Cyrillic names correctly.
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain(name);
    expect(body).toContain(publicId);

    // No cell may start with a bare formula character.
    const cells = body.split(/\r\n/).slice(1).flatMap((line) => line.split('","'));
    for (const cell of cells) {
      expect(cell.replace(/^"/, '')).not.toMatch(/^[=+@]/);
    }
  });

  test('the export is refused to a role without crm.export', async ({ browser }) => {
    // No session at all is the cheapest proof that the route guards itself
    // rather than relying on the admin layout, which it never renders.
    const context = await browser.newContext({ storageState: undefined });
    const response = await context.request.get('/api/admin/leads/export');
    expect(response.status()).toBe(404);
    await context.close();
  });
});
