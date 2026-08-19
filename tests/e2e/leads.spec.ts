import { expect, test } from '@playwright/test';

import { spanishMobile } from './lead-phone';

import { APP_SECRET, inboundEnvelope, postWebhook, sign } from './whatsapp-helpers';

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
  const phone = spanishMobile(stamp);
  /**
   * A comment that Excel would execute.
   *
   * Submitted through the public form so the export test has something real to
   * defend against: without a hostile value in the data, "no cell starts with a
   * formula character" passes whether or not the escaping exists.
   */
  const hostileComment = '=HYPERLINK("http://evil.example","Счёт")';
  let publicId: string;
  /**
   * The lead's own URL, captured once.
   *
   * Later tests navigate straight to it instead of clicking through the list.
   * `click()` resolves when the click lands, not when the navigation finishes,
   * so a `.count()` immediately after it measures the list page — which made an
   * "this control is absent" assertion pass without ever opening the card.
   */
  let leadHref: string;

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

    const link = row.getByRole('link').first();
    publicId = (await link.textContent())!.trim();
    leadHref = (await link.getAttribute('href'))!;
    expect(publicId).toMatch(/^LG-/);
    expect(leadHref).toMatch(/^\/admin\/leads\/[0-9a-f-]{36}$/);
  });

  test('search finds the lead by the last digits of the phone', async ({ page }) => {
    // Staff usually have a missed call, not the full number as it was stored.
    const tail = phone.replace(/\D/g, '').slice(-6);
    await page.goto(`/admin/leads?q=${tail}`);
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  });

  test('status, assignment and a note are recorded on the lead', async ({ page }) => {
    await page.goto(leadHref);
    await expect(page.getByRole('heading', { name: new RegExp(publicId) })).toBeVisible();

    // Exact: the list's status filter is a nav labelled "Фильтр по статусу",
    // which a substring match also finds.
    await page.getByLabel('Статус', { exact: true }).selectOption({ label: 'Связаться' });
    // The announcement region, not the timeline entry below it — both say the
    // same words, and only one of them means "the click worked".
    await expect(page.getByRole('status').filter({ hasText: 'Статус изменён' })).toBeVisible({
      timeout: 15_000,
    });

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
    /**
     * Bracketed rather than compared once.
     *
     * The dashboard count and the list are two reads at two moments, and the
     * other specs are creating leads in parallel the whole time — so demanding
     * one exact number makes this fail for a reason that has nothing to do with
     * the dashboard. Reading the counter on both sides of the list gives a
     * range the answer must sit inside, which still catches the failure worth
     * catching: a number that is structurally wrong rather than a moment stale.
     */
    async function unassignedCount(): Promise<number> {
      await page.goto('/admin');
      const card = page.getByRole('link').filter({ hasText: 'Без ответственного' }).first();
      await expect(card).toBeVisible();
      return Number((await card.innerText()).match(/\d+/)?.[0] ?? -1);
    }

    const before = await unassignedCount();
    expect(before).toBeGreaterThanOrEqual(0);

    await page.goto('/admin/leads?assignee=none');
    // Minus the header row; an empty list renders a message instead of a table.
    const rows = Math.max((await page.getByRole('row').count()) - 1, 0);

    const after = await unassignedCount();

    expect(rows).toBeGreaterThanOrEqual(Math.min(before, after));
    expect(rows).toBeLessThanOrEqual(Math.max(before, after));
  });

  test('the card offers no free-form composer while the window is shut', async ({ page }) => {
    await page.goto(leadHref);
    // Proves we are on the card: without this the absence assertions below
    // would pass just as happily on the list page.
    await expect(page.getByRole('heading', { name: new RegExp(publicId) })).toBeVisible();

    await expect(page.getByText('только шаблоны — клиент давно не писал')).toBeVisible();

    // Replaced, not disabled. A greyed-out textarea would invite the operator
    // to write a message that cannot legally be sent and offer no way forward.
    await expect(page.getByLabel('Ответ в WhatsApp')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /WhatsApp/ })).toBeVisible();
  });

  test('a customer message reaches the lead card and opens the window', async ({ page }) => {
    test.skip(!APP_SECRET, 'WHATSAPP_APP_SECRET is not set');

    const text = `Здравствуйте, уточню размеры ${stamp}`;
    const body = inboundEnvelope({
      wamid: `wamid.IN.${stamp}`,
      from: phone.replace(/\D/g, ''),
      text,
    });

    const response = await postWebhook(page.request, body, sign(body));
    expect(response.status()).toBe(200);

    // The webhook commits the envelope before responding and applies it after,
    // so the card is polled rather than read once.
    await expect
      .poll(
        async () => {
          await page.goto(leadHref);
          return page.getByText(text).count();
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    // An inbound message is what opens the 24-hour service window, so the
    // composer becomes available at the same moment.
    // The badge names the deadline rather than the rule: "24 hour window" is
    // Meta's vocabulary, not something a manager should have to learn.
    await expect(page.getByText(/можно писать свободно/)).toBeVisible();
  });

  test('the CSV export contains the lead and neutralises spreadsheet formulas', async ({
    page,
  }) => {
    const response = await page.request.get('/api/admin/leads/export');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain('attachment');

    const body = await response.text();
    // The BOM is what makes Excel read Cyrillic names correctly.
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain(name);
    expect(body).toContain(publicId);

    // No cell may start with a bare formula character.
    const cells = body
      .split(/\r\n/)
      .slice(1)
      .flatMap((line) => line.split('","'));
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
