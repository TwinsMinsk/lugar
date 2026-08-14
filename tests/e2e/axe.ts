import type AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Shared axe configuration.
 *
 * Scoped to WCAG 2.1 A and AA — the level the brief asks for. axe catches what
 * a machine can catch: contrast, names, roles, structure. That is a floor, not
 * a ceiling, which is why the keyboard assertions live alongside it.
 */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type Results = Awaited<ReturnType<AxeBuilder['analyze']>>;

const channel = (value: number) =>
  value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

function luminance([r, g, b]: number[]): number {
  const [R, G, B] = [r!, g!, b!].map((v) => channel(v / 255));
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
}

function contrast(a: number[], b: number[]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/**
 * Re-measure the contrast violations axe reports.
 *
 * Tailwind v4 emits this project's oklch tokens as `lab()`, and axe converts
 * `lab()` to sRGB itself rather than asking the browser. For the warm neutrals
 * its answer matches; for the chromatic accent it does not. It reported the
 * primary button as #6c7b68 at 4.45:1 — Chrome paints #556651, which is
 * 6.17:1, verified by screenshotting the button and sampling a pixel.
 *
 * So axe is used to find candidates, and each one is checked again through the
 * browser's own colour pipeline (canvas parses a colour exactly as the painter
 * does). A genuine failure still fails; a mis-converted colour does not.
 */
async function keepRealContrastFailures(page: Page, results: Results): Promise<Results> {
  const violations = [];

  for (const violation of results.violations) {
    if (violation.id !== 'color-contrast') {
      violations.push(violation);
      continue;
    }

    const nodes = [];
    for (const node of violation.nodes) {
      const target = node.target[0];
      if (typeof target !== 'string') {
        nodes.push(node);
        continue;
      }

      const measured = await page
        .evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;

          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return null;
          const paint = (value: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = value;
            ctx.fillRect(0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
          };

          const style = getComputedStyle(element);
          // Walk up for the first painted background: axe does the same, and a
          // transparent element inherits whatever is behind it.
          let background = style.backgroundColor;
          let parent: Element | null = element;
          while (parent && /rgba\(0, 0, 0, 0\)|transparent/.test(background)) {
            parent = parent.parentElement;
            background = parent ? getComputedStyle(parent).backgroundColor : 'rgb(255,255,255)';
          }

          const size = parseFloat(style.fontSize);
          const weight = Number(style.fontWeight) || 400;
          // WCAG large text: 24px, or 18.66px when bold.
          const large = size >= 24 || (size >= 18.66 && weight >= 700);

          return { foreground: paint(style.color), background: paint(background), large };
        }, target)
        .catch(() => null);

      if (!measured) {
        nodes.push(node);
        continue;
      }

      const ratio = contrast(measured.foreground, measured.background);
      if (ratio < (measured.large ? 3 : 4.5)) nodes.push(node);
    }

    if (nodes.length > 0) violations.push({ ...violation, nodes });
  }

  return { ...results, violations };
}

/** Run axe over the current page and keep only violations that survive checking. */
export async function audit(page: Page, builder: AxeBuilder): Promise<Results> {
  const results = await builder.withTags(WCAG_TAGS).analyze();
  return keepRealContrastFailures(page, results);
}

/** Readable failure output: axe's own result object is a wall of JSON. */
export function axeDescribe(results: Results): string {
  return results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes
          .slice(0, 4)
          .map((node) => `    ${node.target.join(' ')}\n      ${node.failureSummary}`)
          .join('\n'),
    )
    .join('\n\n');
}
