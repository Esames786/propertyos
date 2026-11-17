import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { layoutProblems } from '../support/layout';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';

/**
 * Wave 1 integration evidence (Issue #25) → docs/status/integration-e-wave1/screenshots. The states the
 * integration changed or created at the seams: INV-002's CRM quick view at 320 px with 200 % text (E.0's
 * Urdu finding, fixed), E.13's search, tasks and related records with E.1/E.2/E.7 records, PRJ-002's
 * Documents tab, and the Accounting menu of the bank-less ledger clerk. EN and UR at 1440 px, 320 px at
 * 200 % text (`…-200pct-320-xx`) and dark mode with high contrast at 390 px.
 * Run against production builds: `E2E_PORT_OFFSET=3000 npx playwright test --project=evidence tests/evidence/intew1.evidence.spec.ts`.
 */
const DIR = 'docs/status/integration-e-wave1/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const PRINCIPAL: Record<string, string> = { manager: 'usr_lsp_0001', lsp_sales_manager: 'usr_lsp_0004', lsp_project_manager: 'usr_lsp_0005', lsp_finance_controller: 'usr_lsp_0007', lsp_ledger_clerk: 'usr_lsp_0008' };

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function context(browser: Browser, persona: string, viewport: { width: number; height: number }, locale: Locale, options: { scale2?: boolean; dark?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(options.dark ? { colorScheme: 'dark' as const } : {}) });
  const page = await ctx.newPage();
  // Dark mode follows the system colour scheme; high contrast is the saved accessibility preference.
  await seed(page, { persona: persona as PersonaId, locale, ...(options.dark ? { a11y: { motion: 'reduce', contrast: 'more', sound: false, textOnlyGuide: false } } : {}) });
  if (options.scale2) await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), `pref:display:v1:backoffice:tnt_larkspur:${PRINCIPAL[persona]}`);
  return { ctx, page };
}

async function heightsLead(page: Page) {
  return page.evaluate(async () => {
    const res = (await window.__prototype!.transport.request({ method: 'GET', path: '/leads', query: { project: 'prj_heights' } })) as { items: Array<{ id: string }> };
    return res.items[0]!.id;
  });
}

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`a: INV-002 CRM quick view, 1440 and 320 px at 200 % (${lang(locale)})`, async ({ browser }) => {
    for (const [name, viewport, scale2] of [
      ['a01-quick-view-1440', { width: 1440, height: 900 }, false],
      ['a02-quick-view-200pct-320', { width: 320, height: 700 }, true],
    ] as const) {
      const { ctx, page } = await context(browser, 'manager', viewport, locale, { scale2 });
      await page.goto(`${BO}/backoffice/crm/leads-list`);
      await page.locator('main h1').first().waitFor();
      const lead = await heightsLead(page);
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead}&unit=unt_lh_a_0102`);
      const quick = page.getByTestId('unit-quick-view');
      await expect(quick.getByTestId('unit-hold')).toBeVisible();
      if (scale2) expect(await layoutProblems(quick), `${name} ${lang(locale)}`).toEqual([]);
      await shot(page, `int-ew1-${name}-${lang(locale)}`);
      await ctx.close();
    }
  });

  test(`b: E.13 search and tasks with E.1 and E.7 records (${lang(locale)})`, async ({ browser }) => {
    const { ctx, page } = await context(browser, 'lsp_sales_manager', { width: 1440, height: 900 }, locale);
    await page.goto(`${BO}/backoffice/global/unified-search-results?q=OP-&type=opportunity`);
    await expect(page.locator('[data-testid="hub-search-group"][data-type="opportunity"]')).toBeVisible();
    await shot(page, `int-ew1-b01-search-opportunities-1440-${lang(locale)}`);
    await ctx.close();
    const z = await context(browser, 'lsp_finance_controller', { width: 1440, height: 900 }, locale);
    await z.page.goto(`${BO}/backoffice/home/my-tasks`);
    await expect(z.page.locator('[data-testid="task-row"][data-kind="journal_approval"]').first()).toBeVisible();
    await shot(z.page, `int-ew1-b02-tasks-journal-approval-1440-${lang(locale)}`);
    await z.ctx.close();
    const phone = await context(browser, 'lsp_finance_controller', { width: 320, height: 700 }, locale, { scale2: true });
    await phone.page.goto(`${BO}/backoffice/home/my-tasks`);
    const row = phone.page.locator('[data-testid="task-row"][data-kind="journal_approval"]').first();
    await expect(row).toBeVisible();
    expect(await layoutProblems(row)).toEqual([]);
    await shot(phone.page, `int-ew1-b03-tasks-200pct-320-${lang(locale)}`);
    await phone.ctx.close();
  });

  test(`c: PRJ-002 Documents tab from E.13 (${lang(locale)})`, async ({ browser }) => {
    for (const [name, viewport, scale2] of [
      ['c01-p360-documents-1440', { width: 1440, height: 900 }, false],
      ['c02-p360-documents-200pct-320', { width: 320, height: 700 }, true],
    ] as const) {
      const { ctx, page } = await context(browser, 'lsp_project_manager', viewport, locale, { scale2 });
      await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=documents`);
      const docs = page.getByTestId('p360-documents');
      await expect(docs.getByTestId('related-records')).toBeVisible();
      if (scale2) expect(await layoutProblems(docs), `${name} ${lang(locale)}`).toEqual([]);
      await shot(page, `int-ew1-${name}-${lang(locale)}`);
      await ctx.close();
    }
  });
}

test('d: the ledger clerk’s Accounting menu and the bank boundary; dark mode with high contrast at 390 px', async ({ browser }) => {
  const { ctx, page } = await context(browser, 'lsp_ledger_clerk', { width: 1440, height: 900 }, 'en-PK');
  await page.goto(`${BO}/backoffice/acc/chart-of-accounts`);
  await expect(page.getByTestId('ledger-chart')).toBeVisible();
  await shot(page, 'int-ew1-d01-ledger-clerk-chart-1440-en');
  await page.goto(`${BO}/backoffice/bank/bank-import`);
  await expect(page.getByTestId('access-outcome')).toBeVisible();
  await shot(page, 'int-ew1-d02-ledger-clerk-bank-refused-1440-en');
  await ctx.close();
  for (const locale of ['en-PK', 'ur-PK'] as const) {
    const dark = await context(browser, 'lsp_project_manager', { width: 390, height: 844 }, locale, { dark: true });
    await dark.page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=documents`);
    await expect(dark.page.getByTestId('related-records')).toBeVisible();
    await shot(dark.page, `int-ew1-d03-p360-documents-dark-390-${lang(locale)}`);
    await dark.ctx.close();
  }
});
