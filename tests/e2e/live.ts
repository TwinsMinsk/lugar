import type { Page } from '@playwright/test';

/**
 * Reading what the public site actually serves.
 *
 * Public pages are cached HTML, so re-querying a DOM already in the browser can
 * never observe a change — an assertion has to reload. Pair this with
 * `expect.poll` rather than a plain locator assertion:
 *
 *   await expect.poll(live(page, '/', () => h1Text(page)), LIVE).toBe(marker)
 *
 * The retry window absorbs one specific race. This suite runs many workers
 * against one site, so a render of a public route can already be in flight when
 * a mutation invalidates it, complete a moment later, and populate the cache
 * with what it read before the change. The next request re-renders correctly.
 *
 * The window is deliberately far shorter than a route's own cache lifetime
 * (`PUBLIC_CACHE_PROFILE` — minutes). That is what keeps the assertion honest:
 * if invalidation were broken rather than merely raced, nothing would refresh
 * inside this window and the test would still fail.
 */
export const LIVE = { timeout: 20_000 } as const;

export function live<T>(page: Page, path: string, read: () => Promise<T>): () => Promise<T> {
  return async () => {
    await page.goto(path);
    return read();
  };
}

/**
 * Text of the page's h1 — the usual "did the change reach the site" probe.
 *
 * Named for the element rather than "heading": specs routinely hold a locator
 * called `heading` for the field being edited, and a shadowed import fails at
 * runtime rather than at the type check.
 */
export function h1Text(page: Page): Promise<string> {
  return page.locator('h1').innerText();
}
