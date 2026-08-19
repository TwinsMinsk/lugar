import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { audit, axeDescribe } from './axe';

/**
 * Accessibility of the admin panel.
 *
 * Separate from the public audit because it needs a signed-in owner, and
 * Playwright picks the project by file name — see ADMIN_SPECS in
 * playwright.config.ts.
 *
 * The panel is a workplace: whoever runs this studio may end up using it every
 * day for years. "Internal tool" is not a reason to skip this.
 */
const ADMIN_PAGES = [
  '/admin',
  '/admin/pages',
  '/admin/leads',
  '/admin/leads/board',
  '/admin/media',
  '/admin/navigation',
  '/admin/redirects',
  '/admin/settings',
  '/admin/users',
  '/admin/audit',
];

test.describe('admin accessibility', () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await audit(page, new AxeBuilder({ page }));
      expect(axeDescribe(results), axeDescribe(results)).toBe('');
    });
  }
  /**
   * The confirmation dialog, which every destructive button now goes through.
   *
   * Asserted on the users screen because "отключить доступ" is the one
   * confirmation that exists on a page with nothing else to clean up
   * afterwards — the dialog is cancelled, so nothing is changed.
   */
  test('a confirmation names itself, traps focus and gives it back', async ({ page }) => {
    await page.goto('/admin/users');

    const trigger = page.getByRole('button', { name: 'Отключить доступ' }).first();
    if ((await trigger.count()) === 0) test.skip(true, 'no other staff account to act on');

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Отключить доступ?' });
    await expect(dialog).toBeVisible();

    const results = await audit(page, new AxeBuilder({ page }));
    expect(axeDescribe(results), axeDescribe(results)).toBe('');

    // Cancel holds the focus, so Return never confirms by accident.
    await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();

    // Escape closes it, and focus goes back to the button that opened it —
    // otherwise a keyboard user restarts from the top of the document.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
