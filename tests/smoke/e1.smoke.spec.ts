import type { Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';

/**
 * Gate E.1 cross-browser smoke (Firefox and WebKit projects): a lead assigned and converted by the
 * sales manager, moved with the keyboard menu, the salesperson's visit outcome with a follow-up; Bilal
 * never sees Gardens; the pipeline and the calendar at 320 px with 200 % text in Urdu. The full checks
 * run in Chromium (tests/e2e/e1-crm.spec.ts). Business date: 26 October 2026, 15:10.
 */
const PIPELINE = '/backoffice/crm/opportunities-pipeline';

const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
}

async function become(page: Page, persona: PersonaId) {
  await page.evaluate(
    ({ persona, value }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona) },
  );
}

/**
 * Type into a searchable list the way a person does (key by key) and click the option. In WebKit a
 * programmatic fill followed by a click leaves React Aria's combobox open without a selection (a
 * driver artefact: typed keys then a click select correctly, checked by hand), so keys are typed.
 */
async function pick(page: Page, testId: string, typed: string, option: RegExp) {
  const box = page.getByTestId(testId).getByRole('combobox');
  await box.click();
  await box.pressSequentially(typed, { delay: 40 });
  await page.getByRole('option', { name: option }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** A success toast with this text (earlier toasts may still be on screen). */
const toast = (page: Page, text: string) => expect(page.getByTestId('toast-success').filter({ hasText: text }).first()).toBeVisible();

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

test('assign → convert → move by menu → visit outcome with a follow-up; Bilal sees only his Heights records', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await seed(page, { persona: 'sales_manager' });
  await page.goto(`${BO}${PIPELINE}`);
  await waitForApp(page);
  await expect(page.getByTestId('pipeline-page')).toBeVisible();
  const conv = await societyApi<{ items: Array<{ id: string; ref: string; displayName: string; projectName: string; owner: { name: string } }> }>(page, '/crm/convertible-leads');
  if (!conv.ok) throw new Error('convertible');
  const lead = conv.res.items.find((l) => l.owner.name === 'Nadia Rahman' && l.projectName === 'Larkspur Heights')!;
  await page.goto(`${BO}/backoffice/crm/lead-assignment?lead=${lead.id}`);
  await pick(page, 'assign-assignee', 'Bilal', /Bilal Ahmed/);
  await expect(page.getByTestId('assign-assignee').getByRole('combobox')).toHaveValue('Bilal Ahmed');
  await page.getByTestId('assign-reason').fill('Covers Tower A');
  await page.getByTestId('assign-submit').click();
  await toast(page, '1 lead assigned to Bilal Ahmed');
  await page.keyboard.press('Escape');
  await page.getByTestId('pipeline-convert').click();
  await pick(page, 'convert-lead', lead.ref, new RegExp(lead.ref));
  await page.getByTestId('convert-submit').click();
  await expect(page.getByTestId('opportunity-360')).toHaveAttribute('data-stage', 'qualified');
  await page.getByTestId('opp-move').click();
  await page.getByTestId('move-to-visit').click();
  await expect(page.getByTestId('opportunity-360')).toHaveAttribute('data-stage', 'visit');

  await become(page, 'sales');
  const visit = await societyApi<{ id: string }>(page, '/visits', 'POST', { leadId: lead.id, at: new Date('2026-10-26T11:00:00+05:00').toISOString() });
  if (!visit.ok) throw new Error('visit');
  await page.goto(`${BO}/backoffice/crm/visit-workspace?record=${visit.res.id}`);
  await page.getByTestId('visit-record-outcome').click();
  await page.getByTestId('outcome-kind').getByText('Visited', { exact: true }).click();
  await page.getByTestId('outcome-feedback').fill('Keen on a corner unit');
  await page.locator('#follow-up-date').fill('2026-10-28');
  await page.getByTestId('follow-up-time').getByRole('button').click();
  await page.getByRole('option', { name: '12:00' }).click();
  await page.getByTestId('outcome-submit').click();
  await expect(page.getByTestId('visit-360')).toHaveAttribute('data-status', 'completed');
  await expect(page.getByTestId('visit-outcome')).toContainText('Keen on a corner unit');

  await page.goto(`${BO}${PIPELINE}`);
  await expect(page.getByTestId('opp-card').first()).toBeVisible();
  for (const c of await page.getByTestId('opp-card').all()) await expect(c).toHaveAttribute('data-project', 'prj_heights');
  await expect(page.locator('main')).not.toContainText('Larkspur Gardens');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('Urdu, 320 px, 200 % text: the pipeline (one stage at a time) and the calendar agenda reflow', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_larkspur:usr_lsp_0004', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
  await seed(page, { persona: 'sales_manager', locale: 'ur-PK' });
  await page.goto(`${BO}${PIPELINE}`);
  await waitForApp(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('pipeline-phone')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  await page.goto(`${BO}/backoffice/crm/site-visits-calendar`);
  await expect(page.getByTestId('calendar-agenda')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(appErrors(consoleErrors)).toEqual([]);
});
