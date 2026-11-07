import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, displayKey, expect, HQ, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * UX batch B2 (docs/ux-backlog@90c2b0a §8): accessibility blockers and one-line shared fixes, on the
 * production build, in English and Urdu.
 * - SH-01: the full-screen command palette on a phone closes by a visible, named Cancel (and Escape);
 *   focus returns to whatever opened it.
 * - OPS-01: a refused Request 360 drawer or dialog shows the reason inside it (role="alert", focused),
 *   keeps its inputs, and stays open; actions started on the page still report on the page.
 * - SH-02: a MetricCard that is not a link exposes its value; a StatTile's name has its context once.
 * - SH-04, RES-06, SH-10, SH-11, SH-12 (component tests cover SH-12; FormsLab is the only user).
 * Plus 320 px at 200 % text (layoutProblems), axe, and dark mode with high contrast where styles changed.
 */
const IMRAN: PersonaId = 'alnoor_manager';
const PHONE = { width: 320, height: 700 };
const DISPLAY_IMRAN = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const LOCALES: Locale[] = ['en-PK', 'ur-PK'];
const CANCEL: Record<Locale, string> = { 'en-PK': 'Cancel', 'ur-PK': 'منسوخ کریں' };
const WRONG_STEP: Record<Locale, string> = {
  'en-PK': 'This step is not possible now (someone may have changed it).',
  'ur-PK': 'یہ قدم ابھی ممکن نہیں',
};
const TOO_SHORT: Record<Locale, string> = { 'en-PK': 'Write at least 10 characters.', 'ur-PK': 'کم از کم 10 حروف لکھیں۔' };

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

async function calm(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

/** Imran's office text size (the office keeps it per person, version 2). */
const textSize = (page: Page, scale: number) =>
  page.evaluate(
    ([key, scale]) => localStorage.setItem(key as string, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })),
    [DISPLAY_IMRAN, scale] as const,
  );

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** A field's text box, whether the test id sits on the box itself or on its wrapper. */
const box = (scope: Page | Locator, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

/** The element that has focus, described for assertions. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? { tag: el.tagName, type: (el as HTMLInputElement).type ?? '', testId: el.getAttribute('data-testid') ?? '' } : null;
  });

// ---------------------------------------------------------------------------------------------
// SH-01: the command palette on a phone
// ---------------------------------------------------------------------------------------------

test.describe('SH-01 the command palette can be closed on a phone', () => {
  for (const locale of LOCALES) {
    test(`390 px, ${lang(locale)}: a visible Cancel and Escape close the palette, focus returns to the search button; keyboard reaches Cancel; axe`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await page.setViewportSize(VIEWPORTS.phone);
      await seedSociety(page, { staff: IMRAN, locale });
      await page.goto(`${BO}/backoffice`);
      await expect(page.getByTestId('society-dashboard')).toBeVisible();
      const trigger = page.getByTestId('search-button');
      const palette = page.getByTestId('command-palette');

      // Touch: open from the header search, close with the visible Cancel.
      await trigger.click();
      await expect(palette).toBeVisible();
      const cancel = palette.getByRole('button', { name: CANCEL[locale], exact: true });
      await expect(cancel).toBeVisible();
      const c = (await cancel.boundingBox())!;
      expect(c.height, 'Cancel at least 44 px tall').toBeGreaterThanOrEqual(44);
      expect(c.width, 'Cancel at least 44 px wide').toBeGreaterThanOrEqual(44);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(VIEWPORTS.phone.width);
      // It sits at the end of the search row: the right in English, the left in Urdu.
      const s = (await palette.getByRole('searchbox').boundingBox())!;
      if (locale === 'ur-PK') expect(c.x).toBeLessThan(s.x);
      else expect(c.x).toBeGreaterThan(s.x);
      await axe(page, testInfo, `palette-open-390-${lang(locale)}`);
      await cancel.click();
      await expect(palette).toBeHidden();
      await expect(trigger).toBeFocused();

      // Escape still closes it, focus back on the trigger.
      await trigger.click();
      await expect(palette).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette).toBeHidden();
      await expect(trigger).toBeFocused();

      // Keyboard only: Enter opens, Tab from the search box reaches Cancel, Enter closes.
      await page.keyboard.press('Enter');
      await expect(palette).toBeVisible();
      await expect(palette.getByRole('searchbox')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(palette).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(consoleErrors).toEqual([]);
    });

    test(`320 px at 200 % text, ${lang(locale)}: Cancel is whole and nothing in the palette is clipped`, async ({ page, consoleErrors }) => {
      await calm(page);
      await page.setViewportSize(PHONE);
      await seedSociety(page, { staff: IMRAN, locale });
      await page.goto(`${BO}/backoffice/global/my-access`);
      await textSize(page, 2);
      await page.goto(`${BO}/backoffice`);
      await expect(page.getByTestId('society-dashboard')).toBeVisible();
      await page.getByTestId('search-button').click();
      const palette = page.getByTestId('command-palette');
      await expect(palette).toBeVisible();
      await page.keyboard.type('A-1');
      await expect(palette.getByRole('menuitem').first()).toBeVisible();
      const cancel = palette.getByRole('button', { name: CANCEL[locale], exact: true });
      await expect(cancel).toBeVisible();
      // The page behind the modal is not checked here (the society dashboard has its own, older overflow at this size).
      expect(await layoutProblems(palette), `palette 320 200 % ${locale}`).toEqual([]);
      await cancel.click();
      await expect(palette).toBeHidden();
      await expect(page.getByTestId('search-button')).toBeFocused();
      expect(consoleErrors).toEqual([]);
    });
  }

  test('desktop: no Cancel is added (the overlay and the Esc hint are there); Escape closes and focus returns', async ({ page, consoleErrors }) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    await page.getByTestId('search-button').click();
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('command-palette-cancel')).toBeHidden();
    await expect(palette.getByText('Esc', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(page.getByTestId('search-button')).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test('Platform HQ on a phone: the same Cancel closes the palette and returns focus', async ({ page, consoleErrors }) => {
    await calm(page);
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { app: 'platform', persona: 'supreme_admin' });
    await page.goto(`${HQ}/hq`);
    await expect(page.getByTestId('hq-kpis')).toBeVisible();
    await page.getByTestId('search-button').click();
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await palette.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(palette).toBeHidden();
    await expect(page.getByTestId('search-button')).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test('the essentials tour’s search step can be left on a phone with Cancel', async ({ page, consoleErrors }) => {
    await calm(page);
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('welcome-start').click();
    const card = page.getByTestId('tour-card');
    await expect(card).toBeVisible();
    for (let i = 0; i < 12 && (await card.getAttribute('data-step-id')) !== 'search'; i++) {
      await page.getByTestId('tour-next').click();
      await expect(card).toBeVisible();
    }
    await expect(card).toHaveAttribute('data-step-id', 'search');
    await page.locator('[data-tour-id="command-search"]:visible').click();
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await palette.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(palette).toBeHidden();
    await expect(card).toBeVisible();
    await expect(card).not.toHaveAttribute('data-step-id', 'search');
    expect(consoleErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// OPS-01: refusals inside the Request 360 drawers and dialogs
// ---------------------------------------------------------------------------------------------

const api = societyApi;
interface RequestRow {
  id: string;
  ref: string;
  title: string;
  state: string;
}

/** A seeded request of the Al-Noor storyline, found by its title (the mock API applies Imran's scope). */
async function requestNamed(page: Page, title: string, kind?: 'community_issue'): Promise<RequestRow> {
  const r = await api<{ items: RequestRow[] }>(page, '/ops/requests', 'GET', {}, { q: title, ...(kind ? { kind } : {}) });
  if (!r.ok) throw new Error(`request list refused: ${r.code}`);
  const row = r.res.items.find((x) => x.title.includes(title));
  if (!row) throw new Error(`no request "${title}"`);
  return row;
}

async function changeBehind(page: Page, path: string, body: unknown) {
  const r = await api(page, path, 'POST', body);
  expect(r.ok, `${path} (the change made "in another tab")`).toBe(true);
}

const WS = (id: string, drawer?: string) => `${BO}/backoffice/mnt/maintenance-360-workspace?record=${id}${drawer ? `&drawer=${drawer}` : ''}`;

/** Opens Imran's Request 360 for a seeded request, optionally with a drawer, and returns it. */
async function open(page: Page, title: string, drawer?: string, kind?: 'community_issue') {
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const row = await requestNamed(page, title, kind);
  await page.goto(WS(row.id, drawer));
  await expect(page.getByTestId('request-workspace')).toBeVisible();
  return row;
}

/** The refusal sits inside the open drawer or dialog, is announced (role="alert") and has focus. */
async function expectRefusalIn(page: Page, surface: Locator, text: string) {
  await expect(surface).toBeVisible();
  const alert = surface.getByRole('alert');
  await expect(alert).toContainText(text);
  await expect(surface.getByTestId('refusal-alert')).toBeFocused();
  await expect(alert).toBeInViewport();
  // Nothing is left behind the modal on the page.
  expect(await page.getByTestId('request-workspace').locator('[role="alert"]').count()).toBe(0);
}

test.describe('OPS-01 Request 360: a refused action is explained where it was taken', () => {
  test('triage: a request cancelled meanwhile; the reason is in the drawer, the note is kept; reopening starts clean', async ({ page, consoleErrors }, testInfo) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    const r = await open(page, 'Geyser not heating', 'triage');
    const drawer = page.getByTestId('triage-drawer');
    await box(drawer, 'triage-note').fill('Check the pilot light first');
    await changeBehind(page, `/ops/requests/${r.id}/cancel`, { reason: 'The resident fixed it herself.' });
    await drawer.getByTestId('triage-submit').click();
    await expectRefusalIn(page, drawer, WRONG_STEP['en-PK']);
    await expect(box(drawer, 'triage-note')).toHaveValue('Check the pilot light first');
    await axe(page, testInfo, 'triage-refused-1440-en');
    // Closing the drawer clears the refusal; opening it again starts without it.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('request-workspace').locator('[role="alert"]')).toHaveCount(0);
    await page.getByTestId('action-triage').click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('alert')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('assign: the chosen technician is kept and the refusal is shown in the drawer', async ({ page, consoleErrors }) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    const r = await open(page, 'Water seepage', 'assign');
    const drawer = page.getByTestId('assign-drawer');
    const option = drawer.locator('[data-testid="technician-option"]:not([disabled])').first();
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await changeBehind(page, `/ops/requests/${r.id}/cancel`, { reason: 'The flat above repaired its pipe.' });
    await drawer.getByTestId('assign-submit').click();
    await expectRefusalIn(page, drawer, WRONG_STEP['en-PK']);
    await expect(option).toHaveAttribute('aria-checked', 'true');
    expect(consoleErrors).toEqual([]);
  });

  test('complete and hold: a work order put on hold meanwhile; each drawer explains its own refusal and keeps what was typed', async ({ page, consoleErrors }) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    const r = await open(page, 'AC drain leaking', 'complete');
    const detail = await api<{ workOrders: Array<{ id: string; state: string }> }>(page, `/ops/requests/${r.id}`);
    if (!detail.ok) throw new Error('detail');
    const order = detail.res.workOrders.find((w) => w.state === 'in_progress')!;
    const complete = page.getByTestId('complete-drawer');
    await box(complete, 'complete-note').fill('Cleared the drain line; no water after an hour.');
    await complete.getByTestId('complete-photos-sample').click();
    await box(complete, 'complete-photos-alt-0').fill('Dry floor under the indoor unit');
    await changeBehind(page, `/ops/work-orders/${order.id}/hold`, { note: 'Waiting for a new drain pump.' });
    await complete.getByTestId('complete-submit').click();
    await expectRefusalIn(page, complete, WRONG_STEP['en-PK']);
    await expect(box(complete, 'complete-note')).toHaveValue('Cleared the drain line; no water after an hour.');

    // The hold drawer, opened on the same stale page: already on hold, so refused there too.
    await page.goto(WS(r.id, 'hold'));
    const hold = page.getByTestId('hold-drawer');
    await expect(hold).toBeVisible();
    await expect(hold.getByRole('alert')).toHaveCount(0);
    await changeBehind(page, `/ops/work-orders/${order.id}/resume`, {});
    await changeBehind(page, `/ops/work-orders/${order.id}/hold`, { note: 'Pump ordered again.' });
    // The page still believes "in progress" (it read the record before), so Hold is offered and refused.
    await box(hold, 'hold-note').fill('Waiting for the part');
    await hold.getByTestId('hold-submit').click();
    await expectRefusalIn(page, hold, WRONG_STEP['en-PK']);
    await expect(box(hold, 'hold-note')).toHaveValue('Waiting for the part');
    expect(consoleErrors).toEqual([]);
  });

  test('merge and resolve: an issue chosen as the target is resolved meanwhile; a hidden issue cannot be resolved', async ({ page, consoleErrors }) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    const r = await open(page, 'Stray dogs', 'merge', 'community_issue');
    const merge = page.getByTestId('merge-drawer');
    const candidate = merge.getByTestId('merge-candidate').first();
    await candidate.click();
    const targetRef = await candidate.getAttribute('data-ref');
    const issues = await api<{ items: RequestRow[] }>(page, '/ops/requests', 'GET', {}, { kind: 'community_issue' });
    const target = issues.ok ? issues.res.items.find((x) => x.ref === targetRef)! : null;
    await changeBehind(page, `/issues/${target!.id}/resolve`, { summary: 'The committee fixed this today.' });
    await merge.getByTestId('merge-submit').click();
    await expectRefusalIn(page, merge, 'Choose another open issue.');
    await expect(candidate).toHaveAttribute('aria-checked', 'true');

    await page.goto(WS(r.id, 'resolve'));
    const resolve = page.getByTestId('resolve-drawer');
    await expect(resolve).toBeVisible();
    await box(resolve, 'issue-summary').fill('The municipality took the dogs to a shelter.');
    await changeBehind(page, `/issues/${r.id}/hide`, { reason: 'Handled privately with the neighbours.' });
    await resolve.getByTestId('resolve-submit').click();
    await expectRefusalIn(page, resolve, WRONG_STEP['en-PK']);
    await expect(box(resolve, 'issue-summary')).toHaveValue('The municipality took the dogs to a shelter.');
    expect(consoleErrors).toEqual([]);
  });

  test('close, cancel and hide dialogs: a too-short reason is refused inside the dialog, which stays open with the reason; a longer one succeeds', async ({ page, consoleErrors }, testInfo) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    for (const [title, drawer, kind, short, long, after] of [
      ['Balcony door lock broken', 'close', undefined, 'No reply', 'No reply after three calls this week', 'closed'],
      ['Geyser not heating', 'cancel', undefined, 'Not ours', 'The resident replaced the geyser himself', 'cancelled'],
      ['Stray dogs', 'hide', 'community_issue', 'Private', 'Names a neighbour; handled privately', 'hidden'],
    ] as const) {
      await open(page, title, drawer, kind);
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      const reason = dialog.getByRole('textbox');
      await reason.fill(short);
      await dialog.getByRole('button').filter({ hasNotText: /^(Cancel|Close)$/ }).last().click();
      await expectRefusalIn(page, dialog, TOO_SHORT['en-PK']);
      await expect(reason).toHaveValue(short);
      if (drawer === 'close') await axe(page, testInfo, 'close-dialog-refused-1440-en');
      await reason.fill(long);
      await dialog.getByRole('button').filter({ hasNotText: /^(Cancel|Close)$/ }).last().click();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('request-workspace')).toHaveAttribute('data-state', after);
      await expect(page.getByTestId('request-workspace').locator('[role="alert"]')).toHaveCount(0);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('an action started on the page (Start) is still refused on the page, where the person is', async ({ page, consoleErrors }) => {
    await calm(page);
    await seedSociety(page, { staff: IMRAN });
    const r = await open(page, 'Socket sparks');
    await expect(page.getByTestId('action-start')).toBeVisible();
    await changeBehind(page, `/ops/requests/${r.id}/cancel`, { reason: 'The resident called an electrician himself.' });
    await page.getByTestId('action-start').click();
    const alert = page.getByTestId('request-workspace').getByRole('alert');
    await expect(alert).toContainText('This work order is already finished or cancelled.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  for (const locale of LOCALES) {
    test(`320 px at 200 % text, ${lang(locale)}: the refusal is visible in the drawer and the dialog without closing them; nothing clipped; axe`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(120_000);
      await calm(page);
      await page.setViewportSize(PHONE);
      await seedSociety(page, { staff: IMRAN, locale });
      await page.goto(`${BO}/backoffice/global/my-access`);
      await textSize(page, 2);
      const r = await open(page, 'Geyser not heating', 'triage');
      const drawer = page.getByTestId('triage-drawer');
      await changeBehind(page, `/ops/requests/${r.id}/triage`, { priority: 'p2' });
      await changeBehind(page, `/ops/requests/${r.id}/cancel`, { reason: 'The resident fixed it herself.' });
      await drawer.getByTestId('triage-submit').click();
      await expectRefusalIn(page, drawer, WRONG_STEP[locale]);
      expect(await layoutProblems(drawer), `triage drawer 320 200 % ${locale}`).toEqual([]);
      await axe(page, testInfo, `triage-refused-320-200pct-${lang(locale)}`);

      await open(page, 'Balcony door lock broken', 'close');
      const dialog = page.getByRole('alertdialog');
      await dialog.getByRole('textbox').fill('No reply');
      await dialog.getByRole('button').filter({ hasNotText: new RegExp(`^(${CANCEL[locale]}|Cancel|Close|بند کریں)$`) }).last().click();
      await expectRefusalIn(page, dialog, TOO_SHORT[locale]);
      expect(await layoutProblems(dialog), `close dialog 320 200 % ${locale}`).toEqual([]);
      await axe(page, testInfo, `close-refused-320-200pct-${lang(locale)}`);
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// SH-02: figures read by screen readers
// ---------------------------------------------------------------------------------------------

test.describe('SH-02 figures are in the accessibility tree', () => {
  for (const locale of LOCALES) {
    test(`HQ ARR card (not a link), ${lang(locale)}: label, the full amount and the caption are exposed`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seed(page, { app: 'platform', persona: 'supreme_admin', locale });
      await page.goto(`${HQ}/hq`);
      const card = page.getByTestId('hq-kpi-arr');
      await expect(card).toBeVisible();
      expect(await card.evaluate((el) => el.tagName)).toBe('DIV');
      const tree = await card.ariaSnapshot();
      const [label, caption] = locale === 'ur-PK' ? ['سالانہ آمدنی کی شرح', 'MRR × 12، ٹیکس سے پہلے'] : ['Annual run rate', 'MRR × 12, before tax'];
      // Label, then the exact amount (Rs and two decimals), then the caption, in reading order.
      expect(tree).toMatch(new RegExp(`${label}[\\s\\S]*Rs\\s?[\\d,]+\\.\\d{2}[\\s\\S]*${caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      await axe(page, testInfo, `hq-dashboard-1440-${lang(locale)}`);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('CRM Lead 360 budget card (not a link): the exact budget is exposed', async ({ page, consoleErrors }) => {
    await calm(page);
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
    const card = page.getByText('Budget', { exact: true }).locator('xpath=ancestor::div[contains(@class, "@container")][1]');
    await expect(card).toBeVisible();
    expect(await card.ariaSnapshot()).toMatch(/Budget[\s\S]*Rs\s?[\d,]+\.\d{2}/);
    expect(consoleErrors).toEqual([]);
  });

  for (const locale of LOCALES) {
    test(`stat tiles, ${lang(locale)}: each link is named by label, value and its context line, the context once`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seedSociety(page, { staff: IMRAN, locale });
      for (const [path, ready, prefix] of [
        ['/backoffice', 'society-dashboard', 'kpi-'],
        ['/backoffice/fin/finance-dashboard', 'finance-dashboard', 'fin-'],
      ] as const) {
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready)).toBeVisible();
        const tiles = await page.evaluate(
          (prefix) =>
            [...document.querySelectorAll<HTMLAnchorElement>(`a[data-testid^="${prefix}"]`)].map((el) => ({
              id: el.dataset.testid!,
              name: el.getAttribute('aria-label') ?? '',
              context: el.querySelector('div[aria-hidden="true"] .text-xs')?.textContent?.trim() ?? '',
            })),
          prefix,
        );
        expect(tiles.length, path).toBeGreaterThan(3);
        for (const t of tiles) {
          if (!t.context) continue;
          expect(t.name.split(t.context).length - 1, `${t.id}: "${t.name}" has "${t.context}" once`).toBe(1);
          expect(t.name, t.id).toMatch(/Rs\s?[\d,]+\.\d{2}|—/);
        }
        await axe(page, testInfo, `${ready}-1440-${lang(locale)}`);
      }
      expect(consoleErrors).toEqual([]);
    });
  }

  for (const locale of LOCALES) {
    test(`stat tiles at 320 px with 200 % text, ${lang(locale)}: no value is cut off (the documented clip)`, async ({ page, consoleErrors }) => {
      await calm(page);
      await page.setViewportSize(PHONE);
      await seedSociety(page, { staff: IMRAN, locale });
      await page.goto(`${BO}/backoffice/global/my-access`);
      await textSize(page, 2);
      for (const [path, ready, prefix] of [
        ['/backoffice', 'society-dashboard', 'kpi-'],
        ['/backoffice/fin/finance-dashboard', 'finance-dashboard', 'fin-'],
      ] as const) {
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready)).toBeVisible();
        const tiles = page.locator(`a[data-testid^="${prefix}"]`);
        const n = await tiles.count();
        expect(n).toBeGreaterThan(3);
        for (let i = 0; i < n; i++) expect(await layoutProblems(tiles.nth(i)), `${path} tile ${i} ${locale}`).toEqual([]);
        // layoutProblems skips aria-hidden text, and a tile's value and context are aria-hidden (its name
        // carries them), so measure them directly: inside the tile, the value on one line, no word split.
        const cut = await page.evaluate((prefix) => {
          const out: string[] = [];
          for (const tile of document.querySelectorAll<HTMLElement>(`a[data-testid^="${prefix}"]`)) {
            const t = tile.getBoundingClientRect();
            const [value, context] = [tile.querySelector('div[aria-hidden="true"] > div'), tile.querySelector('div[aria-hidden="true"] .text-xs')];
            for (const [part, el] of [['value', value], ['context', context]] as const) {
              if (!el || !(el.textContent ?? '').trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(el);
              const r = range.getBoundingClientRect();
              const lines = new Set([...range.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top))).size;
              if (r.left < t.left - 1 || r.right > t.right + 1) out.push(`${tile.dataset.testid} ${part} "${el.textContent}" x ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(t.left)}–${Math.round(t.right)}`);
              if (part === 'value' && lines > 1) out.push(`${tile.dataset.testid} value "${el.textContent}" on ${lines} lines`);
            }
          }
          return out;
        }, prefix);
        expect(cut, `${path} ${locale}`).toEqual([]);
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// SH-04, RES-06, SH-10, SH-11
// ---------------------------------------------------------------------------------------------

test.describe('SH-04 a SelectControl error shows at the field', () => {
  for (const locale of LOCALES) {
    test(`household request, ${lang(locale)}: an empty submit marks Relationship invalid with its message, tied to the field; axe; 320 px at 200 %`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seedSociety(page, { resident: 'alnoor_resident_a101', locale });
      await page.goto(`${CU}/customer/portal/household`);
      await page.getByTestId('household-submit').click();
      const field = page.getByTestId('household-relationship');
      const message = locale === 'ur-PK' ? 'ایک آپشن منتخب کریں۔' : 'Choose an option.';
      await expect(field).toHaveAttribute('data-invalid', 'true');
      await expect(field).toContainText(message);
      await expect(field.getByRole('button')).toHaveAccessibleDescription(new RegExp(message.replace('.', '\\.')));
      await axe(page, testInfo, `household-errors-1440-${lang(locale)}`);
      // Choosing a value clears nothing by itself (the form re-checks on submit), and the field still works.
      await field.getByRole('button').click();
      await page.getByRole('option').first().click();
      await expect(page.getByRole('listbox')).toHaveCount(0);

      await page.setViewportSize(PHONE);
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, textScale: 2, chosenAt: '2026-10-26T00:00:00Z' })), displayKey('alnoor_resident_a101'));
      await page.reload();
      await page.getByTestId('household-submit').click();
      await expect(page.getByTestId('household-relationship')).toContainText(message);
      expect(await layoutProblems(page.getByTestId('household-form')), `household form 320 200 % ${locale}`).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe('RES-06 one Tab stop for the file control', () => {
  for (const locale of LOCALES) {
    test(`proof form and re-send form, ${lang(locale)}: Tab moves from "Choose file" past the hidden input; Enter still opens the picker; axe`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seedSociety(page, { resident: 'alnoor_tenant_a102', staff: 'alnoor_accounts', locale });
      // The office asks A-102's tenant for a clearer receipt, so the re-send form appears.
      await page.goto(`${BO}/backoffice/fin/unverified-transfers-queue`);
      await expect(page.getByTestId('proof-inbox')).toBeVisible();
      const subs = await api<{ items: Array<{ id: string; state: string; flats: string[] }> }>(page, '/payment-submissions');
      const a102 = subs.ok ? subs.res.items.find((s) => s.flats.includes('A-102') && s.state === 'submitted')! : null;
      const asked = await api(page, `/payment-submissions/${a102!.id}/request-information`, 'POST', { message: 'The photo is blurred. Please upload the bank receipt.' });
      expect(asked.ok).toBe(true);

      for (const [path, pick, input, form] of [
        ['/customer/portal/upload-proof-mock', 'proof-file-pick', 'proof-file', 'proof-form'],
        [`/customer/portal/submissions/${a102!.id}`, 'resubmit-file-pick', 'resubmit-file', 'proof-resubmit'],
      ] as const) {
        await page.goto(`${CU}${path}`);
        await expect(page.getByTestId(form)).toBeVisible();
        await expect(page.getByTestId(input)).toHaveAttribute('tabindex', '-1');
        await page.getByTestId(pick).focus();
        await page.keyboard.press('Tab');
        const next = await focused(page);
        expect(next?.type, `${path}: the stop after "Choose file"`).not.toBe('file');
        expect(next?.testId).not.toBe(input);
        // Shift+Tab comes straight back to the visible button.
        await page.keyboard.press('Shift+Tab');
        await expect(page.getByTestId(pick)).toBeFocused();
        // The keyboard still opens the picker; the chosen file is named.
        const chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await (await chooser).setFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demo') });
        await expect(page.getByTestId(form)).toContainText('receipt.pdf');
        await axe(page, testInfo, `${input}-1440-${lang(locale)}`);
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe('SH-10 keyboard focus on a tab panel is visible', () => {
  for (const locale of LOCALES) {
    test(`Request 360 timeline, ${lang(locale)}: Tab from the tab list into a panel shows a focus ring of at least 2 px and 3:1`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seedSociety(page, { staff: IMRAN, locale });
      await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
      await expect(page.getByTestId('request-row').first()).toBeVisible();
      const r = await requestNamed(page, 'AC drain leaking');
      await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${r.id}&tab=timeline`);
      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('tabindex', '0');
      await page.getByRole('tab', { selected: true }).focus();
      await page.keyboard.press('Tab');
      await expect(panel).toBeFocused();
      await expect(panel).toHaveAttribute('data-focus-visible', 'true');
      const ring = await panel.evaluate((el) => {
        const cs = getComputedStyle(el);
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        let bg = 'rgba(0, 0, 0, 0)';
        for (let p: Element | null = el; p && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); p = p.parentElement) bg = getComputedStyle(p).backgroundColor;
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(document.body).backgroundColor;
        const [a, b] = [lum(rgb(cs.outlineColor)), lum(rgb(bg))];
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);
      expect(ring.contrast).toBeGreaterThanOrEqual(3);
      await axe(page, testInfo, `request-timeline-focus-1440-${lang(locale)}`);
      // The mouse does not leave a ring.
      await page.getByRole('tab', { selected: true }).click();
      await panel.click({ position: { x: 5, y: 5 } });
      await expect(panel).not.toHaveAttribute('data-focus-visible', 'true');
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe('SH-11 calendar month buttons say which month', () => {
  for (const locale of LOCALES) {
    test(`schedule-visit calendar (office) and the HQ effective date, ${lang(locale)}: "Previous month" / "Next month"; axe with the calendar open`, async ({ page, consoleErrors }, testInfo) => {
      await calm(page);
      await seed(page, { persona: 'manager', locale });
      const [prev, next] = locale === 'ur-PK' ? ['پچھلا مہینہ', 'اگلا مہینہ'] : ['Previous month', 'Next month'];
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
      await page.getByTestId('lead-schedule-visit').click();
      const visit = page.getByTestId('schedule-visit-drawer');
      await expect(visit).toBeVisible();
      await visit.getByTestId('schedule-visit-form').getByRole('group').first().getByRole('button').last().click();
      const calendar = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
      await expect(calendar.getByRole('button', { name: prev, exact: true })).toBeVisible();
      const heading = await calendar.getByRole('heading').innerText();
      await calendar.getByRole('button', { name: next, exact: true }).click();
      await expect(calendar.getByRole('heading')).not.toHaveText(heading);
      await expect(calendar.getByRole('button', { name: locale === 'ur-PK' ? 'واپس' : 'Back', exact: true })).toHaveCount(0);
      await axe(page, testInfo, `visit-calendar-1440-${lang(locale)}`);
      await page.keyboard.press('Escape');

      const hq = await page.context().newPage();
      await seed(hq, { app: 'platform', persona: 'supreme_admin', locale });
      await hq.goto(`${HQ}/hq/policies`);
      await hq.getByTestId('config-new').click();
      await hq.getByTestId('config-effective').getByRole('button', { name: locale === 'ur-PK' ? 'کیلنڈر کھولیں' : 'Open calendar' }).click();
      const hqCal = hq.getByRole('dialog').filter({ has: hq.getByRole('grid') });
      await expect(hqCal.getByRole('button', { name: prev, exact: true })).toBeVisible();
      await expect(hqCal.getByRole('button', { name: next, exact: true })).toBeVisible();
      await axe(hq, testInfo, `hq-config-calendar-1440-${lang(locale)}`);
      await hq.close();
      expect(consoleErrors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Dark mode with high contrast: the new palette button, the refusal and the tab-panel ring
// ---------------------------------------------------------------------------------------------

for (const locale of LOCALES) {
  test(`dark mode with high contrast, 390 px, ${lang(locale)}: palette Cancel, a drawer refusal and a focused tab panel pass axe and are not clipped`, async ({ page, consoleErrors }, testInfo) => {
    await calm(page);
    await page.setViewportSize(VIEWPORTS.phone);
    await seedSociety(page, { staff: IMRAN, locale });
    const html = (n: string) => page.evaluate((a) => document.documentElement.getAttribute(a), n);
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    await expect.poll(() => html('data-theme')).toBe('dark');

    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    await page.getByTestId('search-button').click();
    const palette = page.getByTestId('command-palette');
    await expect(palette.getByRole('button', { name: CANCEL[locale], exact: true })).toBeVisible();
    await axe(page, testInfo, `palette-390-dark-contrast-${lang(locale)}`);
    expect(await layoutProblems(palette)).toEqual([]);
    await palette.getByRole('button', { name: CANCEL[locale], exact: true }).click();
    await expect(palette).toBeHidden();

    const r = await open(page, 'Geyser not heating', 'triage');
    const drawer = page.getByTestId('triage-drawer');
    await changeBehind(page, `/ops/requests/${r.id}/cancel`, { reason: 'The resident fixed it herself.' });
    await drawer.getByTestId('triage-submit').click();
    await expectRefusalIn(page, drawer, WRONG_STEP[locale]);
    await axe(page, testInfo, `triage-refused-390-dark-contrast-${lang(locale)}`);
    expect(await layoutProblems(drawer)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${r.id}&tab=timeline`);
    const panel = page.getByRole('tabpanel');
    await page.getByRole('tab', { selected: true }).focus();
    // On a phone the tab row ends with "More"; the panel is the next stop after it.
    for (let i = 0; i < 3 && !(await panel.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await expect(panel).toHaveAttribute('data-focus-visible', 'true');
    expect(await panel.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await panel.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
    await axe(page, testInfo, `request-timeline-focus-390-dark-contrast-${lang(locale)}`);
    expect(consoleErrors).toEqual([]);
  });
}

