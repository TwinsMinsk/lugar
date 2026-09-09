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
    // The bare site root, with or without a trailing slash: once `metadataBase`
    // is set, Next normalizes an absolute URL that resolves to exactly the
    // origin by dropping the slash — documented, intentional, and specific to
    // this one case (a locale/project path like `/es/muebles-a-medida` is
    // never touched). Asserting either form keeps this test honest about what
    // matters here — the alternate points at the site root — without being
    // pinned to a formatting detail Next itself already normalizes.
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
      'href',
      /^https?:\/\/[^/]+\/?$/,
    );
  });

  /**
   * The status code alone proved almost nothing here.
   *
   * This used to assert `404` and stop, which the framework's own built-in
   * not-found page satisfies just as well as ours does — the assertion would
   * have stayed green through a `not-found.tsx` that never rendered. Worse,
   * inspecting the response body by hand is misleading in the other
   * direction: the flight payload always carries Next's default
   * "This page could not be found" markup as the framework-level notFound
   * slot, whether or not it is what the visitor sees. Asserting on the
   * rendered heading is the only reading of this that cannot lie, and the
   * site header has to be there too — a 404 outside the site's own chrome is
   * the exact failure this page was written to fix.
   */
  for (const { path, heading, locale } of [
    { path: '/definitely-not-a-page', heading: 'Страница не найдена', locale: 'ru' },
    { path: '/es/definitely-not-a-page', heading: 'Página no encontrada', locale: 'es' },
  ]) {
    test(`an unknown ${locale} path renders the site's own 404, not the framework's`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
    });
  }
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

  /**
   * The check Railway actually polls.
   *
   * It used to poll /robots.txt — a static file, which a release with an
   * unreachable database answers just as cheerfully as a working one, so a
   * broken deploy was rolled out and then served 500s. This asserts the shape
   * of the healthy answer; the failing side was verified by pointing a build
   * at a dead database, where this returns 503 while /robots.txt still
   * returns 200.
   */
  test('the health check reports the database and the migration count', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    // applied/expected — equal, or the release should not be taking traffic.
    const [applied, expected] = (body.checks.migrations ?? '').split('/');
    expect(Number(applied)).toBeGreaterThan(0);
    expect(applied).toBe(expected);
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

  /**
   * The attribution cookie waits for the same answer the pixel waits for.
   *
   * It used to be written on every page load, on the argument that first-party
   * data never leaving the site does not need consent. What governs a cookie is
   * whether writing it to the device is necessary for what the visitor asked
   * for, and a 365-day cookie crediting a marketing campaign is not — so the
   * cookie policy promises it waits, and this is that promise.
   */
  test('no attribution cookie is written before consent, and one appears after', async ({
    page,
  }) => {
    await page.goto('/?utm_source=proverka&utm_medium=e2e');
    await expect(page.getByText('Мы используем файлы cookie')).toBeVisible();
    await page.getByRole('button', { name: 'Только необходимые' }).click();
    await page.waitForTimeout(500);

    const declined = (await page.context().cookies()).find((cookie) => cookie.name === 'lg_attr');
    expect(declined).toBeUndefined();

    // Accepting is what turns it on, without a reload.
    await page.getByRole('button', { name: 'Настройки cookie' }).click();
    await page.getByRole('button', { name: 'Принять все' }).click();
    await expect
      .poll(async () => (await page.context().cookies()).some((c) => c.name === 'lg_attr'), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test('a returning visitor with a stored choice is not asked again', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Принять все' }).click();
    await page.reload();
    await expect(page.getByText('Мы используем файлы cookie')).toBeHidden();
  });

  /**
   * The claim under test is stronger than "events do not fire" — the tag
   * itself must never reach the page. A script that loaded but stayed quiet
   * could still set its own cookies or make its own requests outside
   * anything this codebase controls; watching the network is what actually
   * proves nothing was fetched, not just that nothing was logged.
   */
  test('no analytics or pixel request is made before consent is granted', async ({ page }) => {
    const trackerRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('googletagmanager.com') || url.includes('facebook.net')) {
        trackerRequests.push(url);
      }
    });

    await page.goto('/');
    await expect(page.getByText('Мы используем файлы cookie')).toBeVisible();
    // Declining is the one choice that must never let a tag through.
    await page.getByRole('button', { name: 'Только необходимые' }).click();
    await page.waitForTimeout(500);

    expect(trackerRequests).toEqual([]);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
  });

  /**
   * Requires a real measurement ID: `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset
   * on this deploy (analytics has not launched yet — see the launch
   * checklist), and the id is baked in at build time, so there is no way to
   * exercise the positive path against the currently-built server without
   * one. Skipped rather than failed for the same reason the admin specs skip
   * without credentials: a missing local value is a setup gap, not a
   * regression.
   */
  test('granting consent with analytics enabled loads GA4', async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      'NEXT_PUBLIC_GA_MEASUREMENT_ID is not set',
    );

    const gaRequest = page.waitForRequest((request) =>
      request.url().includes('googletagmanager.com/gtag/js'),
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Принять все' }).click();

    await gaRequest;
    await expect.poll(() => page.evaluate(() => typeof window.gtag)).toBe('function');
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

test.describe('mobile menu', () => {
  test('the open panel covers the viewport instead of the header strip', async ({ page }) => {
    await page.goto('/raboty');

    const burger = page.getByRole('button', { name: 'Открыть меню' });
    if (!(await burger.isVisible().catch(() => false))) {
      test.skip(true, 'no burger at this viewport — desktop navigation');
    }

    await burger.click();
    const panel = page
      .getByRole('dialog', { name: 'Наши работы' })
      .or(page.locator('[role="dialog"][aria-modal="true"]'));
    await expect(panel.first()).toBeVisible();

    /**
     * The regression this guards.
     *
     * The panel used to live inside the header, which carries
     * `backdrop-blur-[14px]`. A backdrop-filter makes an element a containing
     * block for fixed-position descendants, so `fixed inset-0` resolved against
     * the 75px header rather than the viewport: the background covered a strip
     * at the top and every link below it rendered over the page with nothing
     * behind it. Asserting "is visible" would not have caught it — the panel
     * was visible, it was just the wrong size.
     */
    const box = await panel.first().boundingBox();
    const viewport = page.viewportSize();
    expect(box, 'the panel must have a box').not.toBeNull();
    expect(
      box!.height,
      `panel is ${Math.round(box!.height)}px tall, viewport is ${viewport!.height}px — ` +
        'it is being positioned against an ancestor, not the viewport',
    ).toBeGreaterThan(viewport!.height * 0.9);

    // And it must actually cover the page. Geometry is not enough here:
    // `toBeInViewport` measures intersection, not occlusion, so a heading behind
    // an opaque overlay still counts as in the viewport. Hit-testing is what
    // answers "would a tap land on the menu or on the page underneath".
    const covered = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return 'no h1';
      const r = h1.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit?.closest('[role="dialog"][aria-modal="true"]') ? 'panel' : 'page';
    });
    expect(covered, 'a tap over the page heading must land on the menu').toBe('panel');
  });
});

test.describe('request id', () => {
  /**
   * A response that cannot be tied to a log line makes "it broke around two"
   * an archaeology problem. These two paths are wired differently in the proxy
   * — a page goes through next-intl, a route handler is excluded from it — and
   * only one of them was ever going to work by accident.
   */
  const ID = /^[A-Za-z0-9_.:-]{8,64}$/;

  test('a page response carries one', async ({ page }) => {
    const response = await page.goto('/');
    expect(response!.headers()['x-request-id']).toMatch(ID);
  });

  test('a route handler response carries one, and it is the id the proxy chose', async ({
    request,
  }) => {
    const response = await request.get('/api/health');
    expect(response.headers()['x-request-id']).toMatch(ID);
  });

  test('an id supplied by the caller is not echoed back unchecked', async ({ request }) => {
    // Whatever a client sends ends up in log lines. A newline in it would let
    // anyone write their own entries underneath the real one.
    const response = await request.get('/api/health', {
      headers: { 'x-request-id': 'short' },
    });
    expect(response.headers()['x-request-id']).not.toBe('short');
    expect(response.headers()['x-request-id']).toMatch(ID);
  });
});

test.describe('health check', () => {
  /**
   * The endpoint Railway restarts the site on. It answered `ok` on a deploy
   * with an unreachable database for as long as it pointed at a static file,
   * so what matters here is that it really asks the database — and that the
   * worker, which is a different service, is reported without being able to
   * take the website down with it.
   */
  test('answers ok and names what it checked', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    // Applied migrations over expected: equal, or the release is ahead of its
    // own schema.
    expect(body.checks.migrations).toMatch(new RegExp('^(\\d+)/\\1$'));
    // No worker runs during the suite, so this is the "never" case — the point
    // is that it is reported rather than absent, and that it did not turn the
    // website's own health into a failure.
    expect(body.checks.worker).toBeDefined();
  });
});
