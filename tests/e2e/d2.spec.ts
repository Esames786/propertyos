import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate D.2 (resident operations) through both apps, with the people of the Al-Noor storyline: Kamran
 * (A-101) reports a repair, invites a guest and acknowledges a notice; Naveed (maintenance supervisor)
 * triages and assigns; the guard checks visitors in; Imran (building manager) publishes notices and
 * approves vehicles; Rabia (committee secretary) tests the sandbox gateway. The rules are the
 * server's (operations.api.test.ts); these tests check that the screens show them honestly.
 */
const api = societyApi;

async function office(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function portal(page: Page, path: string, ready: string) {
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await office(page, path, ready);
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await portal(page, path, ready);
}

/** A field's text box, whether the test id sits on the box itself or on its wrapper. */
const box = (scope: Page | Locator, testId: string) =>
  scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

/** Pick a flat in a flat search box (type its number, choose it). */
async function pickFlat(page: Page, scope: Page | Locator, testId: string, code: string) {
  await scope.getByTestId(testId).locator('input').fill(code);
  await page.getByRole('option', { name: new RegExp(code) }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

test.describe('D.2 reference 1: repair → triage → technician → resident confirmation', () => {
  test('Kamran reports a leak, Naveed assigns Bilal, the fix is recorded, Kamran confirms; SLA and confirmation agree', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_maintenance' });

    // Resident: report a repair in the flat, with a described photo.
    await resident(page, 'alnoor_resident_a101', '/customer/portal/maintenance-workspace', 'repairs-page');
    await axe(page, testInfo, 'repairs-1440-en');
    await page.getByTestId('repair-new').click();
    const sheet = page.getByTestId('repair-new-sheet');
    await box(sheet, 'repair-title').fill('Kitchen sink leaking');
    await box(sheet, 'repair-description').fill('Water drips from the trap under the kitchen sink since last night.');
    await sheet.getByTestId('repair-photos-sample').click();
    await box(sheet, 'repair-photos-alt-0').fill('Water under the kitchen sink');
    await axe(page, testInfo, 'repair-new-1440-en');
    await sheet.getByTestId('repair-submit').click();
    const detail = page.getByTestId('repair-detail');
    await expect(detail).toHaveAttribute('data-state', 'submitted');
    const ref = (await detail.locator('.ltr-ref').first().innerText()).trim();
    expect(ref).toMatch(/^ANR-MR-\d{4}$/);

    // Office: the request is new; triage it and assign the plumber with a visit.
    await as(page, 'alnoor_maintenance', '/backoffice/mnt/maintenance-list?status=open', 'request-row');
    await page.getByTestId('request-row').filter({ hasText: ref }).click();
    const ws = page.getByTestId('request-workspace');
    await expect(ws).toHaveAttribute('data-state', 'submitted');
    await axe(page, testInfo, 'request-360-1440-en');
    await page.getByTestId('action-triage').click();
    await page.getByTestId('triage-submit').click();
    await expect(page.getByTestId('triage-drawer')).toBeHidden();
    await expect(ws).toHaveAttribute('data-state', 'triaged');
    await page.getByTestId('action-assign').click();
    const assign = page.getByTestId('assign-drawer');
    await axe(page, testInfo, 'assign-drawer-1440-en');
    await assign.getByTestId('technician-option').filter({ hasText: 'Bilal' }).click();
    await assign.getByTestId('assign-submit').click();
    await expect(assign).toBeHidden();
    await expect(ws).toHaveAttribute('data-state', 'assigned');

    // The work is started and completed with a note and a described photo (office acting for Bilal,
    // a technician without a sign-in).
    await page.getByTestId('action-start').click();
    await expect(ws).toHaveAttribute('data-state', 'in_progress');
    await page.getByTestId('action-complete').click();
    const complete = page.getByTestId('complete-drawer');
    await box(complete, 'complete-note').fill('Replaced the trap washer; no leak after 30 minutes.');
    await complete.getByTestId('complete-photos-sample').click();
    await box(complete, 'complete-photos-alt-0').fill('Dry pipe under the sink after the repair');
    await complete.getByTestId('complete-submit').click();
    await expect(complete).toBeHidden();
    await expect(ws).toHaveAttribute('data-state', 'completed');

    // Resident: the bell says it is fixed; confirming closes it. The booked visit is no longer "coming".
    await become(page, 'customer', 'alnoor_resident_a101');
    await portal(page, '/customer/portal/home', 'dues-home');
    await expect(page.getByTestId('home-attention-repair')).toContainText('Kitchen sink leaking');
    await page.getByTestId('portal-bell').click();
    await page.getByTestId('notifications-panel').getByTestId('notification').filter({ hasText: ref }).first().click();
    await expect(page.getByTestId('repair-confirm')).toBeVisible();
    await expect(page.getByTestId('repair-visit-detail')).toHaveCount(0);
    await page.getByTestId('rating-5').click();
    await page.getByTestId('repair-confirm-yes').click();
    await expect(page.getByTestId('repair-detail')).toHaveAttribute('data-state', 'closed');

    // Office: closed by the resident, both clocks met; the confirmation list shows it.
    await as(page, 'alnoor_maintenance', `/backoffice/mnt/maintenance-list?q=${ref}`, 'request-row');
    await page.getByTestId('request-row').filter({ hasText: ref }).click();
    await expect(page.getByTestId('request-workspace')).toHaveAttribute('data-state', 'closed');
    await office(page, '/backoffice/mnt/resident-confirmation?tab=confirmed', 'confirmation-page');
    await expect(page.getByTestId('confirmation-page')).toContainText(ref);
    await office(page, '/backoffice/mnt/sla-dashboard', 'sla-dashboard');
    await axe(page, testInfo, 'sla-dashboard-1440-en');
    expect(consoleErrors).toEqual([]);
  });

  test('a technician sees only his own jobs; another flat cannot open Kamran’s repair', async ({ page, consoleErrors }) => {
    await seedSociety(page, { staff: 'alnoor_maintenance' });
    await office(page, '/backoffice/mnt/maintenance-dashboard', 'maintenance-dashboard');
    const all = await api<{ items: Array<{ id: string; technicianName?: string }> }>(page, '/ops/requests');
    expect(all.ok).toBe(true);
    const bilals = all.ok ? all.res.items.find((r) => r.technicianName === 'Bilal Khan') : undefined;

    await as(page, 'alnoor_technician', '/backoffice/mnt/technician-board', 'technician-board');
    await expect(page.getByTestId('technician-board')).not.toContainText('Bilal Khan');
    if (bilals) {
      await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${bilals.id}`);
      await expect(page.getByTestId('request-workspace')).toHaveCount(0);
    }

    // Kamran's earlier repair (A-101) is not visible to the tenant of A-102.
    await become(page, 'customer', 'alnoor_resident_a101');
    await portal(page, '/customer/portal/maintenance-workspace', 'repairs-page');
    const mine = await api<{ items: Array<{ id: string }> }>(page, '/portal/requests');
    const kamrans = mine.ok ? mine.res.items[0]?.id : undefined;
    expect(kamrans).toBeTruthy();
    await resident(page, 'alnoor_tenant_a102', `/customer/portal/maintenance-workspace?record=${kamrans}`, 'repair-not-found');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.2 reference 2: visitors and the gate', () => {
  test('Kamran invites a guest; the guard checks her in by code and out again; a wrong code is refused', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_guard' });
    await resident(page, 'alnoor_resident_a101', '/customer/portal/services-home?tab=visitors', 'visitors-tab');
    await page.getByTestId('invite-guest').click();
    const invite = page.getByTestId('invite-sheet');
    await box(invite, 'invite-name').fill('Hina Rauf');
    await box(invite, 'invite-plate').fill('LEB 2231');
    await axe(page, testInfo, 'invite-sheet-1440-en');
    await invite.getByTestId('invite-submit').click();
    const code = (await page.getByTestId('pass-code').innerText()).replace(/\D/g, '');
    expect(code).toMatch(/^\d{6}$/);

    await as(page, 'alnoor_guard', '/backoffice/vis/gate-check-in', 'gate-page');
    await axe(page, testInfo, 'gate-1440-en');
    await box(page, 'gate-code').fill('000000');
    await page.getByTestId('gate-check').click();
    await expect(page.getByTestId('check-result')).toHaveAttribute('data-ok', 'false');
    await box(page, 'gate-code').fill(code);
    await page.getByTestId('gate-check').click();
    await expect(page.getByTestId('check-result')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('check-result')).toContainText('Hina Rauf');
    const inside = page.getByTestId('inside-now');
    await expect(inside).toContainText('Hina Rauf');
    await inside.locator('li', { hasText: 'Hina Rauf' }).getByTestId('check-out').click();
    await expect(inside).not.toContainText('Hina Rauf');

    // The same single-entry code cannot be used again.
    await box(page, 'gate-code').fill(code);
    await page.getByTestId('gate-check').click();
    await expect(page.getByTestId('check-result')).toHaveAttribute('data-ok', 'false');
    expect(consoleErrors).toEqual([]);
  });

  test('a walk-in waits in the live queue until an occupant of the flat answers on the phone', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_guard' });
    await office(page, '/backoffice/vis/gate-check-in', 'walk-in');
    const walkIn = page.getByTestId('walk-in');
    await pickFlat(page, walkIn, 'walk-in-flat', 'A-101');
    await box(walkIn, 'walk-in-name').fill('Courier from TCS');
    await walkIn.getByTestId('walk-in-ask').click();
    await office(page, '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
    await expect(page.getByTestId('queue-request').filter({ hasText: 'Courier from TCS' })).toHaveAttribute('data-state', 'waiting');
    await expect(page.getByTestId('queue-refreshed')).toBeVisible();
    await axe(page, testInfo, 'live-queue-1440-en');

    // Kamran lives in A-101: the prompt reaches him on his phone.
    await page.setViewportSize(VIEWPORTS.phone);
    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    const prompt = page.getByRole('alertdialog');
    await expect(prompt).toContainText('Courier from TCS');
    await axe(page, testInfo, 'gate-prompt-390-en');
    await prompt.getByTestId('gate-approve').click();
    await expect(prompt).toBeHidden();

    await page.setViewportSize(VIEWPORTS.desktop);
    await as(page, 'alnoor_guard', '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
    const answered = page.getByTestId('answered-row').filter({ hasText: 'Courier from TCS' });
    await answered.getByTestId('queue-admit').click();
    await expect(answered.getByTestId('queue-admit')).toHaveCount(0);
    await office(page, '/backoffice/vis/gate-check-in', 'inside-now');
    await expect(page.getByTestId('inside-now')).toContainText('Courier from TCS');
    await office(page, '/backoffice/vis/visitor-dashboard', 'visitor-dashboard');
    await axe(page, testInfo, 'visitor-dashboard-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.2 reference 3: a notice that asks every household to acknowledge it', () => {
  test('Imran publishes, Kamran reads and acknowledges from the bell, the office sees who has not', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice/res/community-announcements', 'notices-office');
    await axe(page, testInfo, 'notices-office-1440-en');
    await page.getByTestId('notice-new').click();
    const compose = page.getByTestId('compose-drawer');
    await box(compose, 'compose-title').fill('Rooftop tank cleaning, Sunday 2 November');
    await box(compose, 'compose-body').fill('The overhead tanks of both blocks will be cleaned on Sunday from 08:00 to 12:00. Please store water on Saturday night.');
    await compose.getByTestId('compose-ack').click();
    await axe(page, testInfo, 'compose-drawer-1440-en');
    await compose.getByTestId('compose-publish').click();
    await expect(compose).toBeHidden();
    await expect(page.getByTestId('notice-row').filter({ hasText: 'Rooftop tank cleaning' })).toBeVisible();

    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    await expect(page.getByTestId('home-attention-notice').filter({ hasText: 'Rooftop tank cleaning' })).toBeVisible();
    await page.getByTestId('portal-bell').click();
    await page.getByTestId('notifications-panel').getByTestId('notification').filter({ hasText: 'Rooftop tank cleaning' }).first().click();
    await expect(page.getByTestId('notice-detail')).toContainText('overhead tanks');
    await axe(page, testInfo, 'notice-detail-1440-en');
    await page.getByTestId('notice-acknowledge').click();
    await expect(page.getByTestId('notice-acked')).toBeVisible();

    await as(page, 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office');
    await page.getByTestId('notice-row').filter({ hasText: 'Rooftop tank cleaning' }).click();
    const notice = page.getByTestId('notice-detail');
    await expect(notice.getByTestId('notice-stats')).toBeVisible();
    await expect(notice.getByTestId('unacknowledged')).not.toContainText('A-101');
    await axe(page, testInfo, 'notice-office-detail-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.2 office: vehicles and the sandbox gateway', () => {
  test('Imran approves a waiting vehicle into a free slot and turns another away with a reason', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice/park/vehicle-registry?status=pending', 'vehicles-page');
    await axe(page, testInfo, 'vehicles-1440-en');
    const waiting = page.getByTestId('vehicle-row').and(page.locator('[data-state="pending"]'));
    const count = await waiting.count();
    expect(count).toBeGreaterThan(0);
    await waiting.first().click();
    const drawer = page.getByTestId('vehicle-drawer');
    await expect(drawer.getByTestId('vehicle-checks')).toBeVisible();
    await axe(page, testInfo, 'vehicle-drawer-1440-en');
    const canApprove = (await drawer.getByTestId('vehicle-detail').getAttribute('data-can-approve')) === 'true';
    if (canApprove) {
      await drawer.getByTestId('vehicle-approve').click();
      await expect(drawer.getByTestId('vehicle-detail')).toHaveAttribute('data-state', 'approved');
    } else {
      await expect(drawer.getByTestId('vehicle-cannot')).toBeVisible();
      await box(drawer, 'vehicle-reject-reason').fill('The plate is already approved for another flat.');
      await drawer.getByTestId('vehicle-reject').click();
      await expect(drawer.getByTestId('vehicle-detail')).toHaveAttribute('data-state', 'rejected');
    }
    expect(consoleErrors).toEqual([]);
  });

  test('a verified sandbox event is accepted but never pays a bill; duplicates and tampered events are refused', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_admin' });
    await office(page, '/backoffice/sites/site_alnoor?tab=online-payments', 'gateway-tab');
    await expect(page.getByTestId('gateway-tab')).toHaveAttribute('data-mode', 'off');
    await axe(page, testInfo, 'gateway-1440-en');
    await page.getByTestId('gateway-mode').getByText('Sandbox (test)').click();
    await page.getByTestId('gateway-save').click();
    await expect(page.getByTestId('gateway-tab')).toHaveAttribute('data-mode', 'sandbox');

    const test1 = page.getByTestId('gateway-test');
    const send = async (flat: string, amount: string, signature: 'Valid' | 'Tampered', eventId: string) => {
      await pickFlat(page, test1, 'gateway-test-flat', flat);
      await box(test1, 'gateway-test-amount').fill(amount);
      await test1.getByTestId('gateway-test-signature').getByText(signature, { exact: true }).click();
      await box(test1, 'gateway-test-event-id').fill(eventId);
      await test1.getByTestId('gateway-test-send').click();
    };
    await send('A-101', '4200', 'Valid', 'evt_e2e_0001');
    await expect(page.getByTestId('gateway-event').first()).toHaveAttribute('data-result', 'accepted_not_settled');
    await send('A-101', '4200', 'Valid', 'evt_e2e_0001');
    await expect(page.getByTestId('gateway-event').first()).toHaveAttribute('data-result', 'refused_duplicate');
    await send('B-204', '3900', 'Tampered', 'evt_e2e_0002');
    await expect(page.getByTestId('gateway-event').first()).toHaveAttribute('data-result', 'refused_signature');

    // Nothing was paid: Kamran still owes the whole bill.
    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    await expect(page.getByTestId('dues-total')).toContainText('5,200.00');

    // The building manager has no online-payments tab.
    await as(page, 'alnoor_manager', '/backoffice/sites/site_alnoor?tab=online-payments', 'site-workspace');
    await expect(page.getByTestId('gateway-tab')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.2 office: residents, bookings, moves and Flat 360', () => {
  test('Imran decides a booking request and records that A-102’s tenant moved out; liability does not move with her', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice/res/resident-dashboard', 'residents-dashboard');
    await axe(page, testInfo, 'residents-dashboard-1440-en');
    const requested = page.getByTestId('booking-row').and(page.locator('[data-state="requested"]'));
    if ((await requested.count()) > 0) {
      const bookingRef = await requested.first().getAttribute('data-ref');
      await requested.first().getByTestId('booking-approve').click();
      await expect(page.locator(`[data-testid="booking-row"][data-ref="${bookingRef}"]`)).toHaveAttribute('data-state', 'approved');
    }

    // Flat 360 → Services → record a move-out for the tenant who also pays.
    await office(page, '/backoffice/sites/site_alnoor/units/unt_anr_a102?tab=services', 'flat-services');
    await axe(page, testInfo, 'flat-services-1440-en');
    await page.getByTestId('flat-move-out').click();
    const drawer = page.getByTestId('move-out-drawer');
    await expect(drawer.getByTestId('move-fixed-flat')).toContainText('A-102');
    await box(drawer, 'move-reason').fill('Lease ended; keys returned to the office.');
    await axe(page, testInfo, 'move-out-drawer-1440-en');
    await drawer.getByTestId('move-submit').click();
    await expect(drawer.getByTestId('move-result')).toHaveAttribute('data-still-liable', 'true');
    await expect(drawer.getByTestId('move-still-liable')).toBeVisible();
    await drawer.getByTestId('move-close').click();
    await expect(page.getByTestId('flat-services-moves')).toContainText('Sana Iqbal');

    // The maintenance supervisor sees the dashboard but cannot record moves or decide bookings.
    await as(page, 'alnoor_maintenance', '/backoffice/res/resident-dashboard', 'residents-dashboard');
    await expect(page.getByTestId('residents-move-out')).toHaveCount(0);
    await expect(page.getByTestId('booking-approve')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

/** Screens of the gate, in both languages and at three widths: no axe violations, no sideways scroll. */
const OFFICE_SCREENS: Array<[string, PersonaId, string, string]> = [
  ['maintenance-dashboard', 'alnoor_maintenance', '/backoffice/mnt/maintenance-dashboard', 'maintenance-dashboard'],
  ['requests', 'alnoor_maintenance', '/backoffice/mnt/maintenance-list', 'request-row'],
  ['technician-board', 'alnoor_maintenance', '/backoffice/mnt/technician-board', 'technician-board'],
  ['issues', 'alnoor_maintenance', '/backoffice/mnt/issues', 'issues-board'],
  ['visitor-dashboard', 'alnoor_guard', '/backoffice/vis/visitor-dashboard', 'visitor-dashboard'],
  ['gate', 'alnoor_guard', '/backoffice/vis/gate-check-in', 'gate-page'],
  ['notices', 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office'],
  ['vehicles', 'alnoor_manager', '/backoffice/park/vehicle-registry', 'vehicles-page'],
  ['gateway', 'alnoor_admin', '/backoffice/sites/site_alnoor?tab=online-payments', 'gateway-tab'],
  ['residents', 'alnoor_manager', '/backoffice/res/resident-dashboard', 'residents-dashboard'],
];
const RESIDENT_SCREENS: Array<[string, string, string]> = [
  ['home', '/customer/portal/home', 'dues-home'],
  ['repairs', '/customer/portal/maintenance-workspace', 'repairs-page'],
  ['services', '/customer/portal/services-home', 'services-hub'],
  ['issues', '/customer/portal/issues', 'issues-page'],
  ['notices', '/customer/portal/community-notices', 'notices-page'],
  ['parking', '/customer/portal/parking', 'parking-page'],
  ['vehicles', '/customer/portal/vehicles', 'vehicles-page'],
  ['amenities', '/customer/portal/amenities', 'amenities-page'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test.describe(`D.2 screens in ${locale}: axe at 1440, 768 and 390 px, no sideways scroll`, () => {
    test(`office screens (${locale})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(240_000);
      await seedSociety(page, { staff: 'alnoor_manager', locale });
      for (const [name, persona, path, ready] of OFFICE_SCREENS) {
        await become(page, 'backoffice', persona);
        for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
          await page.setViewportSize(size);
          await page.goto(`${BO}${path}`);
          await expect(page.getByTestId(ready).first()).toBeVisible();
          await axe(page, testInfo, `${name}-${vp}-${locale}`);
          expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
        }
      }
      expect(consoleErrors).toEqual([]);
    });

    test(`resident screens (${locale})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(240_000);
      await seedSociety(page, { locale });
      await become(page, 'customer', 'alnoor_resident_a101');
      for (const [name, path, ready] of RESIDENT_SCREENS) {
        for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
          await page.setViewportSize(size);
          await page.goto(`${CU}${path}`);
          await expect(page.getByTestId(ready).first()).toBeVisible();
          await axe(page, testInfo, `portal-${name}-${vp}-${locale}`);
          expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
        }
      }
      expect(consoleErrors).toEqual([]);
    });
  });
}

test('D.2 resident screens reflow at 320 px with 200 % text', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await seedSociety(page, { textScale: 2 });
  await become(page, 'customer', 'alnoor_resident_a101');
  await page.setViewportSize(VIEWPORTS.reflow);
  for (const [name, path, ready] of RESIDENT_SCREENS) {
    await page.goto(`${CU}${path}`);
    await expect(page.getByTestId(ready).first()).toBeVisible();
    expect(await overflowOf(page), name).toBeLessThanOrEqual(0);
  }
  expect(consoleErrors).toEqual([]);
});
