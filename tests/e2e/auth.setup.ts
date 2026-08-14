import { expect, test as setup } from '@playwright/test';

export const ADMIN_STORAGE_STATE = 'tests/e2e/.auth/admin.json';

/**
 * Signs in once and saves the session for every admin spec to reuse.
 *
 * Logging in per test hits better-auth's brute-force protection: it allows
 * three sign-in attempts per window and returns 429 after that, so the fourth
 * spec in a suite fails with what looks like bad credentials. That limit is
 * correct production behaviour and should not be relaxed for tests — reusing
 * one session is both the standard Playwright pattern and much faster.
 */
setup('authenticate as owner', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  setup.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set');

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Пароль').fill(password!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
