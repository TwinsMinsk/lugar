import { expect, test } from '@playwright/test';

import { spanishMobile } from './lead-phone';

/**
 * End-to-end coverage for the public site.
 *
 * These assert behaviour that unit tests structurally cannot: locale routing
 * through the proxy, server-rendered metadata, focus management in real
 * dialogs, and the consent gate's effect on what actually reaches the page.
 */

test.describe('locale routing', () => {
  test('Russian serves on unprefixed paths and the other locales are prefixed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/LUGAR/);
    // Not asserted against the exact seeded copy: the admin acceptance spec
    // publishes a marker heading to this very page while running in parallel,
    // and this test is about routing, not about what the Russian hero says.
    // admin.spec covers that string end to end.
    await expect(page.locator('h1')).not.toBeEmpty();

    await page.goto('/es');
    await expect(page.locator('h1')).toContainText('Muebles hechos exactamente para tu casa');

    await page.goto('/en');
    await expect(page.locator('h1')).toContainText('Furniture built exactly for your home');
  });

  test('switching language resolves the equivalent document, not a prefix swap', async ({
    page,
  }) => {
    // The English slug differs from the Russian one, so a naive prefix swap
    // would land on /en/korpusnaya-mebel and 404.
    await page.goto('/korpusnaya-mebel');
    await page.getByRole('link', { name: /Переключить на EN/i }).click();
    await expect(page).toHaveURL(/\/en\/built-in-furniture$/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('emits hreflang alternates for every published locale plus x-default', async ({ page }) => {
    await page.goto('/');
    const alternates = page.locator('link[rel="alternate"]');
    await expect(alternates).toHaveCount(4);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', /\/$/);
  });

  test('an unknown path 404s rather than resolving to something plausible', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-page');
    expect(response?.status()).toBe(404);
  });
});

test.describe('SEO surfaces', () => {
  test('sitemap lists published pages and excludes noindex ones', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();

    expect(xml).toContain('<loc>');
    expect(xml).toContain('/korpusnaya-mebel');
    // The thank-you page is noindex, so it must not be advertised.
    expect(xml).not.toContain('spasibo');
    // Admin is not a document and can never appear.
    expect(xml).not.toContain('/admin');
  });

  test('robots disallows admin and points at the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Sitemap:');
  });

  test('the thank-you page is reachable but noindex', async ({ page }) => {
    await page.goto('/spasibo');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('admin is gated', () => {
  test('an anonymous visitor is redirected away from /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('consent', () => {
  test('analytics stay off until consent is granted', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Мы используем файлы cookie')).toBeVisible();

    // Declining must be a single click of equal prominence, not buried.
    await page.getByRole('button', { name: 'Только необходимые' }).click();
    await expect(page.getByText('Мы используем файлы cookie')).toBeHidden();

    const cookie = (await page.context().cookies()).find((c) => c.name === 'lg_consent');
    expect(cookie).toBeDefined();
    expect(decodeURIComponent(cookie!.value)).toContain('"analytics":false');
  });

  test('a returning visitor with a stored choice is not asked again', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Принять все' }).click();
    await page.reload();
    await expect(page.getByText('Мы используем файлы cookie')).toBeHidden();
  });
});

test.describe('lead capture', () => {
  test('the dialog traps focus, closes on Escape and returns focus to the opener', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Focus must move into the panel, not stay behind the overlay.
    await expect(dialog.locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('rejects an invalid phone number without creating anything', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя').fill('Тест');
    await dialog.getByLabel('Телефон').fill('12345');
    await dialog.locator('input[name="consentPersonalData"]').check();
    // Dwell guard: a submission faster than a human can type is discarded.
    await page.waitForTimeout(3000);
    await dialog.getByRole('button', { name: 'Отправить заявку' }).click();

    await expect(dialog.getByText('Проверьте номер телефона')).toBeVisible();
  });

  test('a valid submission succeeds and offers the WhatsApp hand-off', async ({ page }) => {
    /**
     * A fresh caller identity per run.
     *
     * Submissions are rate limited to five per hour, keyed on both the IP and
     * the phone number — correct production behaviour that must not be relaxed.
     * With a fixed number and a fixed loopback address, the suite could only be
     * run twice in an hour before this failed as if lead capture were broken.
     *
     * The address goes in X-Forwarded-For, which is exactly where it comes from
     * in the deploy, and the number stays a well-formed Spanish mobile so the
     * E.164 parsing still gets a real workout.
     */
    const stamp = Date.now();
    const phone = spanishMobile(stamp);
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(stamp / 1000) % 256}.${stamp % 256}.7`,
    });

    await page.goto('/?utm_source=e2e&utm_medium=test&utm_campaign=spec');
    await page
      .getByRole('button', { name: /Получить расчёт|Написать в WhatsApp/ })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя').fill('E2E Клиент');
    await dialog.getByLabel('Телефон').fill(phone);
    await dialog.locator('input[name="consentPersonalData"]').check();
    await page.waitForTimeout(3000);
    await dialog.getByRole('button', { name: 'Отправить заявку' }).click();

    await expect(dialog.getByText('Заявка отправлена')).toBeVisible({ timeout: 15_000 });

    // The hand-off link must carry a percent-encoded message, not raw Cyrillic.
    const handoff = dialog.getByRole('link', { name: 'Продолжить в WhatsApp' });
    const href = await handoff.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href).not.toMatch(/[А-Яа-я]/);
  });
});

test.describe('portfolio', () => {
  test('the index is never a blank area — it lists work or says there is none', async ({
    page,
  }) => {
    await page.goto('/raboty');
    await expect(page.getByRole('group', { name: 'Фильтр по категориям' })).toBeVisible();

    /**
     * Either state is correct; a blank region is not.
     *
     * Asserting specifically that the index is empty would hardcode the seed
     * state, and the admin suite legitimately publishes a project for a few
     * seconds while running in parallel. The claim worth defending is that the
     * page never looks broken — no projects reads as deliberate, not missing.
     */
    const cards = await page.locator('a[href^="/raboty/"]').count();
    if (cards === 0) {
      await expect(page.getByText('В этой категории пока нет работ.')).toBeVisible();
    } else {
      await expect(page.getByText('В этой категории пока нет работ.')).toHaveCount(0);
    }
  });
});

test.describe('accessibility basics', () => {
  test('the skip link is the first focusable element and targets main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/Перейти к содержимому/);
    await expect(focused).toHaveAttribute('href', '#main');
  });

  test('every page exposes exactly one h1', async ({ page }) => {
    for (const path of ['/', '/korpusnaya-mebel', '/dveri', '/raboty', '/o-kompanii']) {
      await page.goto(path);
      await expect(page.locator('h1'), `${path} must have exactly one h1`).toHaveCount(1);
    }
  });
});
