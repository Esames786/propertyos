import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi, textScaleOf } from '../support/society';

/**
 * GitHub Issue #21 in the office app (production build): the credit-note drawer sends one request key
 * per credit note. Ayesha (treasurer) credits A-101's November bill. The answer to her first press is
 * lost on the way back (the server issued the note); pressing "Issue credit note" again shows that same
 * note as issued, with one success toast, and the invoice holds one note. A second adjustment, typed
 * with the keyboard, is a new credit note under a new key, even with the same content. A press after a
 * lost answer with changed amounts is refused (the key was used), the drawer says so in words and
 * shows the invoice as it is now. English and Urdu; 320 px with text at 200 %; axe. The business date
 * is Monday 26 October 2026.
 */
const AYESHA: PersonaId = 'alnoor_treasurer';
const KAMRAN: PersonaId = 'alnoor_resident_a101';
const DISPLAY_AYESHA = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002';
const PHONE = { width: 320, height: 700 };
const REASON = 'Lift out of service for two weeks';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const api = societyApi;
const TEXT = {
  'en-PK': { retrySame: 'No answer arrived, so it is not known whether the credit note was issued', keyReused: 'An earlier attempt from this form already issued a credit note with other details' },
  'ur-PK': { retrySame: 'کوئی جواب نہیں ملا، اس لیے معلوم نہیں کہ کریڈٹ نوٹ جاری ہوا یا نہیں', keyReused: 'اس فارم سے پہلے کی ایک کوشش دوسری تفصیلات کے ساتھ کریڈٹ نوٹ جاری کر چکی ہے' },
} as const;

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

/** A-101's November bill (the resident's current bill) and its workspace, opened by Ayesha. */
async function invoiceOfA101(page: Page) {
  await become(page, 'customer', KAMRAN);
  await page.goto(`${CU}/customer/portal/home`);
  await expect(page.getByTestId('dues-bill').first()).toBeVisible();
  const invoiceId = (await ok(api<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'))).position.current.invoiceId;
  await become(page, 'backoffice', AYESHA);
  await page.goto(`${BO}/backoffice/fin/invoice-workspace?record=${invoiceId}`);
  await expect(page.getByTestId('invoice-workspace')).toBeVisible();
  return invoiceId;
}

/**
 * Records every credit-note POST the app sends (its request key and body key) and, when asked, loses the
 * answer to the next one after the server acted on it: the network failing on the way back. Installed on
 * this page's transport (a reload installs a new transport, so it is installed after the last navigation).
 */
async function watchCreditNotes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __cn: { sent: Array<{ key?: string; bodyKey?: unknown }>; loseNext: boolean } };
    w.__cn = { sent: [], loseNext: false };
    const transport = window.__prototype!.transport;
    const original = transport.request.bind(transport);
    transport.request = (async (req: Parameters<typeof original>[0]) => {
      if (req.method !== 'POST' || !/\/credit-notes$/.test(req.path)) return original(req);
      w.__cn.sent.push({ key: req.idempotencyKey, bodyKey: (req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey });
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
const sentKeys = (page: Page) => page.evaluate(() => (window as unknown as { __cn: { sent: Array<{ key?: string; bodyKey?: unknown }> } }).__cn.sent);
const notesOf = async (page: Page, invoiceId: string) => (await ok(api<{ creditNotes: Array<{ ref: string; amount: { amount: string } }> }>(page, `/billing/invoices/${invoiceId}`))).creditNotes;

const amountBox = (drawer: Locator, category: string) => drawer.locator(`input[data-testid="credit-amount-${category}"], [data-testid="credit-amount-${category}"] input`).first();
const reasonBox = (drawer: Locator) => drawer.locator('textarea[data-testid="credit-reason"], [data-testid="credit-reason"] textarea').first();

/** Tab (bounded) until the focused element matches; fails if the keyboard never gets there. */
async function tabTo(page: Page, target: Locator, what: string, max = 25) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  expect(await target.evaluate((el) => el === document.activeElement), `keyboard reaches ${what}`).toBe(true);
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`Issue #21 ${lang(locale)}: a retry after a lost answer shows the credit note already issued (one note, one toast); a second adjustment by keyboard is a new note under a new key; a changed retry is refused in words`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page);
    await seedSociety(page, { staff: AYESHA, locale });
    const invoiceId = await invoiceOfA101(page);
    await watchCreditNotes(page);
    const drawer = page.getByTestId('credit-note-drawer');
    const maintenance = drawer.locator('[data-testid="credit-line"][data-category="maintenance"]');
    const toasts = page.getByTestId('toast-success');

    // 1. First press: the server issues the note, the answer is lost. The drawer stays and says what to do.
    await page.getByTestId('invoice-credit-note').click();
    await expect(maintenance).toHaveAttribute('data-open', '3000.00');
    await amountBox(drawer, 'maintenance').fill('600');
    await reasonBox(drawer).fill(REASON);
    await loseNextAnswer(page);
    await drawer.getByTestId('credit-note-save').click();
    const unknown = drawer.getByTestId('credit-note-outcome-unknown');
    await expect(unknown).toContainText(TEXT[locale].retrySame);
    await expect(unknown).toHaveAttribute('role', 'alert');
    await expect(drawer).toBeVisible();
    expect((await notesOf(page, invoiceId)).map((n) => n.ref)).toEqual(['ANR-CN-0001']);
    await axe(page, testInfo, `cn21-drawer-outcome-unknown-1440-${lang(locale)}`);

    // 2. The same press again: the same key; the answer is the note already issued, shown as issued once.
    await drawer.getByTestId('credit-note-save').click();
    await expect(drawer).toBeHidden();
    await expect(toasts).toHaveCount(1);
    await expect(toasts.first()).toContainText('ANR-CN-0001');
    await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(1);
    expect((await notesOf(page, invoiceId)).map((n) => [n.ref, n.amount.amount])).toEqual([['ANR-CN-0001', '600.00']]);
    const [first, retry] = await sentKeys(page);
    expect(first!.key).toMatch(/^cn-[0-9a-f-]{36}$/);
    expect(retry).toEqual(first);
    expect(first!.bodyKey).toBe(first!.key);

    // 3. A second adjustment, by keyboard only, with the same content: a new note under a new key.
    await page.getByTestId('invoice-credit-note').focus();
    await page.keyboard.press('Enter');
    await expect(drawer).toBeVisible();
    await expect(maintenance).toHaveAttribute('data-open', '2400.00');
    await tabTo(page, amountBox(drawer, 'maintenance'), 'the maintenance amount');
    await page.keyboard.type('600');
    await tabTo(page, reasonBox(drawer), 'the reason');
    await page.keyboard.type(REASON);
    await tabTo(page, drawer.getByTestId('credit-note-save'), 'Issue credit note');
    await page.keyboard.press('Enter');
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(2);
    await expect(toasts.filter({ hasText: 'ANR-CN-0002' })).toHaveCount(1);
    const third = (await sentKeys(page))[2]!;
    expect(third.key).toMatch(/^cn-/);
    expect(third.key).not.toBe(first!.key);
    expect((await notesOf(page, invoiceId)).map((n) => n.ref)).toEqual(['ANR-CN-0001', 'ANR-CN-0002']);

    // 4. A lost answer, then a changed press with the same key: refused in words; the invoice shown as it is now.
    await page.getByTestId('invoice-credit-note').click();
    await amountBox(drawer, 'maintenance').fill('100');
    await reasonBox(drawer).fill(REASON);
    await loseNextAnswer(page);
    await drawer.getByTestId('credit-note-save').click();
    await expect(drawer.getByTestId('credit-note-outcome-unknown')).toBeVisible();
    await amountBox(drawer, 'maintenance').fill('150');
    await drawer.getByTestId('credit-note-save').click();
    const reused = drawer.getByTestId('credit-note-key-reused');
    await expect(reused).toContainText(TEXT[locale].keyReused);
    await expect(reused).toHaveAttribute('role', 'alert');
    // Refreshed: 600 + 600 + 100 credited, 1,700.00 open; nothing for the changed press.
    await expect(maintenance).toHaveAttribute('data-open', '1700.00');
    expect((await notesOf(page, invoiceId)).map((n) => [n.ref, n.amount.amount])).toEqual([['ANR-CN-0001', '600.00'], ['ANR-CN-0002', '600.00'], ['ANR-CN-0003', '100.00']]);
    const sent = await sentKeys(page);
    expect(sent[4]!.key).toBe(sent[3]!.key);
    expect(sent[3]!.key).not.toBe(third.key);
    await axe(page, testInfo, `cn21-drawer-key-reused-1440-${lang(locale)}`);
    // Escape closes it; the page shows the three notes.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });

  test(`Issue #21 ${lang(locale)}: the credit-note drawer and its two new messages at 320 px with text at 200 %: nothing clipped or off screen; axe`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page);
    await seedSociety(page, { staff: AYESHA, locale });
    await page.goto(`${BO}/backoffice/global/my-access`);
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), DISPLAY_AYESHA);
    await page.setViewportSize(PHONE);
    await invoiceOfA101(page);
    await expect.poll(() => textScaleOf(page)).toBe('2');
    await watchCreditNotes(page);
    const drawer = page.getByTestId('credit-note-drawer');
    const check = async (what: string) => {
      const parts = [...(await drawer.getByTestId('credit-line').all()), drawer.getByTestId('credit-note-save'), ...(await drawer.getByRole('alert').all())];
      for (const part of parts) expect.soft(await layoutProblems(part), `${what} 320 200 % ${locale}`).toEqual([]);
      // The drawer's own buttons stay on screen (inside the 320 px viewport).
      for (const b of await drawer.getByRole('button').all()) {
        const r = await b.boundingBox();
        if (r) expect.soft(r.x >= -1 && r.x + r.width <= 321, `${what}: a button off screen ${locale} (${Math.round(r.x)}–${Math.round(r.x + r.width)})`).toBe(true);
      }
    };
    await page.getByTestId('invoice-credit-note').click();
    await amountBox(drawer, 'maintenance').fill('600');
    await reasonBox(drawer).fill(REASON);
    await loseNextAnswer(page);
    await drawer.getByTestId('credit-note-save').click();
    await expect(drawer.getByTestId('credit-note-outcome-unknown')).toBeVisible();
    await check('no answer');
    await axe(page, testInfo, `cn21-drawer-outcome-unknown-200pct-320-${lang(locale)}`);
    await amountBox(drawer, 'maintenance').fill('500');
    await drawer.getByTestId('credit-note-save').click();
    await expect(drawer.getByTestId('credit-note-key-reused')).toBeVisible();
    await check('key reused');
    await axe(page, testInfo, `cn21-drawer-key-reused-200pct-320-${lang(locale)}`);
    expect(consoleErrors).toEqual([]);
  });
}
