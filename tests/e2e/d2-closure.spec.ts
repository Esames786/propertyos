import type { Locator, Page } from '@playwright/test';
import { CU, expect, test, type Locale } from '../support/fixtures';
import { focusWalk, layoutProblems, linesOf } from '../support/layout';
import { seedSociety } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate D.2 closure (review Issue #8). A clean axe run and no sideways scroll did not catch a notice
 * title squeezed to one character per line or a bill figure clipped inside its card, so these tests
 * read the rendered boxes (support/layout.ts) in a real 320 × 700 phone viewport at 100, 150 and
 * 200 % text in both languages, walk each page with the keyboard against the sticky header and the
 * fixed bottom bar, and check that toasts never sit on a drawer's buttons.
 */
const PHONE = { width: 320, height: 700 };
const HEADER = '[data-testid="portal-header"]';
const BAR = '[data-testid="portal-bottom-nav"]';

const PAGES = [
  { name: 'home', path: '/customer/portal/home', ready: 'dues-bill' },
  { name: 'notices', path: '/customer/portal/community-notices', ready: 'notice-list' },
  { name: 'visitors', path: '/customer/portal/services-home?tab=visitors', ready: 'passes-upcoming' },
  { name: 'repairs', path: '/customer/portal/maintenance-workspace', ready: 'repairs-page' },
  { name: 'issues', path: '/customer/portal/issues', ready: 'issues-page' },
] as const;

/** Entry animations finished (positions are measured, not mid-slide). */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
  await settle(page);
}

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  for (const scale of [1, 1.5, 2] as const) {
    test(`320 × 700, ${lang(locale)}, text ${scale * 100} %: nothing clipped, spilled or broken mid-word on the resident pages`, async ({ page, consoleErrors }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(PHONE);
      await seedSociety(page, { locale, textScale: scale });
      for (const p of PAGES) {
        await open(page, p.path, p.ready);
        // The person's text size is applied as chosen (never reduced to make a layout fit).
        expect(await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).fontSize))).toBe(16 * scale);
        expect(await layoutProblems(page), `${p.name} ${lang(locale)} ${scale * 100} %`).toEqual([]);
      }

      // Notices: each title has (nearly) the card's width and no more lines than words.
      await open(page, '/customer/portal/community-notices', 'notice-list');
      for (const title of await page.getByTestId('notice-card-title').all()) {
        const words = (await title.innerText()).trim().split(/\s+/).length;
        expect(await linesOf(title)).toBeLessThanOrEqual(words);
        const [w, card] = await title.evaluate((el) => [el.getBoundingClientRect().width, el.closest('[data-testid="notice-card"]')!.getBoundingClientRect().width]);
        expect(w).toBeGreaterThan(card * 0.5);
      }
      // A notice opened: the detail page too.
      await page.getByTestId('notice-card').first().click();
      await expect(page.getByTestId('notice-detail')).toBeVisible();
      await settle(page);
      expect(await layoutProblems(page), `notice detail ${lang(locale)} ${scale * 100} %`).toEqual([]);

      // Home: the whole amount, symbol and digits, inside the card; the Pay action carries it in full.
      await open(page, '/customer/portal/home', 'dues-bill');
      const total = page.getByTestId('dues-total');
      expect((await total.innerText()).replace(/\s+/g, ' ').trim()).toBe('Rs 5,200.00');
      const [figure, card] = await total.evaluate((el) => [el.getBoundingClientRect(), el.closest('[data-testid="dues-bill"]')!.getBoundingClientRect()].map((r) => ({ left: r.left, right: r.right })));
      expect(figure!.left).toBeGreaterThanOrEqual(card!.left);
      expect(figure!.right).toBeLessThanOrEqual(card!.right);
      expect(await total.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16 * scale);
      await expect(page.getByTestId('dues-pay')).toContainText('5,200.00');
      expect(consoleErrors).toEqual([]);
    });
  }
}

test('320 × 700, Urdu, 200 %: a seven-figure amount still fits the bill card (layout probe)', async ({ page, consoleErrors }) => {
  await page.setViewportSize(PHONE);
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await open(page, '/customer/portal/home', 'dues-bill');
  // Probe: the same figure and Pay button with a seven-figure amount, sized by the component's own
  // rule (its length goes into the inline size), to check the clamp floor and the currency wrap.
  await page.getByTestId('dues-bill').evaluate((card) => {
    const long = '1,234,567.00';
    const dd = card.querySelector<HTMLElement>('[data-testid="dues-total"]')!;
    dd.querySelectorAll('bdi > span')[1]!.textContent = long;
    dd.style.fontSize = dd.style.fontSize.replace(/100cqi \/ [\d.]+/, `100cqi / ${(`Rs ${long}`.length * 0.62).toFixed(2)}`);
    const pay = card.querySelector('[data-testid="dues-pay"]')!;
    const walker = document.createTreeWalker(pay, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) n.textContent = (n.textContent ?? '').replace('5,200.00', long);
  });
  expect(await layoutProblems(page.getByTestId('dues-bill'))).toEqual([]);
  expect(await page.getByTestId('dues-total').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
  expect(consoleErrors).toEqual([]);
});

test('the checks catch the defects of the review: the 93889a3 markup restored in the page fails them', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await open(page, '/customer/portal/community-notices', 'notice-list');
  expect(await layoutProblems(page)).toEqual([]);
  // Notice card as in 93889a3: the title column flex-1 beside the badge, breaking anywhere.
  await page.getByTestId('notice-card-title').first().evaluate((title) => {
    title.setAttribute('class', 'block font-semibold text-text [overflow-wrap:anywhere]');
    title.parentElement!.setAttribute('class', 'min-w-0 flex-1');
  });
  expect((await layoutProblems(page)).filter((p) => p.kind === 'broken-word').length).toBeGreaterThan(0);

  await open(page, '/customer/portal/home', 'dues-bill');
  expect(await layoutProblems(page.getByTestId('dues-bill'))).toEqual([]);
  // Bill figure and Pay as in 93889a3: the display size whatever the width, nothing may wrap.
  await page.getByTestId('dues-bill').evaluate((card) => {
    const dd = card.querySelector<HTMLElement>('[data-testid="dues-total"]')!;
    dd.removeAttribute('style');
    dd.className = 'text-figure-sm leading-none font-bold tracking-tight text-text sm:text-figure';
    dd.querySelector('bdi')!.className = 'ltr-ref whitespace-nowrap tabular';
    card.querySelector('[data-testid="dues-pay"]')!.classList.replace('whitespace-normal', 'whitespace-nowrap');
  });
  const kinds = new Set((await layoutProblems(page.getByTestId('dues-bill'))).map((p) => p.kind));
  expect([...kinds].some((k) => k === 'clipped' || k === 'spills' || k === 'offscreen')).toBe(true);
});

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`keyboard at 320 × 700, ${lang(locale)}, 200 %: every focused control clear of the header and the bottom bar; the last content above the bar`, async ({ page, consoleErrors }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(PHONE);
    await seedSociety(page, { locale, textScale: 2 });
    for (const p of PAGES.slice(0, 3)) {
      await open(page, p.path, p.ready);
      const stops = await focusWalk(page, { header: HEADER, bar: BAR, max: 60 });
      expect(stops.length, `${p.name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${p.name} ${lang(locale)}`).toEqual([]);

      // Scrolled to the end, the page's last content sits above the bar (and its raised centre button).
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate((bar) => {
        const content = document.querySelector('main')!.firstElementChild!.getBoundingClientRect();
        const nav = document.querySelector(bar)!;
        const top = Math.min(...[nav, ...nav.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top));
        return top - content.bottom;
      }, BAR);
      expect(gap, `${p.name}: last content above the bar`).toBeGreaterThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('soft keyboard (320 × 360), Urdu, 200 %: each field of the guest invitation stays in view while typing', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await open(page, '/customer/portal/services-home?tab=visitors&new=1', 'invite-sheet');
  const sheet = '[data-testid="invite-sheet"]';
  const stops = await focusWalk(page, { header: `${sheet} header`, bar: `${sheet} footer`, max: 30 });
  expect(stops.length).toBeGreaterThan(3);
  expect(stops.filter((s) => s.issue)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

for (const [name, viewport, locale, scale] of [
  ['320 × 700, Urdu, 200 %', PHONE, 'ur-PK', 2],
  ['desktop, English', VIEWPORTS.desktop, 'en-PK', 1],
] as const) {
  test(`toasts after quick successive bookings never cover an open drawer's buttons (${name})`, async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.clock.install();
    await seedSociety(page, { locale, textScale: scale });
    await open(page, '/customer/portal/amenities', 'amenity-list');
    // The page's clock is paused and moved on only a little at each step (enough for the mock API's
    // zero-delay timers), so on a slow machine no confirmation dismisses itself (8 s) before the drawer
    // opens: the test does not depend on how fast it runs.
    // A second ahead (not 10 ms): on a loaded machine the page's clock can pass a closer target before the
    // pause reaches it ("cannot fast-forward to the past"). Nothing is on screen yet that a second could expire.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const advanceUntil = (done: () => Promise<boolean>) => expect.poll(async () => (await page.clock.runFor(100), done())).toBe(true);
    // Three bookings in quick succession: three confirmations on screen at once.
    for (const kind of ['gym', 'bbq', 'hall']) {
      await page.locator(`[data-testid="amenity-card"][data-amenity="${kind}"]`).getByTestId('amenity-book').click();
      const sheet = page.getByTestId('booking-sheet');
      await advanceUntil(() => sheet.isVisible());
      const free = sheet.locator('[data-testid^="booking-slot-"]:not([disabled])').first();
      await free.click();
      await sheet.getByTestId('booking-submit').click();
      await advanceUntil(() => sheet.isHidden());
    }
    await expect(page.getByTestId('toast-success')).toHaveCount(3);

    // A drawer opens while they are still showing. They are about the page behind it and were already
    // announced, so they wait: nothing of the drawer is covered, its controls work at once.
    await page.locator('[data-testid="amenity-card"][data-amenity="gym"]').getByTestId('amenity-book').click();
    const sheet = page.getByTestId('booking-sheet');
    await advanceUntil(() => sheet.isVisible());
    await settle(page);
    const region = page.getByTestId('toast-region');
    await expect(region.locator('[data-testid^="toast-"]')).toHaveCount(0);
    await sheet.locator('[data-testid^="booking-slot-"]:not([disabled])').first().click();
    const submit = sheet.getByTestId('booking-submit');
    await expect(submit).toBeEnabled();
    expect(await topmost(submit)).toBe(true);
    // Closed without booking: the confirmations that are still current come back.
    await page.keyboard.press('Escape');
    await advanceUntil(() => sheet.isHidden());
    await expect(region.locator('[data-testid^="toast-"]')).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });
}

/** The control is the topmost element at its centre: nothing covers it. */
const topmost = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });

for (const [name, viewport, locale, scale, cap] of [
  ['320 × 700, Urdu, 200 %', PHONE, 'ur-PK', 2, 1],
  ['desktop, English', VIEWPORTS.desktop, 'en-PK', 1, 2],
] as const) {
  test(`toasts from inside a drawer: ${cap} at most, the drawer's controls uncovered, closing one keeps the drawer (${name})`, async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await seedSociety(page, { locale, textScale: scale });
    await open(page, '/customer/portal/issues', 'issues-page');
    await page.locator('[data-testid="issue-card"]:not([data-state="resolved"])').first().locator('button').first().click();
    const sheet = page.getByTestId('issue-sheet');
    await expect(sheet).toBeVisible();
    const region = page.getByTestId('toast-region');
    // Two comments in quick succession, each confirmed by a toast while the drawer stays open.
    for (const text of ['The water is still leaking near the stairs.', 'It is worse after the rain today.']) {
      const field = sheet.locator('textarea[data-testid="issue-comment"], [data-testid="issue-comment"] textarea').first();
      await field.fill(text);
      await sheet.getByTestId('issue-comment-send').click();
      await expect(field).toHaveValue('');
    }
    const count = await region.locator('[data-testid^="toast-"]').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(cap);
    const field = sheet.locator('textarea[data-testid="issue-comment"], [data-testid="issue-comment"] textarea').first();
    await field.scrollIntoViewIfNeeded();
    expect(await topmost(field)).toBe(true);
    expect(await topmost(sheet.getByRole('button').first())).toBe(true);
    // Closing a toast leaves the drawer open (toasts live in the top layer).
    const first = region.locator('[data-testid^="toast-"]').first();
    const id = await first.getAttribute('data-toast-id');
    await first.getByRole('button').click();
    await expect(sheet).toBeVisible();
    await expect(region.locator(`[data-toast-id="${id}"]`)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
}
