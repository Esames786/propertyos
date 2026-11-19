import type { Browser, Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { call, seedPrincipal } from '../support/e3-pricing';
import { EDITORS, HEIGHTS_UNIT } from '../support/e3-editors';
import { brokenReferences, layoutProblems } from '../support/layout';

/**
 * Wave 2 combined integration (`integration/e-wave2`: Wave 1 `8126322` + E.3 `dfd52f8` + E.8 `7188c74`) in the
 * running backoffice:
 * - W2-D1: at 320 px with 200 % text, in English and Urdu, every E.3 and E.8 drawer and record header keeps each
 *   reference whole inside its segments ("LSP-PV-2026-000" / "1" was the payment drawer's header), with no other
 *   layout problem;
 * - W2-D3a/b: an E.3 draft link that is not found reads "Draft not available", and no E.3 draft visit is posted to
 *   the E.13 recent records;
 * - E.8 stays DEV-only (an organisation of another edition gets the register's page);
 * - one universal search across the areas for a person holding the ledger and payables.
 */
const LK = 'tnt_larkspur';
const PRINCIPAL: Record<string, string> = { lsp_accounts: 'usr_lsp_0006', lsp_finance_controller: 'usr_lsp_0007', lsp_budget_holder: 'usr_lsp_0021' };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const onboarding = (tenant: string, persona: string) =>
  JSON.stringify({ profile: { tenantId: tenant, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function office(browser: Browser, locale: Locale, width = 320) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 320 ? 700 : 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'lsp_accounts' as PersonaId, locale });
  if (width === 320) for (const p of Object.values(PRINCIPAL)) await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), `pref:display:v1:backoffice:${LK}:${p}`);
  return { page, close: () => ctx.close() };
}

async function become(page: Page, persona: string, tenant = LK) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, tenant, record }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:${tenant}:${persona}:backoffice`, record);
    },
    { persona, tenant, record: onboarding(tenant, persona) },
  );
}

async function api<T = unknown>(page: Page, persona: string, method: 'GET' | 'POST', path: string, body: Record<string, unknown> = {}): Promise<T> {
  await become(page, persona);
  await page.goto(`${BO}/backoffice/global/my-access`);
  await page.locator('main h1').first().waitFor();
  return page.evaluate(async ({ method, path, body }) => window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body } : {}) }), { method, path, body }) as Promise<T>;
}

async function open(page: Page, persona: string, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/** Every reference whole within its segments, nothing clipped or spilled, in the page and in an open drawer. */
async function reflowOk(page: Page, label: string) {
  await page.waitForTimeout(300);
  expect(await brokenReferences(page), `${label}: references`).toEqual([]);
  expect(await layoutProblems(page), `${label}: layout`).toEqual([]);
  const drawer = page.getByRole('dialog');
  if (await drawer.count()) expect(await layoutProblems(drawer), `${label}: drawer layout`).toEqual([]);
}

const DRAFT_BODY: Record<string, Record<string, unknown>> = {
  'COM-001': { projectId: 'prj_heights', allocations: [{ kind: 'down_payment', shareBps: 2000 }, { kind: 'instalments', shareBps: 8000, count: 4 }] },
  'COM-003': { projectId: 'prj_heights', rules: [{ unitType: 'residential', baseRate: { amount: '12500.50', currency: 'PKR' }, floorRiseBps: 100, cornerPremiumBps: 0, parkFacingPremiumBps: 250 }] },
  'COM-004': { projectId: 'prj_heights', fees: [{ code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: { amount: '1.00', currency: 'PKR' } }], discounts: [{ code: 'EARLY_DISC', label: 'Illustrative discount', rateBps: 2000, maxAmount: { amount: '30.00', currency: 'PKR' } }] },
  'COM-005': { projectId: 'prj_heights', rules: [{ subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' }, requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false }] },
};

/** A draft of this editor, made by the signed-in test principal through the app's own transport. */
async function draft(page: Page, e: (typeof EDITORS)[number], title: string): Promise<string> {
  const key = `w2-${e.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await call<{ id: string }>(page, { method: 'POST', path: e.api, idempotencyKey: key, body: { ...DRAFT_BODY[e.id]!, title, idempotencyKey: key } });
  expect(r.ok, `${e.id} create`).toBe(true);
  return r.ok ? r.body.id : '';
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`W2-D1 E.8 at 320 px with 200 % text (${lang(locale)}): the payment drawers and every record header keep their references whole`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const l = lang(locale);
    const { page, close } = await office(browser, locale);
    // Made in this session by a second person: an approved bill and a payment instruction prepared from it.
    await api(page, 'lsp_finance_controller', 'POST', '/supplier-bills/sbl_lsp_0002/approve');
    await api(page, 'lsp_accounts', 'POST', '/supplier-bills/sbl_lsp_0002/payments', { amount: '1000000', note: 'First instalment of the steel bill' });
    const payments = await api<{ items: Array<{ id: string }> }>(page, 'lsp_finance_controller', 'GET', '/supplier-payments');
    const budgets = await api<{ items: Array<{ id: string }> }>(page, 'lsp_finance_controller', 'GET', '/budgets');
    const screens: Array<[string, string, string, string]> = [
      ['payment drawer', 'lsp_accounts', `/backoffice/sup/supplier-payment-drawer?record=${payments.items[0]!.id}`, 'pay-payment-view'],
      ['supplier 360', 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_margalla', 'pay-supplier-360'],
      ['bill workspace', 'lsp_accounts', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace'],
      ['expense workspace', 'lsp_finance_controller', '/backoffice/exp/expense-workspace?record=exp_lsp_0004', 'pay-expense-workspace'],
      ['budget workspace', 'lsp_finance_controller', `/backoffice/exp/budget-workspace?record=${budgets.items[0]!.id}`, 'pay-budget-workspace'],
      ['supplier ledger', 'lsp_accounts', '/backoffice/sup/supplier-ledger?supplier=sup_lsp_margalla', 'pay-ledger-view'],
      ['payments list', 'lsp_finance_controller', '/backoffice/sup/supplier-payment-drawer', 'pay-payment-list'],
      ['petty cash', 'lsp_finance_controller', '/backoffice/exp/petty-cash', 'pay-petty'],
    ];
    for (const [name, persona, path, ready] of screens) {
      await open(page, persona, path, ready);
      await reflowOk(page, `${name} ${l}`);
    }
    // The new-instruction drawer, opened from the approved bill.
    await open(page, 'lsp_accounts', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace');
    await page.getByTestId('pay-bill-instruct').click();
    await expect(page.getByTestId('pay-new-payment').first()).toBeVisible();
    await reflowOk(page, `new payment drawer ${l}`);
    const { violations } = await scanA11y(page, testInfo, `int-ew2-new-payment-200pct-320-${l}`);
    expect(violations).toEqual([]);
    await close();
  });

  test(`W2-D1 E.3 at 320 px with 200 % text (${lang(locale)}): the price-change drawer, the price history and each editor with a draft open`, async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    const l = lang(locale);
    await page.setViewportSize({ width: 320, height: 700 });
    await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: 2 });
    await page.goto(`${BO}/backoffice/inv/edit-price-drawer?record=${HEIGHTS_UNIT}`);
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await reflowOk(page, `price-change drawer ${l}`);
    await page.goto(`${BO}/backoffice/inv/unit-price-history?record=${HEIGHTS_UNIT}`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await reflowOk(page, `price history ${l}`);
    for (const e of EDITORS) {
      await page.goto(`${BO}${e.path}`);
      await expect(page.getByTestId(e.page)).toBeVisible();
      const id = await draft(page, e, 'Reflow draft');
      await page.goto(`${BO}${e.path}?record=${id}`);
      await expect(e.title(page)).toHaveValue('Reflow draft');
      await reflowOk(page, `${e.id} ${l}`);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('W2-D3: an E.3 draft link not found reads "Draft not available"; no E.3 draft visit is posted to the recent records', async ({ page, consoleErrors }) => {
  // Every E.13 recent-record visit the app sends, across reloads (kept in this tab's session storage).
  await page.addInitScript(() => {
    let published: { transport: { request: (req: { method: string; path: string; body?: unknown }) => Promise<unknown> } } | undefined;
    Object.defineProperty(window, '__prototype', {
      configurable: true,
      get: () => published,
      set: (value: typeof published) => {
        published = value;
        const t = value!.transport;
        const original = t.request.bind(t);
        t.request = async (req) => {
          if (req.method === 'POST' && req.path === '/workspace/recents') sessionStorage.setItem('e2e:recents', JSON.stringify([...JSON.parse(sessionStorage.getItem('e2e:recents') ?? '[]'), String((req.body as { recordId?: unknown } | undefined)?.recordId)]));
          return original(req);
        };
      },
    });
  });
  await seedPrincipal(page, 'res_e3qa_pricing');
  for (const e of EDITORS) {
    await page.goto(`${BO}${e.path}`);
    await expect(page.getByTestId(e.page)).toBeVisible();
    const id = await draft(page, e, 'Visit draft');
    await page.goto(`${BO}${e.path}?record=${id}`);
    await expect(e.title(page)).toHaveValue('Visit draft');
    await page.goto(`${BO}${e.path}?record=${id.replace(/\d+$/, '999999')}`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { name: 'Draft not available' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { name: /^Revise/ })).toHaveCount(0);
  }
  // A real E.13 record is still recorded (the rule only leaves out E.3 drafts).
  await page.goto(`${BO}/backoffice/inv/unit-quick-view?record=${HEIGHTS_UNIT}`);
  await expect.poll(async () => JSON.parse((await page.evaluate(() => sessionStorage.getItem('e2e:recents'))) ?? '[]')).toEqual([HEIGHTS_UNIT]);
  expect(consoleErrors).toEqual([]);
});

test('E.8 stays DEV-only: an organisation of another edition gets the register’s page at a payables address', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'rb_manager' as PersonaId });
  await page.goto(`${BO}/backoffice/sup/suppliers-list`);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByTestId('pay-supplier-list')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('one universal search across the areas: Faiza finds journals and suppliers, each opening its own screen', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'lsp_accounts' as PersonaId });
  await page.goto(`${BO}/backoffice/global/unified-search-results?q=LSP-`);
  await expect(page.getByTestId('unified-search')).toBeVisible();
  await expect(page.locator('[data-testid="hub-search-group"][data-type="journal"]')).toBeVisible();
  await expect(page.locator('[data-testid="hub-search-group"][data-type="supplier"]')).toBeVisible();
  await page.locator('[data-testid="hub-search-group"][data-type="supplier"] [data-testid="hub-hit-link"]').first().click();
  await expect(page).toHaveURL(/\/backoffice\/sup\/supplier-360-workspace\?record=sup_/);
  await expect(page.getByTestId('pay-supplier-360')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
