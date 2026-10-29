import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, HQ, expect, seed, test, type Locale } from '../support/fixtures';
import { become, seedSociety } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate D.1: identity, personalization and onboarding. The three reference experiences (the hub in
 * all three apps; invitation → acceptance → welcome → home; devices, app switch and data requests)
 * and the remaining D.1 screens, against the production builds and the mock server's own rules.
 */
const overflowOf = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const html = (page: Page, name: string) => page.locator('html').getAttribute(name);
/**
 * Text squeezed into a narrow column (one or two letters a line) never scrolls sideways, so the
 * overflow check misses it: find text that is narrower than 64 px but taller than 120 px.
 */
const squeezed = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => (n.textContent ?? '').trim())
          .join(' ');
        if (own.length < 12) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.width < 64 && r.height > 120;
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}px`,
      ),
  );

test.describe('Personalization hub (GLOBAL-010, PORTAL-027, HQ-024)', () => {
  test('every change applies at once, is kept per person and organisation, and resets', async ({
    page,
    consoleErrors,
  }) => {
    await seed(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await expect(page.getByTestId('personalization-hub')).toBeVisible();
    await page.getByTestId('text-size-150').click();
    expect(await html(page, 'data-text-scale')).toBe('150');
    await page.getByTestId('hub-theme').getByText('Dark', { exact: true }).click();
    expect(await html(page, 'data-theme')).toBe('dark');
    await page.getByTestId('hub-palette').getByText('Ocean', { exact: true }).click();
    expect(await html(page, 'data-palette')).toBe('ocean');
    await page.getByTestId('hub-density').getByText('Compact', { exact: false }).first().click();
    await page.getByTestId('hub-reading').click();
    expect(await html(page, 'data-reading')).toBe('on');
    // High contrast wins over the palette.
    await page
      .getByTestId('hub-contrast')
      .getByText('High contrast', { exact: false })
      .first()
      .click();
    expect(await html(page, 'data-contrast')).toBe('high');
    await expect(page.getByTestId('hub-palette-paused')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('personalization-hub')).toBeVisible();
    expect(await html(page, 'data-theme')).toBe('dark');
    expect(await html(page, 'data-text-scale')).toBe('150');

    // Another person in the same browser starts from their own record.
    await become(page, 'backoffice', 'alnoor_treasurer');
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await expect(page.getByTestId('personalization-hub')).toBeVisible();
    expect(await html(page, 'data-theme')).not.toBe('dark');
    expect(await html(page, 'data-text-scale')).toBe('100');

    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-reset-all').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /reset/i }).click();
    expect(await html(page, 'data-text-scale')).toBe('100');
    expect(await html(page, 'data-reading')).toBeNull();
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard: arrow keys move through a setting and apply it', async ({ page }) => {
    await seed(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    const light = page.getByTestId('hub-theme').getByRole('radio').first();
    await light.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => html(page, 'data-theme')).toBe('dark');
  });

  test('a C.2 resident keeps their text size and is not asked again; Urdu Nastaliq applies', async ({
    page,
  }) => {
    await seed(page, { app: 'customer', persona: 'alnoor_resident_a101', textScale: 1.25 });
    await page.goto(`${CU}/customer/portal/home`);
    await expect(page.getByTestId('text-size-welcome')).toHaveCount(0);
    expect(await html(page, 'data-text-scale')).toBe('125');
    await page.goto(`${CU}/customer/portal/accessibility-preferences`);
    await page.getByTestId('hub-font-urdu').getByText('Nastaliq', { exact: false }).first().click();
    expect(await html(page, 'data-font-urdu')).toBe('nastaliq');
  });

  test('Platform HQ has the same hub, without organisation colours', async ({ page }) => {
    await seed(page, { app: 'platform', persona: 'supreme_admin' });
    await page.goto(`${HQ}/hq/preferences`);
    await expect(page.getByTestId('personalization-hub')).toBeVisible();
    await expect(page.getByTestId('hub-palette-organisation')).toHaveCount(0);
  });
});

test.describe('Invitation → acceptance → welcome → home (RES-007, RES-009, AUTH-007, PORTAL-030)', () => {
  test('the office invites; the resident joins with the code, sets up the app and lands home', async ({
    page,
    consoleErrors,
  }, testInfo) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice/residents/portal-access?status=not_invited`);
    await page.getByTestId('portal-row-actions').first().click();
    await page.getByTestId('portal-action-invite').click();
    await page.getByTestId('invite-channel').getByText('Printed letter').click();
    await page.getByTestId('invite-send').click();
    await expect(page.getByTestId('print-sheet')).toBeVisible();
    const href = await page.getByTestId('invite-open-link').first().getAttribute('href');
    expect(href).toContain('/shared/auth/invite/tnt_alnoor.');

    // Every step of the journey is scanned (these pages need a live invitation, so they are not in the sweep).
    const violations: string[] = [];
    const scan = async (label: string) => {
      for (const v of (await scanA11y(page, testInfo, `d1-invitation-${label}`)).violations)
        violations.push(`${label}: ${v.id} ${v.targets.join(' | ')}`);
    };
    await page.goto(href!);
    await expect(page.getByTestId('invitation-joining')).toBeVisible();
    await scan('invitation');
    await page.getByTestId('invitation-send-code').click();
    await expect(page.getByTestId('demo-code-notice')).toBeVisible();
    await page.getByTestId('code-input').fill('000000');
    await page.getByTestId('code-submit').click();
    await expect(
      page.getByTestId('code-step').getByText('That code is not right. 2 tries left.'),
    ).toBeVisible();
    await scan('wrong-code');
    await page.getByTestId('demo-code-use').click();
    await page.getByTestId('code-submit').click();

    await expect(page.getByTestId('welcome-language')).toBeVisible();
    await scan('welcome-language');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('text-size-welcome')).toBeVisible();
    await page.getByTestId('text-size-125').click();
    await page.getByTestId('text-size-continue').click();
    await expect(page.getByTestId('welcome-theme')).toBeVisible();
    await scan('welcome-theme');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-done')).toBeVisible();
    await scan('welcome-done');
    await page.getByTestId('welcome-home').click();
    await expect(page).toHaveURL(/\/customer\/portal\/home/);
    expect(await html(page, 'data-text-scale')).toBe('125');

    // The link is used now.
    await page.goto(href!);
    await expect(page.getByTestId('invitation-closed')).toHaveAttribute('data-state', 'accepted');
    await scan('invitation-used');
    expect(violations).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a resident who already chose a size is not asked again in the welcome', async ({
    page,
  }) => {
    await seed(page, { app: 'customer', persona: 'alnoor_resident_a101', textScale: 1.5 });
    await page.goto(`${CU}/customer/portal/welcome`);
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-theme')).toBeVisible();
    await expect(page.getByTestId('welcome-size-kept')).toContainText('150');
  });

  test('phone sign-in never reveals an account, and signs a resident in with the code (AUTH-006)', async ({
    page,
  }) => {
    await seed(page, { app: 'customer', persona: null });
    await page.goto(`${CU}/shared/auth/customer-portal-login`);
    await page.getByTestId('sign-in-phone').fill('+92 399 0000001');
    await page.getByTestId('sign-in-send').click();
    await expect(page.getByTestId('sign-in-no-code')).toBeVisible();
    await page.getByTestId('sign-in-change').click();
    await page.getByTestId('demo-numbers').getByRole('button').first().click();
    await page.getByTestId('demo-code-use').click();
    await page.getByTestId('code-submit').click();
    await expect(page).toHaveURL(/\/customer\/portal\/home/);
  });

  test('the flat page shows who uses the resident app (SITE-009)', async ({ page }) => {
    await seed(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice/sites/site_alnoor/units/unt_anr_a101?tab=portal`);
    await expect(page.getByTestId('flat-portal').getByTestId('portal-row')).toHaveCount(1);
  });
});

test.describe('Devices, app switch and data (GLOBAL-008/015/016, PORTAL-024/041, ADM-003, ADM-024)', () => {
  test('sign out another device; it moves to the signed-out list', async ({ page }) => {
    await seed(page, { persona: 'alnoor_admin' });
    await page.goto(`${BO}/backoffice/global/profile--preferences?tab=devices`);
    await page.getByTestId('session-row').first().waitFor();
    const others = page.getByTestId('session-revoke');
    const before = await others.count();
    expect(before).toBeGreaterThan(0);
    await others.first().click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Sign out this device' })
      .click();
    await expect(others).toHaveCount(before - 1);
    await expect(page.getByTestId('sessions-ended')).toBeVisible();
  });

  test('a person with both roles switches apps; each app shows only its own side', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_admin', resident: 'alnoor_owner_a201' });
    await page.goto(`${BO}/backoffice/global/profile--preferences`);
    await expect(page.getByTestId('role-mode')).toHaveAttribute('data-mode', 'backoffice');
    await page.getByTestId('app-switch').click();
    await expect(page).toHaveURL(/5174\/customer\/portal\/home/);
    await expect(page.getByTestId('role-mode')).toHaveAttribute('data-mode', 'customer');
    // Nothing of the office app in the resident app.
    await expect(page.getByRole('link', { name: 'Users and sessions' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Resident app access' })).toHaveCount(0);
    await page.getByTestId('portal-account').click();
    await page.getByTestId('menu-app-switch').click();
    await expect(page).toHaveURL(/5173\/backoffice\//);
    await expect(page.getByTestId('role-mode').first()).toHaveAttribute('data-mode', 'backoffice');
    expect(consoleErrors).toEqual([]);
  });

  test('closing a resident’s access signs them out with the reason', async ({ page }) => {
    await seedSociety(page, { staff: 'alnoor_manager', resident: 'alnoor_tenant_a102' });
    await page.goto(`${CU}/customer/portal/home`);
    await expect(page.getByTestId('portal-account')).toBeVisible();
    await page.goto(`${BO}/backoffice/residents/portal-access?q=Sana`);
    await page.getByTestId('portal-row-actions').first().click();
    await page.getByTestId('portal-action-revoke').click();
    await page.getByRole('alertdialog').getByRole('textbox').fill('Moved out in October.');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /close access/i })
      .click();
    await page.goto(`${CU}/customer/portal/payments-dashboard`);
    await expect(page.getByTestId('sign-out-notice')).toHaveAttribute(
      'data-reason',
      'portal_access_revoked',
    );
  });

  test('an export waits for someone else, can only be narrowed, and only the requester downloads it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seed(page, { persona: 'alnoor_admin' });
    await page.goto(`${BO}/backoffice/adm/data`);
    await page.getByTestId('export-new-button').click();
    for (const d of ['people', 'flats']) await page.getByTestId(`export-pick-${d}`).click();
    await page.getByTestId('export-purpose').fill('Contact list for the AGM notices.');
    await expect(page.getByTestId('export-approval-note')).toContainText('approve');
    await page.getByTestId('export-submit').click();
    const mine = page.getByTestId('export-row').first();
    await expect(mine).toHaveAttribute('data-state', 'awaiting_approval');
    await expect(mine.getByTestId('export-review')).toHaveCount(0);

    await become(page, 'backoffice', 'alnoor_treasurer');
    await page.goto(`${BO}/backoffice/adm/data`);
    await page.getByTestId('export-row').first().getByTestId('export-review').click();
    await page.getByTestId('export-keep-flats').click();
    await page.getByTestId('export-approve').click();
    await expect(page.getByTestId('export-row').first()).toHaveAttribute('data-state', 'ready');
    await expect(page.getByTestId('export-download')).toHaveCount(0);

    await become(page, 'backoffice', 'alnoor_admin');
    await page.goto(`${BO}/backoffice/adm/data`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^DEX-2026-\d{4}\.csv$/);
  });

  test('a resident downloads their own data and asks for a correction (PORTAL-024)', async ({
    page,
  }) => {
    await seed(page, { app: 'customer', persona: 'alnoor_resident_a101' });
    await page.goto(`${CU}/customer/portal/profile?tab=data`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('my-data-download').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^my-data-.*\.json$/);
    await page
      .getByTestId('my-data-details')
      .fill('My e-mail address on the register is out of date.');
    await page.getByTestId('my-data-submit').click();
    await expect(page.getByTestId('my-data-requests').locator('li')).toHaveCount(1);
  });

  test('an administrator ends a colleague’s office session (ADM-003)', async ({ page }) => {
    await seed(page, { persona: 'alnoor_admin' });
    await page.goto(`${BO}/backoffice/adm/user-workspace`);
    await page.getByTestId('staff-row').filter({ hasText: 'Imran Qureshi' }).click();
    await page.getByTestId('staff-sessions').waitFor();
    const revoke = page.getByTestId('staff-session-revoke');
    const before = await revoke.count();
    await revoke.first().click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Sign out this device' })
      .click();
    await expect(revoke).toHaveCount(before - 1);
  });
});

test.describe('Organisation colours and households (ADM-022, RES-004, PORTAL-025, PORTAL-002/003)', () => {
  test('a preset previews at once, saves for everyone, and the resident app follows; a pale brand colour is refused', async ({
    page,
  }) => {
    await seedSociety(page, { staff: 'alnoor_admin' });
    await page.goto(`${BO}/backoffice/adm/branding`);
    await page.getByTestId('branding-palette').getByText('Indigo', { exact: true }).click();
    expect(await html(page, 'data-palette')).toBe('indigo');
    await page.getByTestId('branding-hex').fill('#ffcc00');
    await page.getByTestId('branding-check').click();
    await expect(page.getByTestId('branding-fail')).toBeVisible();
    await expect(page.getByTestId('branding-locked')).toBeVisible();
    await page.getByTestId('branding-palette').getByText('Indigo', { exact: true }).click();
    await page.getByTestId('branding-save').click();
    await page.goto(`${CU}/customer/portal/home`);
    await expect.poll(() => html(page, 'data-palette')).toBe('indigo');
  });

  test('a resident asks to add someone; the office approves; the household shows them', async ({
    page,
  }) => {
    await seedSociety(page, { staff: 'alnoor_manager', resident: 'alnoor_resident_a101' });
    await page.goto(`${CU}/customer/portal/household`);
    await page.getByTestId('household-name').fill('Ali Siddiqui');
    await page.getByTestId('household-relationship').getByRole('button').click();
    await page.getByRole('option', { name: 'Son or daughter' }).click();
    await page.getByTestId('household-submit').click();
    await expect(
      page.getByTestId('household-requests').locator('li[data-state="pending"]'),
    ).toHaveCount(1);
    await page.goto(`${BO}/backoffice/res/household-members?tab=requests`);
    await page
      .getByTestId('household-office-requests')
      .locator('li', { hasText: 'Ali Siddiqui' })
      .getByTestId('household-approve')
      .click();
    await page.goto(`${CU}/customer/portal/household`);
    await expect(page.getByTestId('household-people').first()).toContainText('Ali Siddiqui');
    await page.goto(`${CU}/customer/portal/my-properties`);
    await page.getByTestId('property-card').first().click();
    await expect(page.getByTestId('property-detail')).toHaveAttribute('data-flat', 'A-101');
  });
});

const DISPLAY_KEY: Record<string, string> = {
  alnoor_manager: 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001',
  alnoor_admin: 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_r0003',
  supreme_admin: 'pref:display:v1:platform:platform:usr_hq_0001',
};

/** D.1 pages for the accessibility and reflow sweeps: [app origin, path, ready test id, persona, app]. */
const PAGES: Array<[string, string, string, Parameters<typeof seed>[1]]> = [
  [
    BO,
    '/backoffice/global/accessibility-preferences',
    'personalization-hub',
    { persona: 'alnoor_manager' },
  ],
  [BO, '/backoffice/global/profile--preferences', 'profile-details', { persona: 'alnoor_admin' }],
  [
    BO,
    '/backoffice/global/profile--preferences?tab=devices',
    'devices-panel',
    { persona: 'alnoor_admin' },
  ],
  [BO, '/backoffice/residents/portal-access', 'portal-access', { persona: 'alnoor_manager' }],
  [BO, '/backoffice/res/household-members', 'household-members', { persona: 'alnoor_manager' }],
  [BO, '/backoffice/adm/data', 'export-list', { persona: 'alnoor_admin' }],
  [BO, '/backoffice/adm/data?tab=privacy', 'privacy-list', { persona: 'alnoor_admin' }],
  [
    BO,
    '/backoffice/res/household-members?tab=requests',
    'household-office-requests',
    { persona: 'alnoor_manager' },
  ],
  [BO, '/backoffice/adm/user-workspace', 'staff-list', { persona: 'alnoor_admin' }],
  [BO, '/backoffice/adm/branding', 'branding-palette', { persona: 'alnoor_admin' }],
  [
    CU,
    '/customer/portal/accessibility-preferences',
    'personalization-hub',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [
    CU,
    '/customer/portal/profile',
    'profile-details',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [
    CU,
    '/customer/portal/profile?tab=data',
    'my-data',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [
    CU,
    '/customer/portal/household',
    'household',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [
    CU,
    '/customer/portal/my-properties',
    'my-properties',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [
    CU,
    '/customer/portal/welcome',
    'welcome-language',
    { app: 'customer', persona: 'alnoor_owner_a201' },
  ],
  [CU, '/shared/auth/customer-portal-login', 'portal-sign-in', { app: 'customer', persona: null }],
  [HQ, '/hq/preferences', 'personalization-hub', { app: 'platform', persona: 'supreme_admin' }],
];

test.describe('D.1 accessibility and reflow', () => {
  // One test per language and width, so the four run side by side within their time budget.
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const vp of ['desktop', 'phone'] as const) {
      test(`axe: D.1 pages (${locale}, ${vp})`, async ({ browser }, testInfo) => {
        test.setTimeout(420_000);
        const failures: string[] = [];
        for (const [origin, path, ready, options] of PAGES) {
          const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
          const page = await context.newPage();
          await seed(page, { ...options, locale });
          await page.goto(`${origin}${path}`);
          await page.getByTestId(ready).first().waitFor();
          for (const v of (
            await scanA11y(page, testInfo, `d1-${locale}-${vp}-${path.replace(/\W+/g, '-')}`)
          ).violations)
            failures.push(`${locale} ${vp} ${path}: ${v.id} ${v.targets.join(' | ')}`);
          await context.close();
        }
        expect(failures).toEqual([]);
      });
    }
  }

  test('320 px and 200 % text: no horizontal scrolling and no squeezed text on the D.1 pages', async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const failures: string[] = [];
    for (const [origin, path, ready, options] of PAGES) {
      for (const [vp, scale] of [
        ['reflow', 1],
        ['phone', 2],
      ] as const) {
        const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
        const page = await context.newPage();
        await seed(page, {
          ...options,
          locale: 'ur-PK',
          ...(options?.app === 'customer' ? { textScale: scale } : {}),
        });
        // Staff and platform people keep their text size in the same per-person record.
        const key = DISPLAY_KEY[options?.persona ?? ''];
        if (key && options?.app !== 'customer')
          await page.addInitScript(
            ({ key, scale }) =>
              localStorage.setItem(
                key,
                JSON.stringify({
                  version: 2,
                  textScale: scale,
                  chosenAt: '2026-10-26T00:00:00Z',
                  updatedAt: '2026-10-26T00:00:00Z',
                }),
              ),
            { key, scale },
          );
        await page.goto(`${origin}${path}`);
        await page.getByTestId(ready).first().waitFor();
        const overflow = await overflowOf(page);
        if (overflow > 0) failures.push(`${vp} ${scale * 100}% ${path}: ${overflow}px`);
        for (const x of await squeezed(page))
          failures.push(`${vp} ${scale * 100}% ${path}: squeezed ${x}`);
        await context.close();
      }
    }
    expect(failures).toEqual([]);
  });
});
