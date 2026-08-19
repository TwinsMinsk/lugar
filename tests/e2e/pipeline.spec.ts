import { expect, test, type Page } from '@playwright/test';

import { spanishMobile } from './lead-phone';

/**
 * The pipeline editor.
 *
 * The stages were fixed at install and could only be changed by a migration —
 * the one place the owner still needed a developer to run their own sales
 * process. What matters here is not that the form saves, but that the
 * dangerous edits are refused: a funnel with no entry point silently drops
 * every new enquiry, and a stage removed with leads on it loses them.
 */
test.describe('pipeline', () => {
  // One shared pipeline, and the CRM specs read it.
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const name = `E2E Этап ${stamp}`;
  const renamed = `${name} переименован`;

  /** The live funnel, as opposed to the archived list below it. */
  const active = (page: Page) => page.getByRole('list', { name: 'Этапы воронки' });

  test('a new stage appears at the end of the funnel and on the board', async ({ page }) => {
    await page.goto('/admin/pipeline');
    await page.getByRole('button', { name: 'Добавить этап' }).click();

    await page.getByLabel('Название (ru)').fill(name);
    await page.getByLabel('Название (es)').fill('Etapa E2E');
    await page.getByRole('button', { name: 'Добавить этап' }).click();

    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // Appended, not inserted: the new stage is last, so nobody's board silently
    // reorders itself. Scoped to the active list — the archived section is a
    // second list, and an unscoped "last item" spans both.
    await expect(active(page).getByRole('listitem').last()).toContainText(name);

    // And the board it drives shows the column immediately.
    await page.goto('/admin/leads/board');
    await expect(page.getByRole('region', { name })).toBeVisible();
  });

  test('renaming a stage does not disturb the leads on it', async ({ page }) => {
    await page.goto('/admin/pipeline');
    const row = page.getByRole('listitem').filter({ hasText: name });
    await row.getByRole('button', { name: 'Изменить' }).click();

    await page.getByLabel('Название (ru)').fill(renamed);
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: renamed })).toHaveCount(1, {
      timeout: 15_000,
    });
    // Nothing in the code compares status slugs, so a rename is only a label
    // change — the stage keeps its identity and its leads.
    await page.goto('/admin/leads/board');
    await expect(page.getByRole('region', { name: renamed })).toBeVisible();
  });

  test('reordering works from the keyboard', async ({ page }) => {
    await page.goto('/admin/pipeline');
    const row = page.getByRole('listitem').filter({ hasText: renamed });

    // The buttons carry names, so this is the same path a screen-reader user
    // takes; there is no drag handle to fake.
    await row.getByRole('button', { name: `Поднять этап «${renamed}»` }).click();

    await expect(active(page).getByRole('listitem').nth(-2)).toContainText(renamed, {
      timeout: 15_000,
    });
  });

  test('the entry stage cannot be removed', async ({ page }) => {
    await page.goto('/admin/pipeline');

    const entry = page.getByRole('listitem').filter({ hasText: 'точка входа' }).first();
    // Not a disabled button that still looks like an option: the control is
    // replaced by the reason, because new leads would have nowhere to land.
    await expect(entry.getByText('точка входа — убрать нельзя')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Убрать', exact: true })).toHaveCount(0);
  });

  test('removing a stage that holds leads demands somewhere to move them', async ({ page }) => {
    /**
     * The lead is created here, not borrowed from the inbox.
     *
     * Reaching for whatever row happens to be in /admin/leads makes this spec
     * depend on another one having run first, and it fails as if the pipeline
     * were broken when the inbox is simply empty.
     */
    const stamp2 = Date.now();
    const leadName = `E2E Воронка ${stamp2}`;
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(stamp2 / 1000) % 256}.${stamp2 % 256}.11`,
    });

    await page.goto('/');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя').fill(leadName);
    await dialog.getByLabel('Телефон').fill(spanishMobile(stamp2));
    await dialog.locator('input[name="consentPersonalData"]').check();
    // Dwell guard: a submission faster than a human can type is discarded.
    await page.waitForTimeout(3000);
    await dialog.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(dialog.getByText('Заявка отправлена')).toBeVisible({ timeout: 15_000 });

    await page.goto(`/admin/leads?q=${encodeURIComponent(leadName)}`);
    const leadHref = await page
      .getByRole('row')
      .filter({ hasText: leadName })
      .getByRole('link')
      .first()
      .getAttribute('href');
    expect(leadHref).toBeTruthy();

    await page.goto(leadHref!);
    await page.getByLabel('Статус', { exact: true }).selectOption({ label: renamed });
    // The announcement region, not the timeline entry below it — both say the
    // same words, and only one of them means "the click worked".
    await expect(page.getByRole('status').filter({ hasText: 'Статус изменён' })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/admin/pipeline');
    const row = page.getByRole('listitem').filter({ hasText: renamed });
    await expect(row).toContainText('заявок 1');

    await row.getByRole('button', { name: 'Убрать' }).click();
    // The bare "remove" turns into a choice of destination rather than deciding
    // for the owner where a month of someone's work goes.
    const chooser = row.getByLabel(/Перенести 1 заявку/);
    await expect(chooser).toBeVisible();
    await row.getByRole('button', { name: 'Перенести и убрать' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: renamed })).toHaveCount(1, {
      timeout: 15_000,
    });

    // The lead survived the move rather than going down with the stage.
    await page.goto(`/admin/leads?q=${encodeURIComponent(leadName)}`);
    await expect(page.getByRole('row').filter({ hasText: leadName })).toHaveCount(1);
  });

  test('the removed stage is listed as archived and can be brought back', async ({ page }) => {
    await page.goto('/admin/pipeline');

    const archived = page
      .getByRole('list', { name: 'Убранные этапы' })
      .getByRole('listitem')
      .filter({ hasText: renamed });
    await expect(archived).toHaveCount(1);
    await archived.getByRole('button', { name: 'Вернуть' }).click();

    await expect(page.getByRole('region', { name: 'Убранные этапы' })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  test('cleanup: removes the stage this suite created', async ({ page }) => {
    await page.goto('/admin/pipeline');

    const row = page.getByRole('listitem').filter({ hasText: renamed });
    if ((await row.count()) === 0) return;

    const remove = row.getByRole('button', { name: 'Убрать' });
    if ((await remove.count()) === 0) return;
    await remove.click();

    const chooser = row.getByLabel(/Перенести/);
    if (await chooser.isVisible().catch(() => false)) {
      await row.getByRole('button', { name: 'Перенести и убрать' }).click();
    }
    await expect(page.getByRole('listitem').filter({ hasText: renamed })).toHaveCount(1, {
      timeout: 15_000,
    });
  });
});
