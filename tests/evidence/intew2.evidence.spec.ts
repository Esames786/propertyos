import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { call, seedPrincipal } from '../support/e3-pricing';
import { EDITORS } from '../support/e3-editors';
import { brokenReferences, layoutProblems } from '../support/layout';

/**
 * Wave 2 combined integration evidence → docs/status/integration-e-wave2/screenshots (Wave 1 `8126322` + E.3 `dfd52f8`
 * + E.8 `7188c74`):
 * - W2-D1: the payment drawer's header at 320 px with 200 % text, its reference whole within its segments (viewport
 *   shots: the header, then scrolled to the balance), English and Urdu;
 * - W2-D4: COM-004 with a fee and a discount, the descriptions wrapping at 320 px / 200 %, English and Urdu;
 * - W2-D3a: an E.3 draft link that is not found ("Draft not available");
 * - one universal search across the areas (journals and suppliers together) at 1440 px, English and Urdu.
 * Every 320 px screen is checked (no broken reference, no layout problem) before it is captured.
 */
const DIR = 'docs/status/integration-e-wave2/screenshots';
const LK = 'tnt_larkspur';
const PRINCIPAL: Record<string, string> = { lsp_accounts: 'usr_lsp_0006', lsp_finance_controller: 'usr_lsp_0007' };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: LK, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function office(browser: Browser, locale: Locale, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 320 ? 700 : 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'lsp_accounts' as PersonaId, locale });
  if (width === 320) for (const p of Object.values(PRINCIPAL)) await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), `pref:display:v1:backoffice:${LK}:${p}`);
  return { page, close: () => ctx.close() };
}

async function become(page: Page, persona: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, record }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, record);
    },
    { persona, record: onboarding(persona) },
  );
}

async function api<T = unknown>(page: Page, persona: string, method: 'GET' | 'POST', path: string, body: Record<string, unknown> = {}): Promise<T> {
  await become(page, persona);
  await page.goto(`${BO}/backoffice/global/my-access`);
  await page.locator('main h1').first().waitFor();
  return page.evaluate(async ({ method, path, body }) => window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body } : {}) }), { method, path, body }) as Promise<T>;
}

async function checked(page: Page, label: string) {
  expect(await brokenReferences(page), `${label}: references`).toEqual([]);
  expect(await layoutProblems(page), `${label}: layout`).toEqual([]);
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`W2-D1 (${lang(locale)}): the payment drawer at 320 px with 200 % text, its reference whole`, async ({ browser }) => {
    test.setTimeout(180_000);
    const l = lang(locale);
    const { page, close } = await office(browser, locale, 320);
    await api(page, 'lsp_finance_controller', 'POST', '/supplier-bills/sbl_lsp_0002/approve');
    await api(page, 'lsp_accounts', 'POST', '/supplier-bills/sbl_lsp_0002/payments', { amount: '1000000', note: 'First instalment of the steel bill' });
    const list = await api<{ items: Array<{ id: string }> }>(page, 'lsp_finance_controller', 'GET', '/supplier-payments');
    await become(page, 'lsp_accounts');
    await page.goto(`${BO}/backoffice/sup/supplier-payment-drawer?record=${list.items[0]!.id}`);
    await expect(page.getByTestId('pay-payment-view').first()).toBeVisible();
    await checked(page, `payment drawer ${l}`);
    await shot(page, `int-ew2-a01-payment-drawer-200pct-320-${l}`);
    await page.getByTestId('pay-balance').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, `int-ew2-a02-payment-drawer-balance-200pct-320-${l}`);
    await become(page, 'lsp_accounts');
    await page.goto(`${BO}/backoffice/sup/supplier-360-workspace?record=sup_lsp_margalla`);
    await expect(page.getByTestId('pay-supplier-360')).toBeVisible();
    await checked(page, `supplier 360 ${l}`);
    await shot(page, `int-ew2-a03-supplier-360-200pct-320-${l}`);
    await close();
  });

  test(`W2-D4 (${lang(locale)}): COM-004 descriptions wrap at 320 px with 200 % text`, async ({ page }) => {
    test.setTimeout(120_000);
    const l = lang(locale);
    await page.setViewportSize({ width: 320, height: 700 });
    await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: 2 });
    const e = EDITORS.find((x) => x.id === 'COM-004')!;
    await page.goto(`${BO}${e.path}`);
    await expect(page.getByTestId(e.page)).toBeVisible();
    const key = `w2-evidence-${l}-${Date.now()}`;
    const r = await call<{ id: string }>(page, { method: 'POST', path: e.api, idempotencyKey: key, body: { projectId: 'prj_heights', title: 'Launch offer', fees: [{ code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: { amount: '1.00', currency: 'PKR' } }], discounts: [{ code: 'EARLY_DISC', label: 'Illustrative discount', rateBps: 2000, maxAmount: { amount: '30.00', currency: 'PKR' } }], idempotencyKey: key } });
    expect(r.ok).toBe(true);
    await page.goto(`${BO}${e.path}?record=${r.ok ? r.body.id : ''}`);
    await expect(e.title(page)).toHaveValue('Launch offer');
    await checked(page, `COM-004 ${l}`);
    await page.getByTestId('commercial-discount-row').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, `int-ew2-b01-com004-descriptions-200pct-320-${l}`);
  });

  test(`one search across the areas (${lang(locale)}), 1440 px: journals and suppliers together`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, close } = await office(browser, locale, 1440);
    await become(page, 'lsp_accounts');
    await page.goto(`${BO}/backoffice/global/unified-search-results?q=LSP-`);
    await expect(page.locator('[data-testid="hub-search-group"][data-type="supplier"]')).toBeVisible();
    await expect(page.locator('[data-testid="hub-search-group"][data-type="journal"]')).toBeVisible();
    await shot(page, `int-ew2-c01-search-across-areas-1440-${lang(locale)}`);
    await close();
  });
}

test('W2-D3a: an E.3 draft link that is not found reads "Draft not available" (1440 px, en)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPrincipal(page, 'res_e3qa_pricing');
  const e = EDITORS.find((x) => x.id === 'COM-005')!;
  await page.goto(`${BO}${e.path}?record=pad_999999`);
  await expect(page.getByTestId('state-not-found')).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { name: 'Draft not available' })).toBeVisible();
  await shot(page, 'int-ew2-d01-draft-not-available-1440-en');
});
