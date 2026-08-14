import { expect, test, type Page } from '@playwright/test';

import { live, LIVE } from './live';

/**
 * The menu editor.
 *
 * Worth proving beyond "the form saves": that a link added in /admin appears in
 * the footer of the live site without a deploy, that reordering is operable
 * from the keyboard alone, and that removing it removes it everywhere.
 */
test.describe('navigation', () => {
  // One shared menu; these must not race each other.
  test.describe.configure({ mode: 'serial' });

  const PREFIX = 'E2E пункт';
  const label = `${PREFIX} ${Date.now()}`;

  /** How many times the label appears in the live footer. See ./live. */
  function footerLinks(page: Page, name: string) {
    return live(page, '/', () => page.getByRole('contentinfo').getByRole('link', { name }).count());
  }

  test('an added item appears in the footer of the live site', async ({ page }) => {
    await page.goto('/admin/navigation');

    const section = page.locator('section').filter({ hasText: 'Футер — юридические' });
    await section.getByRole('button', { name: 'Добавить пункт' }).click();

    await section.getByLabel('Название (ru)').fill(label);
    await section.getByLabel('Куда ведёт').selectOption('document');
    // Home is published in every locale, so the item must not be filtered out.
    await section.getByLabel('Страница', { exact: true }).selectOption({ index: 1 });
    await section.getByRole('button', { name: 'Добавить' }).click();

    // Scoped to the row: the position control carries a screen-reader label
    // that repeats the item's name, so a bare text match is ambiguous.
    await expect(section.getByRole('listitem').filter({ hasText: label })).toHaveCount(1, {
      timeout: 15_000,
    });

    await expect.poll(footerLinks(page, label), LIVE).toBe(1);
  });

  test('reordering works from the keyboard, without dragging', async ({ page }) => {
    await page.goto('/admin/navigation');

    const section = page.locator('section').filter({ hasText: 'Футер — юридические' });
    const item = section.getByRole('listitem').filter({ hasText: label });

    // The position control is a labelled select, so a screen reader user has
    // the same capability as someone with a mouse.
    const position = item.getByRole('combobox');
    const before = await position.inputValue();
    expect(before).not.toBe('1');

    await position.selectOption('1');
    await expect(section.getByRole('listitem').first()).toContainText(label, { timeout: 15_000 });
  });

  test('hiding an item removes it from the public menu but keeps it here', async ({ page }) => {
    await page.goto('/admin/navigation');

    const section = page.locator('section').filter({ hasText: 'Футер — юридические' });
    const item = section.getByRole('listitem').filter({ hasText: label });
    await item.getByRole('button', { name: 'Скрыть' }).click();
    await expect(item.getByText('скрыт')).toBeVisible({ timeout: 15_000 });

    await expect.poll(footerLinks(page, label), LIVE).toBe(0);
  });

  test('cleanup: deleting the item removes it from the site too', async ({ page }) => {
    await page.goto('/admin/navigation');

    const section = page.locator('section').filter({ hasText: 'Футер — юридические' });

    // Removes anything this suite has ever left behind, not only this run's
    // item: a spec that mutates a shared menu has to be able to recover from
    // its own earlier failure, or the next run starts from dirty state.
    const stale = section.getByRole('listitem').filter({ hasText: PREFIX });
    for (let remaining = await stale.count(); remaining > 0; remaining -= 1) {
      await stale.first().getByRole('button', { name: 'Удалить' }).click();
      await expect(stale).toHaveCount(remaining - 1, { timeout: 15_000 });
    }

    await expect.poll(footerLinks(page, label), LIVE).toBe(0);
  });
});
