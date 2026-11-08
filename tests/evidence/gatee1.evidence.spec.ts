import type { Browser, Page } from '@playwright/test';
import { BO, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { societyApi } from '../support/society';

/**
 * Gate E.1 evidence (CRM-006 lead assignment, CRM-007 opportunities pipeline, CRM-008 Opportunity 360,
 * CRM-009 site visits calendar, CRM-011 visit workspace) → docs/status/gate-e1/screenshots. Desktop and
 * phone in both languages, 320 px with 200 % text, dark mode with high contrast, the salesperson's
 * narrower view, and the journey's end state. Business date: Monday 26 October 2026, 15:10.
 * Run against production builds: `E2E_PORT_OFFSET=2000 npx playwright test --project=evidence tests/evidence/gatee1.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e1/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const PRINCIPALS = ['usr_lsp_0001', 'usr_lsp_0002', 'usr_lsp_0004'];
const PIPELINE = '/backoffice/crm/opportunities-pipeline';
const CALENDAR = '/backoffice/crm/site-visits-calendar';

const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function settle(page: Page, ms = 600) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function become(page: Page, persona: PersonaId) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, value }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona) },
  );
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale = 'en-PK', scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'sales_manager', locale });
  if (scale) for (const p of PRINCIPALS) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}`, scale });
  return page;
}

const BAR_HIDDEN = '[data-testid="bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });

const SCREENS: Array<[string, PersonaId, string, string]> = [
  ['a01-pipeline-board', 'sales_manager', PIPELINE, 'pipeline-board'],
  ['a02-pipeline-list', 'sales_manager', `${PIPELINE}?view=list`, 'pipeline-list'],
  ['a03-pipeline-salesperson', 'sales', PIPELINE, 'pipeline-page'],
  ['b01-opportunity-360', 'sales_manager', '/backoffice/crm/opportunity-360-workspace?record=opp_0014', 'opportunity-360'],
  ['b02-opportunity-timeline', 'sales_manager', '/backoffice/crm/opportunity-360-workspace?record=opp_0014&tab=timeline', 'opp-timeline'],
  ['c01-calendar-month', 'sales_manager', CALENDAR, 'calendar-month'],
  ['c02-calendar-agenda', 'sales_manager', `${CALENDAR}?view=agenda`, 'calendar-agenda'],
  ['c03-calendar-salesperson', 'sales', CALENDAR, 'calendar-results'],
  ['d01-visit-workspace', 'sales_manager', '/backoffice/crm/visit-workspace?record=vst_001', 'visit-360'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`desktop and phone screens (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(300_000);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await context(browser, viewport, locale);
      for (const [name, persona, path, ready] of SCREENS) {
        if (viewport.width < 768 && ready === 'calendar-month') {
          await as(page, persona, path, 'calendar-agenda');
        } else if (viewport.width < 768 && ready === 'pipeline-board') {
          await as(page, persona, path, 'pipeline-phone');
        } else await as(page, persona, path, ready);
        await shot(page, `${name}-${viewport.width}-${lang(locale)}`);
      }
      // CRM-006: the drawer at its register address (sales manager), and the read-only view (salesperson).
      await as(page, 'sales_manager', '/backoffice/crm/lead-assignment', 'lead-assignment');
      await shot(page, `e01-lead-assignment-${viewport.width}-${lang(locale)}`, false);
      await as(page, 'sales', '/backoffice/crm/lead-assignment', 'assign-read-only');
      await shot(page, `e02-lead-assignment-salesperson-${viewport.width}-${lang(locale)}`, false);
      await page.context().close();
    }
  });

  test(`320 px with 200 % text (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, { width: 320, height: 700 }, locale, 2);
    for (const [name, persona, path, ready] of SCREENS) {
      const r = ready === 'calendar-month' ? 'calendar-agenda' : ready === 'pipeline-board' ? 'pipeline-phone' : ready;
      await as(page, persona, path, r);
      await shot(page, `${name}-200pct-320-${lang(locale)}`);
    }
    await page.context().close();
  });
}

test('dialogs: convert, lost, reschedule and visit outcome (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, { width: 1440, height: 900 });
  await as(page, 'sales_manager', `${PIPELINE}?drawer=convert`, 'convert-dialog');
  await shot(page, 'f01-convert-dialog-1440-en', false);
  await as(page, 'sales_manager', '/backoffice/crm/opportunity-360-workspace?record=opp_0014', 'opportunity-360');
  await page.getByTestId('opp-lose').click();
  await page.getByTestId('lost-dialog').waitFor();
  await settle(page);
  await shot(page, 'f02-lost-dialog-1440-en', false);
  await as(page, 'sales_manager', '/backoffice/crm/visit-workspace?record=vst_001', 'visit-360');
  await page.getByTestId('visit-reschedule').click();
  await page.getByTestId('reschedule-dialog').waitFor();
  await settle(page);
  await shot(page, 'f03-reschedule-dialog-1440-en', false);
  await page.keyboard.press('Escape');
  await page.getByTestId('visit-record-outcome').click();
  await page.getByTestId('outcome-kind').getByText('Visited', { exact: true }).click();
  await settle(page);
  await shot(page, 'f04-outcome-dialog-1440-en', false);
  await page.context().close();
});

test('the journey: assigned, converted, moved, visited with a follow-up (1440, en and ur)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const locale of ['en-PK', 'ur-PK'] as const) {
    const page = await context(browser, { width: 1440, height: 900 }, locale);
    await as(page, 'sales_manager', PIPELINE, 'pipeline-page');
    const conv = await societyApi<{ items: Array<{ id: string; projectName: string; owner: { name: string } }> }>(page, '/crm/convertible-leads');
    if (!conv.ok) throw new Error('convertible');
    const lead = conv.res.items.find((l) => l.owner.name === 'Nadia Rahman' && l.projectName === 'Larkspur Heights')!;
    await societyApi(page, '/leads/assign', 'POST', { leadIds: [lead.id], assigneeId: 'usr_lsp_0002', reason: 'Bilal covers Tower A this month' });
    const opp = await societyApi<{ id: string; version: number }>(page, `/leads/${lead.id}/opportunities`, 'POST', { note: 'Wants a 3-bed on a high floor', expectedCloseOn: '2026-12-15', idempotencyKey: `evidence-${locale}` });
    if (!opp.ok) throw new Error('convert');
    await societyApi(page, `/opportunities/${opp.res.id}/stage`, 'POST', { stage: 'visit', version: opp.res.version });
    // Bilal: the page loads as him before he books the visit and records what happened.
    await as(page, 'sales', PIPELINE, 'pipeline-page');
    const visit = await societyApi<{ id: string; ownerName: string }>(page, '/visits', 'POST', { leadId: lead.id, at: new Date('2026-10-26T11:00:00+05:00').toISOString() });
    if (!visit.ok || visit.res.ownerName !== 'Bilal Ahmed') throw new Error('visit');
    await societyApi(page, `/visits/${visit.res.id}/outcome`, 'POST', { outcome: 'completed', interest: 'hot', feedback: 'Liked the corner units on the 9th floor', followUpAt: new Date('2026-10-28T12:00:00+05:00').toISOString(), version: 1 });
    await as(page, 'sales', `/backoffice/crm/visit-workspace?record=${visit.res.id}`, 'visit-outcome');
    await shot(page, `g01-journey-visit-outcome-1440-${lang(locale)}`);
    await as(page, 'sales_manager', `/backoffice/crm/opportunity-360-workspace?record=${opp.res.id}&tab=timeline`, 'opp-timeline');
    await shot(page, `g02-journey-opportunity-timeline-1440-${lang(locale)}`);
    await as(page, 'sales_manager', `/backoffice/crm/lead-assignment?lead=${lead.id}`, 'assign-preset');
    await shot(page, `g03-journey-assignment-history-1440-${lang(locale)}`, false);
    await as(page, 'sales', `/backoffice/crm/opportunity-360-workspace?record=${opp.res.id}&tab=timeline`, 'opp-timeline');
    await shot(page, `g04-journey-timeline-salesperson-projected-1440-${lang(locale)}`);
    await page.context().close();
  }
});

test('dark mode with high contrast (1440 en, 390 ur)', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const [viewport, locale] of [[{ width: 1440, height: 900 }, 'en-PK'], [{ width: 390, height: 844 }, 'ur-PK']] as const) {
    const page = await context(browser, viewport, locale);
    await as(page, 'sales_manager', '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await settle(page);
    await as(page, 'sales_manager', PIPELINE, 'pipeline-page');
    await shot(page, `h01-dark-pipeline-${viewport.width}-${lang(locale)}`);
    await as(page, 'sales_manager', CALENDAR, 'calendar-results');
    await shot(page, `h02-dark-calendar-${viewport.width}-${lang(locale)}`);
    await as(page, 'sales_manager', '/backoffice/crm/visit-workspace?record=vst_001', 'visit-360');
    await shot(page, `h03-dark-visit-${viewport.width}-${lang(locale)}`);
    await page.context().close();
  }
});
