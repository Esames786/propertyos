import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * D.1 + S.1 integration (Issue #6): the cashbook read as cards on phones and at large text sizes; the
 * financial timestamps in the organisation's time zone (Asia/Karachi) around midnight; and owner
 * decision D-46: office cash waits for a second person's count before any receipt.
 */
const api = societyApi;
const PRINCIPAL: Partial<Record<PersonaId, string>> = { alnoor_treasurer: 'usr_anr_0002', alnoor_accounts: 'usr_anr_0004' };

async function office(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

/** The person's own office display setting (D.1 personalization), written before the first load. */
async function textSize(page: Page, persona: PersonaId, scale: number) {
  const key = `pref:display:v1:backoffice:tnt_alnoor:${PRINCIPAL[persona]}`;
  const value = JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(`int:${key}`)) {
      localStorage.setItem(`int:${key}`, '1');
      localStorage.setItem(key, value);
    }
  }, { key, value });
}

/** Elements of a card that stick out of it, or whose text is cut (scrollWidth beyond their box). */
const clipped = (card: Locator) =>
  card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const out: string[] = [];
    for (const d of el.querySelectorAll<HTMLElement>('*')) {
      const r = d.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`outside: ${d.tagName} "${(d.textContent ?? '').trim().slice(0, 30)}"`);
      const style = getComputedStyle(d);
      if (style.overflow !== 'visible' && d.scrollWidth > d.clientWidth + 1) out.push(`cut: ${d.tagName} "${(d.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return out;
  });

test.describe('Issue #6 item 1: the cashbook as cards on phones and at large text sizes', () => {
  const cases: Array<[ViewportName, number, Locale]> = [
    ['reflow', 2, 'ur-PK'],
    ['reflow', 2, 'en-PK'],
    ['phone', 1, 'ur-PK'],
    ['phone', 2, 'en-PK'],
  ];
  for (const [vp, scale, locale] of cases) {
    test(`${VIEWPORTS[vp].width} px at ${scale * 100} %, ${locale}: every line a card with every fact in full, nothing cut, keyboard reaches each record`, async ({ page, consoleErrors }, testInfo) => {
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedSociety(page, { staff: 'alnoor_treasurer', locale });
      await textSize(page, 'alnoor_treasurer', scale);
      await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-cards');
      await expect(page.getByTestId('cashbook-lines')).toBeHidden();
      const cards = page.getByTestId('cashbook-card');
      await expect(cards).toHaveCount(6);
      const book = await api<{ lines: Array<{ sourceRef: string; counterparty?: string }> }>(page, '/finance/cashbook', 'GET', {}, { period: '2026-10', account: 'all' });
      expect(book.ok).toBe(true);
      for (const [i, line] of (book.ok ? book.res.lines : []).entries()) {
        const card = cards.nth(i);
        // The full reference and the payer or payee, as on the desktop table.
        await expect(card).toContainText(line.sourceRef);
        if (line.counterparty) await expect(card).toContainText(line.counterparty);
        await expect(card.getByTestId('cashbook-card-amount')).toBeVisible();
        expect(await clipped(card), `card ${line.sourceRef}`).toEqual([]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // Keyboard: from the first card's record, Tab reaches every next card's record in order.
      const links = page.getByTestId('cashbook-card-link');
      await links.first().focus();
      for (let i = 1; i < 6; i++) {
        for (let k = 0; k < 6 && !(await links.nth(i).evaluate((el) => el === document.activeElement)); k++) await page.keyboard.press('Tab');
        await expect(links.nth(i)).toBeFocused();
      }
      await axe(page, testInfo, `cashbook-cards-${VIEWPORTS[vp].width}-${scale * 100}-${locale}`);
      // The drill-down opens the line's record (a voucher opens in its drawer, a payment on its page).
      const target = (await links.first().getAttribute('href'))!;
      await links.first().click();
      await expect(page).toHaveURL(`${BO}${target}`);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('the desktop keeps its table at 100 %; at 200 % text the same desktop reads cards', async ({ page, consoleErrors }) => {
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-lines');
    await expect(page.getByTestId('cashbook-cards')).toBeHidden();
    await expect(page.getByTestId('cashbook-line')).toHaveCount(6);
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '2'));
    await expect(page.getByTestId('cashbook-cards')).toBeVisible();
    await expect(page.getByTestId('cashbook-lines')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Issue #6 item 2: financial timestamps in Asia/Karachi around midnight', () => {
  test('an approval at 23:59 and a posting at 00:00 (Karachi) both show 26 October; the line stays in October', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    // 23:59:40 in Karachi on 31 October (18:59:40 UTC); the demo's business date is 26 October.
    await page.clock.setFixedTime(new Date('2026-10-31T18:59:40Z'));
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    // The seeded lift voucher (7,500) waits for the treasurer.
    await office(page, '/backoffice/apr/approval-360-view?record=apr_anr_0004', 'approval-workspace');
    await page.getByTestId('approval-decide').click();
    const drawer = page.getByTestId('decide-drawer');
    await drawer.getByTestId('decide-reason').fill('Lift call-out checked against the bill.');
    await drawer.getByTestId('decide-submit').click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('approval-decisions')).toContainText(/26 Oct 2026, 11:59\s?pm/i);
    await expect(page.getByTestId('approval-decisions')).not.toContainText('27 Oct');

    // Past midnight in Karachi: the accounts officer posts the voucher.
    await page.clock.setFixedTime(new Date('2026-10-31T19:00:15Z'));
    await become(page, 'backoffice', 'alnoor_accounts');
    await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-page');
    const list = await api<{ items: Array<{ id: string; ref: string; amount: { amount: string } }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'approved' });
    const lift = (list.ok ? list.res.items : []).find((v) => v.amount.amount === '7500.00')!;
    const posted = await api<{ voucher: { postedAt: string } }>(page, `/finance/vouchers/${lift.id}/post`, 'POST');
    expect(posted.ok && posted.res.voucher.postedAt).toMatch(/^2026-10-26T00:00:15\.\d{3}\+05:00$/);
    await office(page, `/backoffice/bank/cashbook?period=2026-10&voucher=${lift.id}`, 'voucher-drawer');
    await expect(page.getByTestId('voucher-drawer')).toContainText(/26 Oct 2026, 12:00\s?am/i);
    // Its cashbook line keeps its own date (25 October) in October; nothing moves to another month.
    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-testid="cashbook-line"][data-source="cash_voucher"]`).filter({ hasText: lift.ref })).toContainText('25 Oct 2026');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D-46: office cash waits for a second person\'s count', () => {
  test('recorded cash shows as waiting on the finance dashboard, the cashbook, the account and the society dashboard; the collector cannot confirm it', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
    await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
    await become(page, 'backoffice', 'alnoor_accounts');
    await office(page, '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101', 'office-drawer');
    const drawer = page.getByTestId('office-drawer');
    await drawer.getByTestId('office-amount').fill('2000');
    await drawer.getByTestId('office-submit').click();
    await expect(drawer.getByTestId('office-done')).toHaveAttribute('data-status', 'awaiting_count');
    const href = await drawer.getByTestId('office-open-collection').getAttribute('href');
    // The collector sees why they cannot confirm their own cash.
    await office(page, href!, 'batch-drawer');
    await expect(page.getByTestId('batch-not-yours')).toBeVisible();
    await expect(page.getByTestId('batch-confirm')).toHaveCount(0);
    // The account shows it as cash waiting, not as a payment.
    await office(page, '/backoffice/billing/accounts/ba_anr_a101', 'account-workspace');
    await expect(page.getByTestId('account-cash-awaiting')).toContainText('2,000');

    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
    await expect(page.getByTestId('fin-cash-awaiting-count')).toContainText('1 office collection');
    await office(page, '/backoffice/bank/cashbook', 'cashbook-page');
    await expect(page.locator('[data-testid="pending-item"][data-kind="cash_awaiting_count"]')).toHaveCount(1);
    await office(page, '/backoffice', 'society-dashboard');
    await expect(page.locator('[data-testid="society-task"][data-task="count_office_cash"]')).toHaveAttribute('data-yours', 'true');
    expect(consoleErrors).toEqual([]);
  });
});

