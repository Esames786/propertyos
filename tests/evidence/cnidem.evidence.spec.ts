import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * GitHub Issue #21 evidence → docs/status/cn-idempotency/screenshots. The credit-note drawer on A-101's
 * November bill (Ayesha, treasurer): the answer to a first press lost on the way back (the drawer says
 * what to do), the same press again showing the credit note already issued (one note, one toast), and a
 * changed press after a lost answer refused in words with the invoice shown as it is now. English and
 * Urdu; desktop, phone, and 320 px at 200 % text (`…-200pct-320-xx`). The business date is Monday
 * 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=1600 npx playwright test --project=evidence tests/evidence/cnidem.evidence.spec.ts`.
 */
const DIR = 'docs/status/cn-idempotency/screenshots';
const AYESHA: PersonaId = 'alnoor_treasurer';
const KAMRAN: PersonaId = 'alnoor_resident_a101';
const DISPLAY_AYESHA = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002';
const PHONE = { width: 320, height: 700 };
const REASON = 'Lift out of service for two weeks';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale, textScale2 = false) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, { staff: AYESHA, locale });
  if (textScale2) {
    await page.goto(`${BO}/backoffice/global/my-access`);
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), DISPLAY_AYESHA);
  }
  return page;
}

/** A-101's November bill, opened by Ayesha; the credit-note POSTs watched (see the e2e spec). */
async function invoice(page: Page) {
  await become(page, 'customer', KAMRAN);
  await page.goto(`${CU}/customer/portal/home`);
  await page.getByTestId('dues-bill').first().waitFor();
  const home = await societyApi<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home');
  if (!home.ok) throw new Error('no bill');
  await become(page, 'backoffice', AYESHA);
  await page.goto(`${BO}/backoffice/fin/invoice-workspace?record=${home.res.position.current.invoiceId}`);
  await page.getByTestId('invoice-workspace').waitFor();
  await settle(page);
  await page.evaluate(() => {
    const w = window as unknown as { __cn: { loseNext: boolean } };
    w.__cn = { loseNext: false };
    const transport = window.__prototype!.transport;
    const original = transport.request.bind(transport);
    transport.request = (async (req: Parameters<typeof original>[0]) => {
      if (req.method !== 'POST' || !/\/credit-notes$/.test(req.path)) return original(req);
      const answer = await original(req);
      if (w.__cn.loseNext) {
        w.__cn.loseNext = false;
        throw new TypeError('Failed to fetch');
      }
      return answer;
    }) as typeof transport.request;
  });
}
const loseNextAnswer = (page: Page) => page.evaluate(() => void ((window as unknown as { __cn: { loseNext: boolean } }).__cn.loseNext = true));
const amountBox = (page: Page) => page.getByTestId('credit-note-drawer').locator('input[data-testid="credit-amount-maintenance"]');
const reasonBox = (page: Page) => page.getByTestId('credit-note-drawer').locator('textarea[data-testid="credit-reason"]');

const OFFICE_BAR_HIDDEN = '[data-testid="bottom-nav"] { visibility: hidden !important; }';
async function shot(page: Page, name: string, full = false) {
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: OFFICE_BAR_HIDDEN } : {}) });
  // The name says the viewport: the picture is exactly that wide.
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(vw);
}

/** First press (answer lost), then the drawer's message in view. */
async function noAnswer(page: Page, amount: string) {
  await page.getByTestId('invoice-credit-note').click();
  await amountBox(page).fill(amount);
  await reasonBox(page).fill(REASON);
  await loseNextAnswer(page);
  await page.getByTestId('credit-note-save').click();
  const alert = page.getByTestId('credit-note-outcome-unknown');
  await alert.waitFor();
  // The start of the message at the top of the drawer's scrolling area (at 320 px / 200 % it is taller than the space left).
  await alert.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await settle(page, 300);
}

/** After a lost answer, the amount changed and pressed again: refused, message in view. */
async function changedRetry(page: Page, amount: string) {
  await amountBox(page).fill(amount);
  await page.getByTestId('credit-note-save').click();
  const alert = page.getByTestId('credit-note-key-reused');
  await alert.waitFor();
  // The start of the message at the top of the drawer's scrolling area (at 320 px / 200 % it is taller than the space left).
  await alert.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await settle(page, 300);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  test(`Issue #21 ${l}: a lost answer, the same press again, a changed press — 1440, 390 and 320 px at 200 % text`, async ({ browser }) => {
    test.setTimeout(240_000);
    // Desktop: the whole story.
    let page = await context(browser, { width: 1440, height: 900 }, locale);
    await invoice(page);
    await noAnswer(page, '600');
    await shot(page, `n01-drawer-no-answer-1440-${l}`);
    await page.getByTestId('credit-note-save').click();
    await page.getByTestId('credit-note-drawer').waitFor({ state: 'hidden' });
    await expect(page.getByTestId('toast-success')).toHaveCount(1);
    await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(1);
    await settle(page, 300);
    await shot(page, `n02-retry-shows-the-note-issued-1440-${l}`);
    await noAnswer(page, '100');
    await changedRetry(page, '150');
    await shot(page, `n03-drawer-key-reused-1440-${l}`);
    await page.keyboard.press('Escape');
    await page.getByTestId('credit-note-drawer').waitFor({ state: 'hidden' });
    await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(2);
    await settle(page, 300);
    await shot(page, `n04-invoice-two-notes-1440-${l}`, true);
    await page.context().close();

    // Phone.
    page = await context(browser, VIEWPORTS.phone, locale);
    await invoice(page);
    await noAnswer(page, '600');
    await shot(page, `n01-drawer-no-answer-${VIEWPORTS.phone.width}-${l}`);
    await changedRetry(page, '500');
    await shot(page, `n03-drawer-key-reused-${VIEWPORTS.phone.width}-${l}`);
    await page.context().close();

    // 320 px with text at 200 % (Ayesha's own setting).
    page = await context(browser, PHONE, locale, true);
    await invoice(page);
    await noAnswer(page, '600');
    await shot(page, `n01-drawer-no-answer-200pct-320-${l}`);
    await changedRetry(page, '500');
    await shot(page, `n03-drawer-key-reused-200pct-320-${l}`);
    await page.context().close();
  });
}
