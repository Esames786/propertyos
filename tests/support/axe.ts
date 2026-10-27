import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface A11yResult {
  violations: Array<{ id: string; impact: string | null | undefined; help: string; nodes: number; targets: string[] }>;
}

/**
 * Entrance animations (opacity/transform) must finish before scanning, or axe measures text while
 * it is still fading in and reports a contrast failure that no reader ever sees at rest.
 */
async function settleAnimations(page: Page) {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => a.playState !== 'running') &&
        [...document.querySelectorAll<HTMLElement>('[style*="opacity"]')].every((el) => {
          const o = parseFloat(el.style.opacity);
          return Number.isNaN(o) || o === 0 || o === 1;
        }),
      undefined,
      { timeout: 5000 },
    )
    .catch(() => undefined);
}

/**
 * Runs axe-core with WCAG 2.0/2.1/2.2 A+AA rules. Results are attached to the test report.
 * Automated checks cover only part of WCAG; manual screen-reader testing is still required.
 */
export async function scanA11y(page: Page, testInfo: TestInfo, label: string): Promise<A11yResult> {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify({ label, url: page.url(), passes: results.passes.length, violations }, null, 2),
    contentType: 'application/json',
  });
  return { violations };
}
