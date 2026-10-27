import type { Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Stage 1.5R Sales workspace: Sales home, lead list, lead workspace and the connected demo
 * journey (create → list → search → workspace → timeline → visit → unit hold → back with filters).
 */

const SALES = `${BO}/backoffice/crm/sales-home`;

async function createLead(page: Page, name: string, phone = '0300 7654321') {
  const drawer = page.getByTestId('new-lead-drawer');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('textbox', { name: /full name/i }).fill(name);
  await drawer.getByRole('textbox', { name: /mobile number/i }).fill(phone);
  await drawer.getByTestId('unit-picker-project').getByRole('button').click();
  await page.getByRole('option', { name: /Larkspur Heights/ }).click();
  await page.getByTestId('new-lead-submit').click();
  await expect(page.getByTestId('toast-success')).toContainText(new RegExp(`Lead LD-2026-\\d+ created for ${name}`));
  await expect(drawer).toBeHidden();
}

test.describe('Sales workspace (CRM-001/002/003)', () => {
  test('Sales home shows the day: figures, quick actions, follow-ups, visits, pipeline and recent leads', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(SALES);
    await waitForApp(page);
    await expect(page.locator('main h1')).toHaveText('Sales');
    await expect(page.getByTestId('crm-kpi-new')).toBeVisible();
    await expect(page.getByTestId('crm-quick-actions').getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('follow-up-card').first()).toBeVisible();
    await expect(page.getByTestId('visit-card').first()).toBeVisible();
    for (const stage of ['new', 'contacted', 'qualified', 'converted', 'closed']) await expect(page.getByTestId(`pipeline-${stage}`)).toBeVisible();
    await expect(page.getByTestId('lead-card')).toHaveCount(6);
    // Sales sees only Larkspur Heights (persona scope is enforced by the transport).
    await expect(page.locator('main')).not.toContainText('Larkspur Gardens');
    expect(consoleErrors).toEqual([]);
  });

  test('connected journey: a new lead appears in the list, search and its own timeline; call, visit and hold are recorded', async ({ page, consoleErrors }) => {
    test.setTimeout(90_000);
    await seed(page, { persona: 'manager' });
    await page.goto(SALES);
    await waitForApp(page);
    await page.getByTestId('crm-new-lead').click();
    await createLead(page, 'Zoya Demo');

    // 1. Sales home: on top of recent leads, marked New.
    const recent = page.getByTestId('lead-card').first();
    await expect(recent).toContainText('Zoya Demo');
    await expect(recent).toContainText('New');

    // 2. Lead list (+ URL search) and global search find it.
    await page.goto(`${BO}/backoffice/crm/leads-list?q=Zoya`);
    await expect(page.getByTestId('lead-card')).toHaveCount(1);
    await page.locator('[data-tour-id="command-search"]:visible').click();
    await page.keyboard.type('Zoya');
    await expect(page.getByTestId('command-palette')).toContainText('Zoya Demo');
    // First Escape clears the query, the second closes the palette.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toBeHidden();

    // 3. Workspace: created activity, then a simulated call is logged to the timeline.
    await page.getByTestId('lead-card').first().getByRole('link', { name: 'Zoya Demo' }).click();
    await expect(page.locator('main h1')).toHaveText('Zoya Demo');
    await expect(page.getByText('Created in this demo session')).toBeVisible();
    await page.getByTestId('lead-contact').getByRole('button', { name: 'Call Zoya Demo' }).click();
    await expect(page.getByTestId('contact-sheet')).toContainText('no call is placed');
    await page.getByRole('radio', { name: 'No answer' }).check({ force: true });
    await page.getByTestId('contact-log').click();
    await expect(page.getByTestId('toast-success')).toContainText('Call with Zoya Demo logged');
    await page.getByRole('tab', { name: 'Activity' }).click();
    const timeline = page.getByTestId('lead-timeline');
    await expect(timeline).toContainText('Called the customer: no answer');
    await expect(timeline).toContainText('Created the lead (Walk-in)');

    // 4. Note.
    await page.getByTestId('lead-note-input').fill('Wants a corner unit facing the park');
    await page.getByTestId('lead-note-save').click();
    await expect(timeline).toContainText('Wants a corner unit facing the park');

    // 5. Schedule a visit (drawer opens with this lead chosen) → Visits tab and timeline.
    await page.getByTestId('lead-schedule-visit').click();
    const visit = page.getByTestId('schedule-visit-drawer');
    await expect(visit.getByRole('combobox', { name: /Lead/ })).toHaveValue('Zoya Demo');
    await visit.getByRole('button', { name: /Calendar/ }).click();
    await page.locator('[role="gridcell"]:not([aria-disabled="true"]) [role="button"]:not([aria-disabled="true"])').last().click();
    await visit.getByTestId('schedule-visit-form').getByRole('button', { name: /Time/ }).click();
    await page.getByRole('option', { name: '11:00' }).click();
    await page.getByTestId('schedule-visit-submit').click();
    await expect(page.getByTestId('toast-success').last()).toContainText('Site visit booked for Zoya Demo');
    await expect(timeline).toContainText('Booked a site visit');
    await expect(page.getByTestId('lead-visit-count')).toContainText('1');

    // 6. Hold a matching unit for this lead (demo, 48 h) and see it in the timeline.
    await page.getByRole('tab', { name: 'Matching units' }).click();
    await page.getByTestId('matched-unit-open').first().click();
    const quick = page.getByTestId('unit-quick-view');
    await expect(quick).toBeVisible();
    await quick.getByRole('button', { name: /Hold for Zoya Demo/ }).click();
    await expect(page.getByTestId('toast-success').last()).toContainText(/held for Zoya Demo until/);
    await expect(quick.getByTestId('unit-release')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('lead list: stage, search and sort live in the URL and are restored when coming back from a lead', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/crm/leads-list`);
    await waitForApp(page);
    await page.getByTestId('leads-stage').getByText('Qualified').click();
    await expect(page).toHaveURL(/status=qualified/);
    // Wait for the filtered list itself (navigation renders as a transition), not just the URL.
    await expect(page.getByTestId('leads-stage').getByRole('radio', { name: /Qualified/ })).toBeChecked();
    await expect(page.getByTestId('leads-showing')).toContainText('of 23');
    const first = page.getByTestId('lead-card').first();
    const name = (await first.getByRole('heading').textContent())!.trim();
    await first.getByRole('link', { name }).click();
    await expect(page.locator('main h1')).toHaveText(name);
    await page.getByTestId('lead-back').click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/leads-list\?status=qualified/);
    await expect(page.getByTestId('leads-stage').getByRole('radio', { name: /Qualified/ })).toBeChecked();

    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId('leads-stage').getByRole('radio', { name: /Qualified/ })).toBeChecked();
    await page.getByTestId('leads-next').click();
    await expect(page).toHaveURL(/page=2/);
  });

  test('a follow-up can be completed from Sales home and leaves the list', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(SALES);
    const cards = page.getByTestId('follow-up-card');
    const name = (await cards.first().getByRole('heading').textContent())!.trim();
    await cards.first().getByTestId('follow-up-done').click();
    await expect(page.getByTestId('toast-success')).toContainText(`Follow-up with ${name} marked done`);
    await expect(page.getByTestId('live-polite')).toContainText('marked done');
    await expect(cards.first().getByRole('heading')).not.toHaveText(name);
  });

  test('pipeline stages and KPI cards open the filtered lead list', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(SALES);
    await page.getByTestId('pipeline-qualified').click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/leads-list\?status=qualified$/);
    await page.goBack();
    await page.getByTestId('crm-kpi-follow-ups').click();
    await expect(page).toHaveURL(/sort=followUp/);
  });

  test('practice lead (training) is shown only in practice mode, labelled, and never as a normal record', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/crm/leads-list?drawer=practice-lead`);
    const drawer = page.getByTestId('practice-lead-drawer');
    await drawer.getByRole('textbox', { name: /full name/i }).fill('Practice Person');
    await drawer.getByRole('textbox', { name: /mobile number/i }).fill('0300 1234567');
    await drawer.getByTestId('unit-picker-project').getByRole('button').click();
    await page.getByRole('option', { name: /Larkspur Heights/ }).click();
    await drawer.getByTestId('unit-picker-tower').getByRole('button').click();
    await page.getByRole('option', { name: /Tower A/ }).click();
    await drawer.getByTestId('unit-picker-floor').getByRole('button').click();
    await page.getByRole('option', { name: 'Floor 1', exact: true }).click();
    await drawer.getByTestId('unit-picker-unit').getByRole('button').click();
    await page.locator('[role="option"]:not([aria-disabled="true"])').first().click();
    await page.getByTestId('practice-lead-submit').click();
    await expect(page.getByTestId('lead-card').first()).toContainText('Practice Person');
    await expect(page.getByTestId('lead-card').first()).toContainText('Practice');
    const live = await page.evaluate(() => window.__prototype!.transport.liveMutations().length);
    expect(live).toBe(0);
  });

  test('phone: centre Quick create opens New lead and the lead lands on Sales home', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'sales' });
    await page.goto(SALES);
    await page.getByTestId('quick-create-fab').click();
    await page.getByTestId('quick-create-new-lead').click();
    await createLead(page, 'Phone Lead');
    await expect(page.getByTestId('lead-card').first()).toContainText('Phone Lead');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('Urdu: Sales home and the lead workspace are right-to-left with no missing keys', async ({ page }) => {
    await seed(page, { persona: 'sales', locale: 'ur-PK' });
    await page.goto(SALES);
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('main h1')).toHaveText('سیلز');
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033&tab=activity`);
    await expect(page.getByRole('tab', { name: 'سرگرمی' })).toHaveAttribute('aria-selected', 'true');
    const missing = await page.evaluate(() => window.__prototype!.missingKeys());
    expect(missing).toEqual([]);
  });

  test('Sales tour: offered on first visit, spotlights real widgets, and the guided step completes by creating a lead', async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { persona: 'sales', onboarding: 'offers' });
    await page.goto(SALES);
    const offer = page.getByTestId('module-offer');
    await expect(offer).toContainText('Sales');
    await offer.getByRole('button', { name: 'Take the tour' }).click();
    const card = page.getByTestId('tour-card');
    await expect(card).toHaveAttribute('data-step-id', 'intro');
    for (const id of ['kpis', 'followUps', 'pipeline', 'visits']) {
      await page.getByTestId('tour-next').click();
      await expect(card).toHaveAttribute('data-step-id', id);
      await expect(page.getByTestId('tour-spotlight')).toBeVisible();
    }
    await page.getByTestId('tour-next').click();
    await expect(card).toHaveAttribute('data-step-id', 'newLead');
    await page.locator('[data-tour-id="crm-new-lead"]').click();
    await createLead(page, 'Tour Lead');
    await expect(card).toHaveAttribute('data-step-id', 'recentLeads');
    await expect(page.getByTestId('lead-card').first()).toContainText('Tour Lead');
  });
});
