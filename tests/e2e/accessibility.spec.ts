import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { audit, axeDescribe } from './axe';

/**
 * Accessibility of the public site.
 *
 * axe covers what a machine can check. The keyboard assertions below cover what
 * it cannot: whether a person who never touches a mouse can get through the
 * page at all.
 */
async function scan(page: Page, path: string) {
  await page.goto(path);
  return audit(page, new AxeBuilder({ page }));
}

const PUBLIC_PAGES = ['/', '/kontakty', '/raboty', '/korpusnaya-mebel', '/spasibo', '/es', '/en'];

test.describe('public site accessibility', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      const results = await scan(page, path);
      expect(axeDescribe(results), axeDescribe(results)).toBe('');
    });
  }

  test('the lead dialog is accessible once open', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await audit(page, new AxeBuilder({ page }));
    expect(axeDescribe(results), axeDescribe(results)).toBe('');
  });

  test('declining cookies is no harder from the keyboard than accepting', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByText('Мы используем файлы cookie');
    await expect(banner).toBeVisible();

    /**
     * How many Tab presses reach a control.
     *
     * The banner sits last in the document, so both buttons are around 25 stops
     * in — reachable, but only after the whole page. What actually matters, and
     * what GDPR requires, is that refusing is not the harder path: the two must
     * be neighbours, not accept-first-and-decline-buried.
     */
    async function stopsTo(name: string): Promise<number> {
      await page.goto('/');
      const control = page.getByRole('button', { name });
      for (let step = 1; step <= 60; step += 1) {
        await page.keyboard.press('Tab');
        if (await control.evaluate((node) => node === document.activeElement)) return step;
      }
      return -1;
    }

    const accept = await stopsTo('Принять все');
    const decline = await stopsTo('Только необходимые');

    expect(accept, 'accept is not reachable by Tab').toBeGreaterThan(0);
    expect(decline, 'decline is not reachable by Tab').toBeGreaterThan(0);
    expect(Math.abs(decline - accept)).toBeLessThanOrEqual(2);

    // And it works from the keyboard, not only under a mouse.
    await page.keyboard.press('Enter');
    await expect(banner).toBeHidden();
  });

  test('no element takes itself out of the natural tab order', async ({ page }) => {
    await page.goto('/');
    // A positive tabindex reorders the whole page and is almost always a bug.
    const positive = await page
      .locator('[tabindex]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => Number(node.getAttribute('tabindex')))
          .filter((value) => Number.isFinite(value) && value > 0),
      );
    expect(positive).toEqual([]);
  });
});
