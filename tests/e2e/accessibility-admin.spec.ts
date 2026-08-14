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
});
