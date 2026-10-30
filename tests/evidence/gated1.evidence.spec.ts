import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, HQ, seed, test, type Locale, type SeedOptions } from '../support/fixtures';
import { become, seedSociety, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate D.1 evidence (identity, personalization and onboarding) → docs/status/gate-d1/{screenshots,video}.
 * Run on its own against production builds:
 * `npx playwright test --project=evidence tests/evidence/gated1.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-d1/screenshots';
const VIDEO = 'docs/status/gate-d1/video';
const RAW = 'test-results/gated1-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const width = (vp: ViewportName) => VIEWPORTS[vp].width;

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, url: string, ready: string, ms = 700) {
  await page.goto(url);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function context(browser: Browser, vp: ViewportName, options: SeedOptions | null, society?: SocietySeed, video = false) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], acceptDownloads: true, ...(video ? { recordVideo: { dir: RAW, size: VIEWPORTS[vp] } } : {}) });
  const page = await ctx.newPage();
  if (society) await seedSociety(page, society);
  else if (options) await seed(page, options);
  return page;
}

const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

const DISPLAY = (key: string, patch: Record<string, unknown>) => ({ key, value: JSON.stringify({ version: 2, textScale: 1, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z', ...patch }) });
async function withDisplay(page: Page, d: { key: string; value: string }) {
  await page.addInitScript((d) => {
    if (!localStorage.getItem('evidence:display')) {
      localStorage.setItem('evidence:display', '1');
      localStorage.setItem(d.key, d.value);
    }
  }, d);
}

test.describe.configure({ mode: 'parallel' });

/** Each D.1 screen in both languages, desktop and phone. */
const SCREENS: Array<{ name: string; url: string; ready: string; seed: SeedOptions | null; society?: SocietySeed; phoneOnly?: boolean }> = [
  { name: 'p01-hub-office', url: `${BO}/backoffice/global/accessibility-preferences`, ready: 'personalization-hub', seed: { persona: 'alnoor_manager' } },
  { name: 'p02-hub-resident', url: `${CU}/customer/portal/accessibility-preferences`, ready: 'personalization-hub', seed: { app: 'customer', persona: 'alnoor_resident_a101' } },
  { name: 'p03-hub-hq', url: `${HQ}/hq/preferences`, ready: 'personalization-hub', seed: { app: 'platform', persona: 'supreme_admin' } },
  { name: 'i01-portal-access', url: `${BO}/backoffice/residents/portal-access`, ready: 'portal-access', seed: { persona: 'alnoor_manager' } },
  { name: 'i02-flat-portal-tab', url: `${BO}/backoffice/sites/site_alnoor/units/unt_anr_a101?tab=portal`, ready: 'flat-portal', seed: { persona: 'alnoor_manager' } },
  { name: 'i03-phone-sign-in', url: `${CU}/shared/auth/customer-portal-login`, ready: 'portal-sign-in', seed: { app: 'customer', persona: null } },
  { name: 'i04-welcome-language', url: `${CU}/customer/portal/welcome`, ready: 'welcome-language', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'd01-office-profile', url: `${BO}/backoffice/global/profile--preferences`, ready: 'profile-details', seed: { persona: 'alnoor_admin' } },
  { name: 'd02-office-devices', url: `${BO}/backoffice/global/profile--preferences?tab=devices`, ready: 'devices-panel', seed: { persona: 'alnoor_admin' } },
  { name: 'd03-office-activity', url: `${BO}/backoffice/global/profile--preferences?tab=activity`, ready: 'security-activity', seed: { persona: 'alnoor_admin' } },
  { name: 'd04-resident-profile', url: `${CU}/customer/portal/profile`, ready: 'profile-details', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'd05-resident-devices', url: `${CU}/customer/portal/profile?tab=devices`, ready: 'devices-panel', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'd06-resident-my-data', url: `${CU}/customer/portal/profile?tab=data`, ready: 'my-data', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'd07-staff-sessions', url: `${BO}/backoffice/adm/user-workspace`, ready: 'staff-list', seed: { persona: 'alnoor_admin' } },
  { name: 'd08-data-privacy', url: `${BO}/backoffice/adm/data`, ready: 'export-list', seed: { persona: 'alnoor_treasurer' } },
  { name: 'd09-privacy-requests', url: `${BO}/backoffice/adm/data?tab=privacy`, ready: 'privacy-list', seed: { persona: 'alnoor_admin' } },
  { name: 'h01-household-members', url: `${BO}/backoffice/res/household-members?tab=requests`, ready: 'household-members', seed: { persona: 'alnoor_manager' } },
  { name: 'h02-resident-household', url: `${CU}/customer/portal/household`, ready: 'household', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'h03-my-properties', url: `${CU}/customer/portal/my-properties`, ready: 'my-properties', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'h04-property-360', url: `${CU}/customer/portal/property-360-workspace?record=unt_anr_a201&tab=bills`, ready: 'property-detail', seed: { app: 'customer', persona: 'alnoor_owner_a201' } },
  { name: 'b01-organisation-colours', url: `${BO}/backoffice/adm/branding`, ready: 'branding-palette', seed: { persona: 'alnoor_admin' } },
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as ViewportName[]) {
    test(`D.1 screens ${lang(locale)} ${vp}`, async ({ browser }) => {
      test.setTimeout(600_000);
      for (const s of SCREENS) {
        const page = await context(browser, vp, s.seed ? { ...s.seed, locale } : null, s.society ? { ...s.society, locale } : undefined);
        await open(page, s.url, s.ready);
        await shot(page, `${s.name}-${width(vp)}-${lang(locale)}`);
        await page.context().close();
      }
    });
  }
}

test('D.1 personalization variants: dark, high contrast, 200 %, Nastaliq, 320 px', async ({ browser }) => {
  test.setTimeout(300_000);
  const variants: Array<[string, ViewportName, Locale, Record<string, unknown>]> = [
    ['p04-hub-dark-ocean', 'desktop', 'en-PK', { theme: 'dark', palette: 'ocean' }],
    ['p05-hub-high-contrast', 'desktop', 'en-PK', { contrast: 'high' }],
    ['p06-hub-200', 'phone', 'en-PK', { textScale: 2 }],
    ['p07-hub-nastaliq', 'phone', 'ur-PK', { fontUrdu: 'nastaliq', textScale: 1.25 }],
    ['p08-hub-reading-compact', 'desktop', 'en-PK', { reading: true, density: 'compact', fontLatin: 'readable' }],
    ['p09-hub-320', 'reflow', 'ur-PK', {}],
  ];
  for (const [name, vp, locale, patch] of variants) {
    const page = await context(browser, vp, { persona: 'alnoor_manager', locale });
    await withDisplay(page, DISPLAY('pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001', patch));
    await open(page, `${BO}/backoffice/global/accessibility-preferences`, 'personalization-hub');
    await shot(page, `${name}-${width(vp)}-${lang(locale)}`);
    await page.context().close();
  }
  // The resident app in dark mode and at 320 px in Urdu.
  for (const [name, vp, locale, patch] of [
    ['p10-resident-home-dark', 'phone', 'en-PK', { theme: 'dark' }],
    ['p11-resident-home-320', 'reflow', 'ur-PK', {}],
  ] as const) {
    const page = await context(browser, vp, { app: 'customer', persona: 'alnoor_owner_a201', locale });
    await withDisplay(page, DISPLAY('pref:display:v1:customer:tnt_alnoor:usr_anr_r0003', patch));
    await open(page, `${CU}/customer/portal/home`, 'portal-account');
    await shot(page, `${name}-${width(vp)}-${lang(locale)}`);
    await page.context().close();
  }
});

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`Reference 2: invitation to home (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
    const page = await context(browser, vp, null, { staff: 'alnoor_manager', locale }, true);
    const w = width(vp);
    const l = lang(locale);
    await open(page, `${BO}/backoffice/residents/portal-access?status=not_invited`, 'portal-row');
    await page.getByTestId('portal-row-actions').first().click();
    await page.getByTestId('portal-action-invite').click();
    await page.getByTestId('invite-drawer').waitFor();
    await settle(page);
    await shot(page, `r01-invite-drawer-${w}-${l}`, false);
    await page.getByTestId('invite-channel').locator('label').nth(3).click();
    await page.getByTestId('invite-send').click();
    await page.getByTestId('invite-result').waitFor();
    await settle(page);
    await shot(page, `r02-invite-printed-letter-${w}-${l}`, false);
    const href = (await page.getByTestId('invite-open-link').first().getAttribute('href'))!;
    await open(page, href, 'invitation-joining');
    await shot(page, `r03-invitation-${w}-${l}`);
    await page.getByTestId('invitation-send-code').click();
    await page.getByTestId('code-input').fill('111111');
    await page.getByTestId('code-submit').click();
    await settle(page);
    await shot(page, `r04-invitation-wrong-code-${w}-${l}`);
    await page.getByTestId('demo-code-use').click();
    await page.getByTestId('code-submit').click();
    await page.getByTestId('welcome-language').waitFor();
    await settle(page);
    await shot(page, `r05-welcome-language-${w}-${l}`);
    await page.getByTestId('welcome-continue').click();
    await page.getByTestId('text-size-welcome').waitFor();
    await page.getByTestId('text-size-125').click();
    await settle(page);
    await shot(page, `r06-welcome-text-size-${w}-${l}`);
    await page.getByTestId('text-size-continue').click();
    await page.getByTestId('welcome-theme').waitFor();
    await settle(page);
    await shot(page, `r07-welcome-theme-${w}-${l}`);
    await page.getByTestId('welcome-continue').click();
    await page.getByTestId('welcome-done').waitFor();
    await settle(page);
    await shot(page, `r08-welcome-done-${w}-${l}`);
    await page.getByTestId('welcome-home').click();
    await page.getByTestId('portal-account').waitFor();
    await settle(page, 1200);
    await shot(page, `r09-home-after-joining-${w}-${l}`);
    await open(page, `${BO}/backoffice/residents/portal-access?status=active`, 'portal-row');
    await shot(page, `r10-office-sees-active-${w}-${l}`, false);
    await keepVideo(page, `reference-2-invitation-to-home-${l}`);
  });
}

test('Reference 3: devices, app switch, data requests (en)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await context(browser, 'desktop', null, { staff: 'alnoor_admin', resident: 'alnoor_owner_a201' }, true);
  await open(page, `${BO}/backoffice/global/profile--preferences?tab=devices`, 'devices-panel');
  await page.getByTestId('session-revoke').first().click();
  await settle(page, 400);
  await shot(page, 's01-sign-out-device-confirm-1440-en', false);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out this device' }).click();
  await settle(page, 1000);
  await shot(page, 's02-device-signed-out-1440-en');
  await page.getByTestId('user-menu-button').click();
  await settle(page, 400);
  await shot(page, 's03-account-menu-switch-1440-en', false);
  await page.getByTestId('user-menu-app-switch').click();
  await page.waitForURL(/5174\/customer\/portal\/home/);
  await page.getByTestId('role-mode').waitFor();
  await settle(page, 1200);
  await shot(page, 's04-resident-after-switch-1440-en', false);
  await open(page, `${CU}/customer/portal/profile?tab=data`, 'my-data');
  await page.getByTestId('my-data-details').fill('Please correct the spelling of my name on the register.');
  await page.getByTestId('my-data-submit').click();
  await page.getByTestId('my-data-requests').waitFor();
  await settle(page);
  await shot(page, 's05-resident-request-sent-1440-en');
  await page.getByTestId('portal-account').click();
  await page.getByTestId('menu-app-switch').click();
  await page.waitForURL(/5173\/backoffice\//);
  await settle(page, 1200);
  await open(page, `${BO}/backoffice/adm/data`, 'export-list');
  await page.getByTestId('export-new-button').click();
  for (const d of ['people', 'flats', 'invoices']) await page.getByTestId(`export-pick-${d}`).click();
  await page.getByTestId('export-purpose').fill('Arrears follow-up list for the committee meeting.');
  await settle(page, 400);
  await shot(page, 's06-new-export-1440-en', false);
  await page.getByTestId('export-submit').click();
  await settle(page, 800);
  await become(page, 'backoffice', 'alnoor_treasurer');
  await open(page, `${BO}/backoffice/adm/data`, 'export-review');
  await page.getByTestId('export-review').first().click();
  await page.getByTestId('export-keep-invoices').click();
  await settle(page, 400);
  await shot(page, 's07-approver-narrows-1440-en', false);
  await page.getByTestId('export-approve').click();
  await settle(page, 1000);
  await shot(page, 's08-export-approved-1440-en');
  await become(page, 'backoffice', 'alnoor_admin');
  await open(page, `${BO}/backoffice/adm/data`, 'export-download');
  await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').first().click()]);
  await settle(page);
  await shot(page, 's09-requester-downloaded-1440-en');
  await keepVideo(page, 'reference-3-devices-switch-data-en');
});

test('Reference 1: one hub, three apps (en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, 'desktop', null, { staff: 'alnoor_manager', resident: 'alnoor_resident_a101' }, true);
  await open(page, `${BO}/backoffice/global/accessibility-preferences`, 'personalization-hub');
  await page.getByTestId('text-size-125').click();
  await page.getByTestId('hub-theme').getByText('Dark', { exact: true }).click();
  await page.getByTestId('hub-palette').getByText('Indigo', { exact: true }).click();
  await settle(page);
  await shot(page, 'p12-office-hub-changed-1440-en', false);
  await open(page, `${CU}/customer/portal/accessibility-preferences`, 'personalization-hub');
  await page.getByTestId('hub-contrast').getByText('High contrast', { exact: false }).first().click();
  await settle(page);
  await shot(page, 'p13-resident-hub-high-contrast-1440-en', false);
  await keepVideo(page, 'reference-1-personalization-en');
});

// ---------------------------------------------------------------- D.1 closure (Issue #5)

/** Real phone viewports (what a person sees, not a full-page capture): 320 and 390 px, 100 % and 200 %. */
async function phone(browser: Browser, width: 320 | 390, locale: Locale, persona: SeedOptions, display: { key: string; scale: number }, height = width === 320 ? 640 : 844) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await seed(page, { ...persona, locale, ...(persona.app === 'customer' ? { textScale: display.scale } : {}) });
  if (persona.app !== 'customer') await withDisplay(page, DISPLAY(display.key, { textScale: display.scale }));
  return page;
}

const OFFICE_MANAGER = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';
const OFFICE_RABIA = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_r0003';

test('Closure: phone viewports at 320 and 390 px, 100 % and 200 %', async ({ browser }) => {
  test.setTimeout(420_000);
  for (const [w, scale, locale] of [
    [320, 1, 'en-PK'],
    [320, 1, 'ur-PK'],
    [320, 2, 'ur-PK'],
    [390, 1, 'en-PK'],
    [390, 2, 'en-PK'],
    [390, 2, 'ur-PK'],
  ] as const) {
    const tag = `${w}-${lang(locale)}`;
    const pct = scale * 100;
    // The office header: the site's short name, or its initials, never cut; the section menu and the scroll hint.
    let page = await phone(browser, w, locale, { persona: 'alnoor_manager' }, { key: OFFICE_MANAGER, scale });
    await open(page, `${BO}/backoffice/global/accessibility-preferences`, 'hub-index');
    await shot(page, `v01-office-hub-top-${pct}-${tag}`, false);
    await page.getByTestId('hub-sections-menu').click();
    await settle(page, 400);
    await shot(page, `v02-hub-all-settings-menu-${pct}-${tag}`, false);
    await page.keyboard.press('Escape');
    await page.context().close();
    // Devices: Tab to the first "Sign out this device"; the focused control is clear of the header and the bar.
    page = await phone(browser, w, locale, { persona: 'alnoor_admin' }, { key: OFFICE_RABIA, scale });
    await open(page, `${BO}/backoffice/global/profile--preferences?tab=devices`, 'session-row');
    await page.locator('main').focus();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'session-revoke')) break;
    }
    await settle(page, 400);
    await shot(page, `v03-devices-focus-${pct}-${tag}`, false);
    await page.context().close();
    // The resident app's hub with its scope labels, and the end of a long page above the bar.
    page = await phone(browser, w, locale, { app: 'customer', persona: 'alnoor_owner_a201' }, { key: '', scale });
    await open(page, `${CU}/customer/portal/accessibility-preferences#contrast`, 'hub-scope-contrast');
    await shot(page, `v04-resident-hub-scope-${pct}-${tag}`, false);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settle(page, 400);
    await shot(page, `v05-resident-hub-end-${pct}-${tag}`, false);
    await page.context().close();
  }
  // Keyboard open (a short viewport): the field stays in view, the bar steps aside, in both apps.
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    let page = await phone(browser, 390, locale, { persona: 'alnoor_admin' }, { key: OFFICE_RABIA, scale: 1 }, 420);
    await open(page, `${BO}/backoffice/global/profile--preferences`, 'contact-phone');
    await page.getByTestId('contact-phone').focus();
    await settle(page, 600);
    await shot(page, `v06-office-keyboard-open-390-${lang(locale)}`, false);
    await page.context().close();
    page = await phone(browser, 390, locale, { app: 'customer', persona: 'alnoor_owner_a201' }, { key: '', scale: 1 }, 420);
    await open(page, `${CU}/customer/portal/household`, 'household-name');
    await page.getByTestId('household-name').focus();
    await settle(page, 600);
    await shot(page, `v07-resident-keyboard-open-390-${lang(locale)}`, false);
    await page.context().close();
  }
});

test('Closure: shared essentials when Rabia switches apps (video)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, 'phone', null, { staff: 'alnoor_admin', resident: 'alnoor_owner_a201', textScale: 1.25 }, true);
  await open(page, `${CU}/customer/portal/home`, 'portal-account', 1200);
  await shot(page, 'x01-resident-c2-size-125-390-en', false);
  await open(page, `${BO}/backoffice/global/accessibility-preferences`, 'personalization-hub', 1500);
  await shot(page, 'x02-office-adopts-125-390-en', false);
  await page.getByTestId('text-size-150').click();
  await page.getByTestId('hub-contrast').getByText('High contrast', { exact: false }).first().click();
  await page.getByTestId('hub-theme').getByText('Dark', { exact: true }).click();
  await settle(page, 800);
  await shot(page, 'x03-office-150-high-dark-390-en', false);
  await open(page, `${BO}/backoffice/global/profile--preferences`, 'app-switch');
  await page.getByTestId('app-switch').click();
  await page.waitForURL(/5174\/customer\/portal\/home/);
  await page.getByTestId('portal-account').waitFor();
  await settle(page, 1500);
  await shot(page, 'x04-resident-150-high-own-theme-390-en', false);
  await open(page, `${CU}/customer/portal/accessibility-preferences`, 'personalization-hub');
  await page.getByTestId('text-size-175').click();
  await page.getByTestId('locale-toggle').first().click();
  await settle(page, 800);
  await page.getByTestId('portal-account').click();
  await page.getByTestId('menu-app-switch').click();
  await page.waitForURL(/5173\/backoffice\//);
  await settle(page, 2000);
  await shot(page, 'x05-office-175-urdu-dark-390-ur', false);
  await keepVideo(page, 'closure-shared-essentials-en');
});
