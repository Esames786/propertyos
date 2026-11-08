import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, waitForApp, type Locale, type PersonaId } from '../support/fixtures';
import { keyboardFocus, ringOf } from '../support/focus';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate E.1 (provisional, wave 1): CRM-006 lead assignment, CRM-007 opportunities pipeline, CRM-008
 * Opportunity 360, CRM-009 site visits calendar, CRM-011 visit workspace. The journey (assign → convert
 * → visit outcome → follow-up) across two people; the board's drag and drop and its keyboard menu;
 * counts equal lists; lost and reopen; Bilal (Heights only) never sees Gardens; unauthorized, revoked
 * and cross-project access; invalid input and duplicate conversion leaving state unchanged; both
 * languages, 320 px at 200 %, dark mode and keyboard rings. Business date: Monday 26 October 2026, 15:10.
 */

const PIPELINE = '/backoffice/crm/opportunities-pipeline';
const CALENDAR = '/backoffice/crm/site-visits-calendar';
const BILAL = 'usr_lsp_0002';
const GARDENS = 'Larkspur Gardens';
const PRINCIPALS = ['usr_lsp_0001', 'usr_lsp_0002', 'usr_lsp_0003', 'usr_lsp_0004'];

const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
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

async function open(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function start(page: Page, persona: PersonaId = 'sales_manager', locale: Locale = 'en-PK') {
  await at(page);
  await seed(page, { persona, locale });
  await page.goto(`${BO}${PIPELINE}`);
  await waitForApp(page);
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

async function api<T>(page: Page, path: string, method: 'GET' | 'POST' = 'GET', body: unknown = {}, query?: Record<string, string>) {
  const r = await societyApi<T>(page, path, method, body, query);
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${r.code}`);
  return r.res;
}

/** A success toast with this text (earlier toasts may still be on screen). */
const toast = (page: Page, text: string) => expect(page.getByTestId('toast-success').filter({ hasText: text }).first()).toBeVisible();

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

interface Convertible {
  id: string;
  ref: string;
  displayName: string;
  projectName: string;
  owner: { name: string };
}
interface Opp {
  id: string;
  ref: string;
  stage: string;
  projectId: string;
  leadId: string;
  version: number;
  owner: { principalId: string };
  displayName: string;
}
interface Board {
  items: Opp[];
  stages: Array<{ stage: string; count: number }>;
}

/**
 * Drag a card to a column with the mouse. The drag starts with a small move while the card is under
 * the pointer, so scrolling the target into view afterwards cannot change which card is dragged.
 */
async function drag(page: Page, source: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>) {
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height * 0.45 + 8, { steps: 4 });
  await target.scrollIntoViewIfNeeded();
  const t = (await target.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + 40, { steps: 8 });
  await page.mouse.up();
}

async function pick(page: Page, testId: string, text: string, option: RegExp) {
  const box = page.getByTestId(testId).getByRole('combobox');
  await box.fill(text);
  await page.getByRole('option', { name: option }).first().click();
}

async function choose(page: Page, testId: string, option: string | RegExp) {
  await page.getByTestId(testId).getByRole('button').click();
  await page.getByRole('option', typeof option === 'string' ? { name: option, exact: true } : { name: option }).click();
}

test.describe('Gate E.1: the journey and the board', () => {
  test('a sales manager assigns a lead and converts it; the salesperson records the visit outcome and the follow-up; every screen shows it', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await start(page);
    const lead = (await api<{ items: Convertible[] }>(page, '/crm/convertible-leads')).items.find((l) => l.owner.name === 'Nadia Rahman' && l.projectName === 'Larkspur Heights')!;
    expect(lead).toBeTruthy();

    // 1. CRM-006 at its register address, opened for this lead.
    await page.goto(`${BO}/backoffice/crm/lead-assignment?lead=${lead.id}`);
    const drawer = page.getByTestId('lead-assignment-drawer');
    await expect(drawer.getByTestId('assign-preset')).toContainText(lead.displayName);
    await expect(drawer.getByTestId('assign-selected')).toContainText(lead.ref);
    await drawer.getByTestId('assign-submit').click();
    await expect(drawer.getByTestId('assign-assignee')).toContainText('Choose a colleague');
    await pick(page, 'assign-assignee', 'Bilal', /Bilal Ahmed/);
    await drawer.getByTestId('assign-reason').fill('Bilal covers Tower A this month');
    await drawer.getByTestId('assign-submit').click();
    await toast(page, '1 lead assigned to Bilal Ahmed');
    await expect(drawer.getByTestId('assign-preset').getByTestId('assign-history-entry').first()).toContainText('Samina Latif reassigned it from Nadia Rahman to Bilal Ahmed');
    await expect(drawer.getByTestId('assign-preset').getByTestId('assign-history-entry').first()).toContainText('Bilal covers Tower A this month');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`${PIPELINE}$`));

    // 2. Convert the qualified lead (one key per logical create).
    await page.getByTestId('pipeline-convert').click();
    const dialog = page.getByTestId('convert-dialog');
    await pick(page, 'convert-lead', lead.ref, new RegExp(lead.ref));
    await dialog.locator('#convert-close').fill('2026-12-15');
    await dialog.getByTestId('convert-note').fill('Wants a 3-bed on a high floor');
    await page.getByTestId('convert-submit').click();
    await toast(page, `opened for ${lead.displayName}`);
    const ws = page.getByTestId('opportunity-360');
    await expect(ws).toHaveAttribute('data-stage', 'qualified');
    await expect(ws).toContainText('Bilal Ahmed');
    await expect(page.getByTestId('opp-close')).toContainText('15 Dec 2026');
    const oppUrl = page.url();
    const oppId = new URL(oppUrl).searchParams.get('record')!;
    // The lead stays qualified; nothing is booked.
    await expect(page.getByTestId('e1-truth-note')).toContainText('never creates a quotation, hold, reservation, booking or payment');
    await expect(page.getByTestId('opp-won-planned')).toContainText('needs a booking');

    // 3. Move with the menu (the keyboard and screen-reader alternative to dragging).
    await page.getByTestId('opp-move').click();
    await page.getByTestId('move-to-visit').click();
    await toast(page, `${lead.displayName} moved to Site visit`);
    await expect(ws).toHaveAttribute('data-stage', 'visit');

    // 4. Bilal: his visit today at 11:00 (booked through the existing endpoint), outcome and follow-up.
    await become(page, 'sales');
    const visit = await api<{ id: string }>(page, '/visits', 'POST', { leadId: lead.id, at: new Date('2026-10-26T11:00:00+05:00').toISOString() });
    await open(page, 'sales', `${CALENDAR}?view=agenda`, 'calendar-results');
    const row = page.locator(`[data-testid="agenda-visit"][data-visit="${visit.id}"]`);
    await expect(row).toContainText(lead.displayName);
    await row.getByTestId('agenda-visit-link').click();
    await expect(page.getByTestId('visit-360')).toBeVisible();
    await expect(page.getByTestId('visit-opportunity-link')).toBeVisible();
    await page.getByTestId('visit-record-outcome').click();
    const outcome = page.getByTestId('outcome-dialog');
    await page.getByTestId('outcome-submit').click();
    await expect(outcome).toContainText('Choose what happened.');
    await outcome.getByTestId('outcome-kind').getByText('Visited', { exact: true }).click();
    await outcome.getByTestId('outcome-interest').getByText('Very interested', { exact: true }).click();
    await outcome.getByTestId('outcome-feedback').fill('Liked the corner units on the 9th floor');
    await pick(page, 'outcome-unit', 'LH-A', /LH-A/);
    await expect(outcome.getByTestId('outcome-units').locator('li')).toHaveCount(1);
    await outcome.locator('#follow-up-date').fill('2026-10-28');
    await choose(page, 'follow-up-time', '12:00');
    await page.getByTestId('outcome-submit').click();
    await toast(page, 'Outcome saved: Visited. Next follow-up 28 Oct 2026, 12:00 pm');
    await expect(page.getByTestId('visit-360')).toHaveAttribute('data-status', 'completed');
    await expect(page.getByTestId('visit-outcome')).toContainText('Liked the corner units on the 9th floor');
    await expect(page.getByTestId('visit-units-shown').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('visit-history')).toContainText('Recorded the outcome: Visited');

    // 5. Connected: the opportunity's timeline, Lead 360 and the board all show it.
    await page.goto(`${oppUrl}&tab=timeline`);
    const timeline = page.getByTestId('opp-timeline');
    await expect(timeline).toContainText('Recorded the site visit: Visited');
    await expect(timeline).toContainText('Set the next follow-up for 28 Oct 2026, 12:00 pm');
    await expect(timeline).toContainText('Moved from Qualified to Site visit');
    await expect(timeline).toContainText('Units shown: LH-A');
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}`);
    await expect(page.getByTestId('lead-next-follow-up')).toContainText('28 Oct 2026');
    await expect(page.getByTestId('lead-opportunity-link')).toBeVisible();
    await page.goto(`${BO}${PIPELINE}`);
    await expect(page.locator(`[data-testid="opp-card"][data-opp-id="${oppId}"]`)).toHaveAttribute('data-stage', 'visit');
    expect(consoleErrors).toEqual([]);
  });

  test('board: drag a card to another stage; the counts follow; every stage count equals the list it opens', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    const qualified = page.getByTestId('column-qualified');
    const quotation = page.getByTestId('column-quotation');
    const before = { q: Number(await qualified.getAttribute('data-count')), z: Number(await quotation.getAttribute('data-count')) };
    const card = qualified.getByTestId('opp-card').first();
    const id = (await card.getAttribute('data-opp-id'))!;
    await drag(page, card, quotation);
    await toast(page, 'moved to Quotation');
    await expect(quotation).toHaveAttribute('data-count', String(before.z + 1));
    await expect(qualified).toHaveAttribute('data-count', String(before.q - 1));
    await expect(page.locator(`[data-opp-id="${id}"]`)).toHaveAttribute('data-stage', 'quotation');
    // Dropping a card on Lost asks for the reason first (nothing changes until it is given).
    const visitCard = page.getByTestId('column-visit').getByTestId('opp-card').first();
    await drag(page, visitCard, page.getByTestId('column-lost'));
    await expect(page.getByTestId('lost-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    // Each figure opens the list it counts.
    for (const stage of ['qualified', 'visit', 'quotation', 'negotiation', 'reservation', 'won', 'lost']) {
      const link = page.getByTestId(`stage-link-${stage}`);
      const count = await link.getAttribute('data-count');
      await link.click();
      await expect(page.getByTestId('pipeline-list'), stage).toHaveAttribute('data-total', count!);
      await expect(page.getByTestId('pipeline-list')).toHaveAttribute('data-stage', stage);
      await page.goto(`${BO}${PIPELINE}`);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard: the Move menu moves a card without a mouse; focus stays on the moved card; rings are drawn', async ({ page, browser, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    const card = page.getByTestId('column-visit').getByTestId('opp-card').first();
    const id = (await card.getAttribute('data-opp-id'))!;
    await keyboardFocus(page, card.getByTestId('opp-move'));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Qualified' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Quotation' })).toBeFocused();
    await page.keyboard.press('Enter');
    await toast(page, 'moved to Quotation');
    const moved = page.locator(`[data-opp-id="${id}"]`);
    await expect(moved).toHaveAttribute('data-stage', 'quotation');
    await expect(moved.locator('[data-focus-target]')).toBeFocused();
    const decoder = await (await browser.newContext()).newPage();
    for (const [label, target] of [
      ['stage figure', page.getByTestId('stage-link-qualified')],
      ['card link', moved.locator('[data-focus-target]')],
      ['move menu', moved.getByTestId('opp-move')],
    ] as const) {
      const r = await ringOf(page, decoder, target);
      expect(r.focusVisible, label).toBe(true);
      expect(r.style, label).toBe('solid');
      expect(r.changed3, label).toBeGreaterThanOrEqual(0.9);
    }
    // The calendar: the month buttons and a visit link take a visible ring too.
    await page.goto(`${BO}${CALENDAR}`);
    for (const [label, target] of [
      ['next month', page.getByTestId('calendar-next')],
      ['visit link', page.getByTestId('calendar-visit').first()],
    ] as const) {
      const r = await ringOf(page, decoder, target);
      expect(r.focusVisible, label).toBe(true);
      expect(r.changed3, label).toBeGreaterThanOrEqual(0.9);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('lost with a reason and reopened with a note; refused inputs change nothing', async ({ page, consoleErrors }) => {
    await start(page);
    const board = await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board', stage: 'negotiation' });
    const o = board.items.find((x) => x.stage === 'negotiation')!;
    await page.goto(`${BO}/backoffice/crm/opportunity-360-workspace?record=${o.id}`);
    await page.getByTestId('opp-lose').click();
    await choose(page, 'lost-reason', 'Other');
    await page.getByTestId('lost-submit').click();
    await expect(page.getByTestId('lost-dialog')).toContainText('Write a note');
    expect((await api<Opp>(page, `/opportunities/${o.id}`).then((d) => (d as unknown as { opportunity: Opp }).opportunity)).stage).toBe('negotiation');
    await choose(page, 'lost-reason', 'Chose another project');
    await page.getByTestId('lost-submit').click();
    await toast(page, 'marked as lost (Chose another project)');
    await expect(page.getByTestId('opportunity-360')).toHaveAttribute('data-stage', 'lost');
    await page.getByTestId('opp-reopen').click();
    await page.getByTestId('reopen-submit').click();
    await expect(page.getByTestId('reopen-dialog')).toContainText('Write a note');
    await page.getByTestId('reopen-note').fill('The other project was delayed');
    await page.getByTestId('reopen-submit').click();
    await toast(page, 'reopened at Negotiation');
    await expect(page.getByTestId('opportunity-360')).toHaveAttribute('data-stage', 'negotiation');
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.getByTestId('opp-timeline')).toContainText('Marked as lost: Chose another project');
    await expect(page.getByTestId('opp-timeline')).toContainText('“The other project was delayed”');
    expect(consoleErrors).toEqual([]);
  });

  test('duplicate conversion: the same request replays the same opportunity; any other use of the key, or a second conversion, is refused', async ({ page, consoleErrors }) => {
    await start(page);
    const lead = (await api<{ items: Convertible[] }>(page, '/crm/convertible-leads')).items[0]!;
    const first = await api<Opp>(page, `/leads/${lead.id}/opportunities`, 'POST', { note: 'First', idempotencyKey: 'e2e-conv-1' });
    const again = await api<Opp>(page, `/leads/${lead.id}/opportunities`, 'POST', { note: 'First', idempotencyKey: 'e2e-conv-1' });
    expect(again.id).toBe(first.id);
    expect(await societyApi(page, `/leads/${lead.id}/opportunities`, 'POST', { note: 'Changed', idempotencyKey: 'e2e-conv-1' })).toEqual({ ok: false, code: 'idempotency_key_reused', status: 409 });
    expect(await societyApi(page, `/leads/${lead.id}/opportunities`, 'POST', { note: 'First', idempotencyKey: 'e2e-conv-2' })).toEqual({ ok: false, code: 'already_converted', status: 409 });
    const list = await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board', lead: lead.id });
    expect(list.items).toHaveLength(1);
    // The dialog: pressing twice opens one opportunity.
    const other = (await api<{ items: Convertible[] }>(page, '/crm/convertible-leads')).items[0]!;
    await page.goto(`${BO}${PIPELINE}?drawer=convert&lead=${other.id}`);
    await page.getByTestId('convert-submit').dblclick();
    await expect(page.getByTestId('opportunity-360')).toBeVisible();
    expect((await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board', lead: other.id })).items).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.1: access (E-05 default), no oracle, revocation', () => {
  test('Bilal (Heights only) never sees Gardens: board, list, calendar, search, assignment and direct addresses', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    const all = await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board' });
    const gardens = all.items.find((o) => o.projectId === 'prj_gardens')!;
    const cal = await api<{ items: Array<{ id: string; projectId: string }> }>(page, '/visits/calendar', 'GET', {}, { from: '2026-09-28', to: '2026-11-08' });
    const gardensVisit = cal.items.find((v) => v.projectId === 'prj_gardens')!;
    await open(page, 'sales', PIPELINE, 'pipeline-page');
    await expect(page.getByTestId('e1-scope-note')).toBeVisible();
    await expect(page.getByTestId('pipeline-convert')).toHaveCount(0);
    await expect(page.getByTestId('opp-move')).toHaveCount(0);
    const cards = page.getByTestId('opp-card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const c of await cards.all()) {
      await expect(c).toHaveAttribute('data-project', 'prj_heights');
      await expect(c).toHaveAttribute('data-owner', BILAL);
    }
    await expect(page.locator('main')).not.toContainText(GARDENS);
    await page.getByTestId('pipeline-search').fill('Gardens');
    await expect(page.getByTestId('column-qualified')).toHaveAttribute('data-count', '0');
    await page.goto(`${BO}${PIPELINE}?view=list`);
    await expect(page.locator('main')).not.toContainText(GARDENS);
    await page.goto(`${BO}${CALENDAR}?view=agenda`);
    await expect(page.getByTestId('agenda-visit').first()).toBeVisible();
    for (const v of await page.getByTestId('agenda-visit').all()) await expect(v).toHaveAttribute('data-project', 'prj_heights');
    await expect(page.locator('main')).not.toContainText(GARDENS);
    await page.goto(`${BO}/backoffice/crm/lead-assignment`);
    await expect(page.getByTestId('assign-read-only')).toBeVisible();
    await expect(page.getByTestId('assign-select')).toHaveCount(0);
    await expect(page.getByTestId('lead-assignment')).not.toContainText(GARDENS);
    // Direct addresses: a Gardens opportunity or visit is not found, exactly like an invented one.
    for (const path of [`/backoffice/crm/opportunity-360-workspace?record=${gardens.id}`, '/backoffice/crm/opportunity-360-workspace?record=opp_9999', `/backoffice/crm/visit-workspace?record=${gardensVisit.id}`]) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId('state-not-found'), path).toBeVisible();
      await expect(page.locator('main')).not.toContainText(GARDENS);
    }
    const hidden = await societyApi(page, `/opportunities/${gardens.id}`);
    expect(hidden).toEqual(await societyApi(page, '/opportunities/opp_9999'));
    expect(await societyApi(page, `/visits/${gardensVisit.id}`)).toEqual(await societyApi(page, '/visits/vst_9999'));
    expect(consoleErrors).toEqual([]);
  });

  test('unauthorized: no lead.view gets the planned page and 403; a salesperson cannot assign or convert; nothing changes', async ({ page, consoleErrors }) => {
    await start(page);
    const lead = (await api<{ items: Convertible[] }>(page, '/crm/convertible-leads')).items[0]!;
    await open(page, 'finance', '/backoffice/global/my-access', 'my-access-page');
    await page.goto(`${BO}${PIPELINE}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByTestId('pipeline-page')).toHaveCount(0);
    expect(await societyApi(page, '/opportunities')).toMatchObject({ ok: false, status: 403 });
    await become(page, 'sales');
    await page.goto(`${BO}${PIPELINE}`);
    const before = await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board' });
    expect(await societyApi(page, '/leads/assign', 'POST', { leadIds: [lead.id], assigneeId: BILAL, reason: 'Mine now' })).toMatchObject({ ok: false, status: 403 });
    expect(await societyApi(page, `/leads/${lead.id}/opportunities`, 'POST', {})).toMatchObject({ ok: false, status: 403 });
    expect(await societyApi(page, `/opportunities/${before.items[0]!.id}/stage`, 'POST', { stage: 'negotiation', version: before.items[0]!.version })).toMatchObject({ ok: false, status: 403 });
    expect(await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board' })).toEqual(before);
    expect(consoleErrors).toEqual([]);
  });

  test('cross-project assignment is refused like an unknown person; revoked or narrowed access hides records at once', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    const list = await api<{ items: Array<{ id: string; projectId: string; owner: { principalId: string } }> }>(page, '/crm/assignments', 'GET', {}, { project: 'prj_gardens' });
    const gardensLead = list.items[0]!;
    const toBilal = await societyApi(page, '/leads/assign', 'POST', { leadIds: [gardensLead.id], assigneeId: BILAL, reason: 'Cover' });
    const invented = await societyApi(page, '/leads/assign', 'POST', { leadIds: [gardensLead.id], assigneeId: 'usr_lsp_9999', reason: 'Cover' });
    expect(toBilal).toEqual({ ok: false, code: 'validation_failed', status: 422 });
    expect(invented).toEqual(toBilal);
    // In the drawer: Bilal is never offered for a Gardens lead.
    await page.goto(`${BO}/backoffice/crm/lead-assignment?lead=${gardensLead.id}`);
    await page.getByTestId('assign-assignee').getByRole('combobox').fill('Bilal');
    await expect(page.getByRole('option', { name: /Bilal Ahmed/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Narrowed: the sales manager's access limited to the Heights site.
    const all = await api<Board>(page, '/opportunities', 'GET', {}, { view: 'board' });
    const gardens = all.items.find((o) => o.projectId === 'prj_gardens')!;
    await page.goto(`${BO}/backoffice/crm/opportunity-360-workspace?record=${gardens.id}`);
    await expect(page.getByTestId('opportunity-360')).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ sales_manager: ['site_lk_heights'] })));
    await page.reload();
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    await page.goto(`${BO}${PIPELINE}`);
    await expect(page.getByTestId('opp-card').first()).toBeVisible();
    for (const c of await page.getByTestId('opp-card').all()) await expect(c).toHaveAttribute('data-project', 'prj_heights');
    await page.evaluate(() => sessionStorage.removeItem('demo:site-scope'));
    // Revoked by reassignment: Bilal loses the opportunity on the next request.
    const bilals = all.items.find((o) => o.owner.principalId === BILAL)!;
    await api(page, '/leads/assign', 'POST', { leadIds: [bilals.leadId], assigneeId: 'usr_lsp_0001', reason: 'Bilal on leave' });
    await open(page, 'sales', `/backoffice/crm/opportunity-360-workspace?record=${bilals.id}`, 'state-not-found');
    expect(consoleErrors).toEqual([]);
  });

  test('invalid visit changes are refused with the reason and change nothing', async ({ page, consoleErrors }) => {
    await start(page, 'sales');
    const cal = await api<{ items: Array<{ id: string; at: string; status: string }> }>(page, '/visits/calendar', 'GET', {}, { from: '2026-10-26', to: '2026-11-08' });
    const v = cal.items.find((x) => x.status === 'scheduled' || x.status === 'confirmed')!;
    await page.goto(`${BO}/backoffice/crm/visit-workspace?record=${v.id}`);
    await page.getByTestId('visit-reschedule').click();
    await page.getByTestId('reschedule-submit').click();
    await expect(page.getByTestId('reschedule-dialog')).toContainText('Choose a date and a time.');
    await page.locator('#reschedule-date').fill('2026-10-26');
    await choose(page, 'reschedule-time', '09:00');
    await page.getByTestId('reschedule-reason').fill('Customer asked');
    await page.getByTestId('reschedule-submit').click();
    await expect(page.getByTestId('reschedule-dialog').getByRole('alert')).toContainText('Choose a time later than now.');
    await page.keyboard.press('Escape');
    const after = await api<{ visit: { at: string; version: number } }>(page, `/visits/${v.id}`);
    expect(after.visit.at).toBe(v.at);
    expect(after.visit.version).toBe(1);
    expect(consoleErrors).toEqual([]);
  });
});

const SCREENS: Array<[string, string, string]> = [
  ['pipeline', PIPELINE, 'pipeline-page'],
  ['list', `${PIPELINE}?view=list`, 'pipeline-list'],
  ['assignment', '/backoffice/crm/lead-assignment', 'lead-assignment'],
  ['opportunity', '/backoffice/crm/opportunity-360-workspace?record=opp_0014', 'opportunity-360'],
  ['calendar', CALENDAR, 'calendar-results'],
  ['agenda', `${CALENDAR}?view=agenda`, 'calendar-results'],
  ['visit', '/backoffice/crm/visit-workspace?record=vst_001', 'visit-360'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  const lang = locale === 'ur-PK' ? 'ur' : 'en';
  test.describe(`Gate E.1 accessibility (${lang})`, () => {
    test(`every E.1 screen passes axe at 1440 and 390 with nothing clipped (${lang})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(360_000);
      await start(page, 'sales_manager', locale);
      if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.phone]) {
        await page.setViewportSize(viewport);
        for (const [name, path, ready] of SCREENS) {
          await page.goto(`${BO}${path}`);
          await expect(page.getByTestId(ready).first()).toBeVisible();
          await axe(page, testInfo, `e1-${name}-${viewport.width}-${lang}`);
          expect(await layoutProblems(page), `${name} ${viewport.width} ${lang}`).toEqual([]);
          expect(await overflowOf(page), `${name} ${viewport.width} ${lang} sideways scroll`).toBeLessThanOrEqual(0);
        }
      }
      // The dialogs and the drawer.
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.goto(`${BO}${PIPELINE}?drawer=convert`);
      await expect(page.getByTestId('convert-dialog')).toBeVisible();
      await axe(page, testInfo, `e1-convert-${lang}`);
      await page.goto(`${BO}/backoffice/crm/visit-workspace?record=vst_001`);
      await page.getByTestId('visit-record-outcome').click();
      await page.getByTestId('outcome-kind').getByRole('radio').first().check({ force: true });
      await axe(page, testInfo, `e1-outcome-${lang}`);
      expect(consoleErrors).toEqual([]);
    });

    test(`320 px at 200 % text: the pipeline, the calendar and the workspaces reflow (${lang})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 320, height: 700 });
      for (const p of PRINCIPALS) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}` });
      await start(page, 'sales_manager', locale);
      for (const [name, path, ready] of SCREENS) {
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        expect(await layoutProblems(page), `${name} 320 200 % ${lang}`).toEqual([]);
        expect(await overflowOf(page), `${name} 320 200 % ${lang} sideways scroll`).toBeLessThanOrEqual(0);
      }
      // Phones get one stage at a time and the agenda (lists, not tables).
      await page.goto(`${BO}${PIPELINE}`);
      await expect(page.getByTestId('pipeline-phone')).toBeVisible();
      await expect(page.getByTestId('pipeline-board')).toHaveCount(0);
      await page.goto(`${BO}${CALENDAR}`);
      await expect(page.getByTestId('calendar-agenda')).toBeVisible();
      await expect(page.getByTestId('calendar-month')).toHaveCount(0);
      await axe(page, testInfo, `e1-calendar-320-200-${lang}`);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test('dark mode with high contrast: the E.1 screens pass axe with nothing clipped', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(180_000);
  await start(page);
  await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  for (const [name, path, ready] of SCREENS) {
    await page.goto(`${BO}${path}`);
    await expect(page.getByTestId(ready).first()).toBeVisible();
    await axe(page, testInfo, `e1-${name}-dark`);
    expect(await layoutProblems(page), `${name} dark`).toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});
