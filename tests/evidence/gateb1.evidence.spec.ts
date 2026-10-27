import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { expect, HQ, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate B checkpoint 1 evidence → docs/status/gate-b-checkpoint-1/{screenshots,video}. Run on its own
 * against production builds: `npx playwright test --project=evidence tests/evidence/gateb1.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-b-checkpoint-1/screenshots';
const VIDEO = 'docs/status/gate-b-checkpoint-1/video';
const RAW = 'test-results/gateb1-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
const input = (page: Page, testId: string) => page.getByTestId(testId).locator('input').first();

async function open(browser: Browser, vp: ViewportName, path: string, opts: { persona?: PersonaId | null; locale?: Locale; onboarding?: 'fresh' | 'done'; context?: BrowserContextOptions } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], ...opts.context });
  const page = await context.newPage();
  await seed(page, { app: 'platform', persona: opts.persona === undefined ? 'supreme_admin' : opts.persona, locale: opts.locale ?? 'en-PK', onboarding: opts.onboarding ?? 'done', mock: 'fast' });
  await page.goto(`${HQ}${path}`);
  await settle(page, 1200);
  return page;
}

async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

/** Drives the wizard for the owner's example, calling `at(step)` after each step is shown. */
async function wizard(page: Page, at: (step: string) => Promise<void>, opts: { name?: string; discount?: string; pace?: number } = {}) {
  const pace = opts.pace ?? 0;
  const name = opts.name ?? 'Al-Noor Residency (Demo)';
  await page.goto(`${HQ}/hq/tenants/new`);
  await page.getByTestId('step-type').waitFor();
  await page.getByTestId('edition-community').click();
  await at('type');
  await page.getByTestId('step-type-next').click();
  await page.getByTestId('step-organisation').waitFor();
  await input(page, 'org-display').fill(name);
  await input(page, 'org-legal').fill(`${name.replace(' (Demo)', '')} Owners Association (Demo)`);
  await input(page, 'org-contact').fill('Faisal Butt');
  await input(page, 'org-email').fill('faisal@example.com');
  await input(page, 'org-phone').fill('03994100000');
  await at('organisation');
  await page.getByTestId('step-organisation-next').click();
  await page.getByTestId('step-sites').waitFor();
  await input(page, 'site-units-0').fill('80');
  await input(page, 'site-buildings-0').fill('2');
  await input(page, 'site-buildings-0').press('Tab');
  await at('sites');
  await page.getByTestId('step-sites-next').click();
  await page.getByTestId('dependencies-ok').waitFor();
  await at('modules');
  await page.getByTestId('step-modules-next').click();
  await page.getByTestId('pricing-builder').waitFor();
  await expect(page.getByTestId('aside-first').first()).toHaveText(/18,700/);
  await at('pricing');
  await page.getByTestId('step-pricing-next').click();
  await page.getByTestId('step-counts').waitFor();
  await at('counts');
  await page.getByTestId('step-counts-next').click();
  await page.getByTestId('step-terms').waitFor();
  if (opts.discount) {
    await page.getByTestId('add-discount').click();
    await input(page, 'discount-value-0').fill(opts.discount);
    await input(page, 'discount-reason-0').fill('Launch offer');
    await input(page, 'discount-reason-0').press('Tab');
  }
  await at('terms');
  await page.getByTestId('step-terms-next').click();
  await page.getByTestId('quote-totals').waitFor();
  await at('quote');
  await page.getByTestId('step-quote-next').click();
  await page.getByTestId('step-review').waitFor();
  await at('review');
  await page.getByTestId('step-review-next').click();
  if (pace) await page.waitForTimeout(pace);
  await page.getByRole('alertdialog').getByRole('button').last().click();
  await page.getByTestId('step-done').waitFor();
  await at('done');
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  for (const vp of ['desktop', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;
    test(`screens ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const signIn = await open(browser, vp, '/hq', { persona: null, locale });
      await shot(signIn, `hq-sign-in-${w}-${l}`);
      await signIn.context().close();

      const page = await open(browser, vp, '/hq', { locale });
      await shot(page, `hq-dashboard-${w}-${l}`);
      await shot(page, `hq-dashboard-${w}-${l}-full`, true);
      await page.goto(`${HQ}/hq/tenants`);
      await settle(page);
      await shot(page, `hq-tenants-${w}-${l}`, true);
      await page.goto(`${HQ}/hq/tenants?tenant=tnt_kestrel`);
      await page.getByTestId('summary-approval').waitFor();
      await settle(page);
      await shot(page, `hq-tenant-summary-approval-${w}-${l}`);
      await page.goto(`${HQ}/hq/tenants?tab=requests`);
      await page.getByTestId('requests-list').waitFor();
      await settle(page);
      await shot(page, `hq-requests-${w}-${l}`, true);

      await wizard(page, async (step) => {
        await settle(page, 600);
        await shot(page, `hq-wizard-${step}-${w}-${l}`, step === 'modules' || step === 'pricing' || step === 'quote' || step === 'review');
        if (step === 'modules') {
          await page.getByTestId('toggle-receivables').click();
          await page.getByTestId('dependency-issues').waitFor();
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page, 500);
          await shot(page, `hq-wizard-modules-dependency-${w}-${l}`);
          await page.getByTestId('apply-fixes').click();
          await page.getByTestId('dependencies-ok').waitFor();
        }
      });

      await page.goto(`${HQ}/hq/simulator`);
      await page.getByTestId('sim-results').waitFor();
      await settle(page);
      await shot(page, `hq-simulator-${w}-${l}`, true);
      await page.getByTestId('sim-basis').locator('label').nth(1).click();
      await settle(page);
      await shot(page, `hq-simulator-occupied-${w}-${l}`);

      await page.goto(`${HQ}/hq/catalogue`);
      await page.getByTestId('planned-screen').waitFor();
      await shot(page, `hq-planned-${w}-${l}`);
      if (vp === 'phone') {
        await page.goto(`${HQ}/hq/more`);
        await settle(page);
        await shot(page, `hq-more-${w}-${l}`, true);
      }
      await page.context().close();
    });

    test(`approval and tour ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await open(browser, vp, '/hq', { locale });
      await wizard(page, async (step) => {
        if (step === 'review') {
          await settle(page, 500);
          await shot(page, `hq-wizard-review-approval-${w}-${l}`);
        }
        if (step === 'done') {
          await settle(page, 500);
          await shot(page, `hq-wizard-done-pending-${w}-${l}`);
        }
      }, { name: 'Kite Gardens Society (Demo)', discount: '20' });
      await page.getByTestId('done-open-tenant').click();
      await page.getByTestId('approval-waiting').waitFor();
      await settle(page, 500);
      await shot(page, `hq-approval-own-request-${w}-${l}`);
      await page.context().close();

      const tour = await open(browser, vp, '/hq', { locale, onboarding: 'fresh' });
      await tour.getByTestId('welcome-start').click();
      for (let i = 1; i <= 8; i++) {
        await tour.getByTestId('tour-card').waitFor();
        await settle(tour, 700);
        const step = await tour.getByTestId('tour-card').getAttribute('data-step-id');
        await shot(tour, `hq-tour-${w}-${l}-${String(i).padStart(2, '0')}-${step}`);
        if (step === 'help') break;
        await tour.getByTestId('tour-next').click();
      }
      await tour.context().close();
    });
  }
}

test('video: Supreme Admin creates the Al-Noor tenant and tries prices (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', '/hq', { context: { recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } } });
  await page.waitForTimeout(2500);
  await page.getByTestId('hq-attention').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await wizard(page, async () => void (await page.waitForTimeout(1600)), { pace: 1200 });
  await page.waitForTimeout(1500);
  await page.getByTestId('done-open-tenant').click();
  await page.getByTestId('tenant-summary').waitFor();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.goto(`${HQ}/hq/simulator`);
  await page.getByTestId('sim-results').waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId('sim-basis').getByText('Occupied flats').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('sim-discount').locator('input').focus();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  await keepVideo(page, 'hq-create-tenant-and-simulate-desktop-en');
});

test('video: commercial approval, requester then approver (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', '/hq', { context: { recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } } });
  await wizard(page, async (step) => void (step === 'terms' || step === 'review' ? await page.waitForTimeout(2200) : await page.waitForTimeout(500)), {
    name: 'Kite Gardens Society (Demo)',
    discount: '20',
    pace: 1200,
  });
  await page.waitForTimeout(1500);
  await page.getByTestId('done-open-tenant').click();
  await page.getByTestId('approval-waiting').waitFor();
  await page.waitForTimeout(2500);
  await page.goto(`${HQ}/hq/more`);
  await page.waitForTimeout(1000);
  await page.getByTestId('more-role-commercial_approver').click();
  await page.getByTestId('welcome-explore').click();
  await page.goto(`${HQ}/hq/tenants?status=awaiting_approval`);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Kite Gardens Society (Demo)' }).first().click();
  await page.getByTestId('approval-approve').waitFor();
  await page.waitForTimeout(1800);
  await page.getByTestId('approval-approve').click();
  await page.waitForTimeout(1000);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(3000);
  await keepVideo(page, 'hq-commercial-approval-desktop-en');
});

test('video: Platform HQ on a phone (Urdu)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'phone', '/hq', { locale: 'ur-PK', context: { recordVideo: { dir: RAW, size: { width: 390, height: 844 } } } });
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, -900);
  await wizard(page, async () => void (await page.waitForTimeout(1200)), { name: 'Bilingual Towers Society (Demo)', pace: 1000 });
  await page.waitForTimeout(1500);
  await page.goto(`${HQ}/hq/simulator`);
  await page.getByTestId('sim-results').waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId('bottom-nav-more').click();
  await page.waitForTimeout(2500);
  await keepVideo(page, 'hq-phone-ur');
});
