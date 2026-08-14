import { expect, test, type Page } from '@playwright/test';

/**
 * Performance budget.
 *
 * A one-off measurement tells you where you are; a budget tells you when you
 * stop being there. These ceilings are set just above what the site actually
 * ships today, so an accidental import of a heavy library fails here rather
 * than on a visitor's phone.
 *
 * The numbers are bytes over the wire (gzip), measured through the Resource
 * Timing API, which is what a real browser accounts for — not the uncompressed
 * size a bundler reports.
 */
const BUDGET = {
  /** Scripts on a marketing page. Today: ~208 KB. */
  script: 260 * 1024,
  /** Everything: HTML, CSS, fonts, JS, RSC prefetches. Today: ~400 KB. */
  total: 520 * 1024,
  /** Fonts: two families, latin + cyrillic. Today: ~124 KB. */
  font: 160 * 1024,
};

type Measured = { script: number; font: number; stylesheet: number; total: number; cls: number };

async function measure(page: Page, path: string): Promise<Measured> {
  await page.goto(path, { waitUntil: 'load' });
  // Long enough for late layout shifts (fonts swapping, images arriving) to be
  // recorded — a CLS read taken at load is always zero and always a lie.
  await page.waitForTimeout(1200);

  return page.evaluate(() => {
    let script = 0;
    let font = 0;
    let stylesheet = 0;
    let total = 0;

    for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      total += entry.encodedBodySize;
      if (/\.js(\?|$)/.test(entry.name)) script += entry.encodedBodySize;
      else if (/\.woff2?(\?|$)/.test(entry.name)) font += entry.encodedBodySize;
      else if (/\.css(\?|$)/.test(entry.name)) stylesheet += entry.encodedBodySize;
    }

    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    total += navigation?.encodedBodySize ?? 0;

    let cls = 0;
    for (const shift of performance.getEntriesByType('layout-shift') as Array<
      PerformanceEntry & { value: number; hadRecentInput: boolean }
    >) {
      if (!shift.hadRecentInput) cls += shift.value;
    }

    return { script, font, stylesheet, total, cls: Math.round(cls * 1000) / 1000 };
  });
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

test.describe('performance budget', () => {
  for (const path of ['/', '/korpusnaya-mebel']) {
    test(`${path} stays within budget`, async ({ page }) => {
      const measured = await measure(page, path);

      expect(measured.script, `scripts: ${kb(measured.script)}`).toBeLessThan(BUDGET.script);
      expect(measured.font, `fonts: ${kb(measured.font)}`).toBeLessThan(BUDGET.font);
      expect(measured.total, `page total: ${kb(measured.total)}`).toBeLessThan(BUDGET.total);
    });
  }

  test('the home page does not shift as it loads', async ({ page }) => {
    const measured = await measure(page, '/');

    // Zero, not merely "good". Every image on this site renders into a reserved
    // box and the fonts carry size-adjust metrics, so any shift at all means one
    // of those two guarantees has been broken.
    expect(measured.cls, `CLS ${measured.cls}`).toBe(0);
  });

  test('nothing on the critical path comes from another origin', async ({ page, baseURL }) => {
    // Compared against the configured base, not page.url(): at the moment the
    // first request fires the page is still about:blank, so using it flags the
    // document request itself.
    const ownHost = new URL(baseURL!).host;
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host !== ownHost && url.protocol !== 'data:') external.push(request.url());
    });

    await page.goto('/', { waitUntil: 'load' });

    // Fonts are self-hosted and analytics only load after consent, so a request
    // to a third party before any interaction means something regressed into
    // the render path — a round trip we do not control, and a privacy leak.
    expect(external, external.join('\n')).toEqual([]);
  });
});
