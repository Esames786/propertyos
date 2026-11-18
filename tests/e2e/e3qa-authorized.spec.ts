import type { Page } from '@playwright/test';
import { BO, expect, test } from '../support/fixtures';
import { becomePrincipal, businessState, call, failGets, installFaults, pricingSection, seedPrincipal } from '../support/e3-pricing';
import { DRAWER, drawerSaved, fillNew, HEIGHTS_UNIT, openDrawer, openEditor, EDITORS, propose, unitPrice } from '../support/e3-editors';

/**
 * Gate E.3 local validation (Issue #33, Wave 2 Agent 2): access, isolation and inertness in the browser,
 * with the **test-only** pricing principals (pricing.manage + unit.view, unlisted, no role, present only in
 * Playwright's build). Ordinary demo roles still have no pricing.manage (owner decisions E-07 / E-30 open).
 * Every refusal is followed by a byte-for-byte comparison of the tenant's business state (identity section
 * excepted: the session gate records sign-ins there).
 */

const COM_SCREENS = [
  ['COM-001', '/backoffice/com/payment-plan-templates', 'payment-plan-templates-page'],
  ['COM-002', '/backoffice/com/payment-plan-builder', 'payment-plan-builder-page'],
  ['COM-003', '/backoffice/com/pricing-policies', 'pricing-policies-page'],
  ['COM-004', '/backoffice/com/fees-and-discounts', 'fees-discounts-page'],
  ['COM-005', '/backoffice/com/approval-rules', 'pricing-approval-rules-page'],
] as const;
const TEMPLATES = `${BO}/backoffice/com/payment-plan-templates`;

/** Every draft family's create endpoint with a valid body, for direct API probes. */
const CREATES = [
  ['/pricing/plan-templates', { projectId: 'prj_heights', title: 'QA probe', allocations: [{ kind: 'down_payment', shareBps: 10000 }] }],
  ['/pricing/policies', { projectId: 'prj_heights', title: 'QA probe', rules: [{ unitType: 'residential', baseRate: { amount: '1.00', currency: 'PKR' }, floorRiseBps: 0, cornerPremiumBps: 0, parkFacingPremiumBps: 0 }] }],
  ['/pricing/commercial-rules', { projectId: 'prj_heights', title: 'QA probe', fees: [{ code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: { amount: '1.00', currency: 'PKR' } }], discounts: [] }],
  ['/pricing/approval-rules', { projectId: 'prj_heights', title: 'QA probe', rules: [{ subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' }, requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false }] }],
  [`/units/${HEIGHTS_UNIT}/price-change-drafts`, { proposedPrice: { amount: '1.00', currency: 'PKR' }, reason: 'Illustrative QA probe only' }],
] as const;

async function createTemplate(page: Page, title: string) {
  await openEditor(page, EDITORS[0]!);
  await fillNew(page, EDITORS[0]!, title);
  await page.getByTestId('template-save').click();
  await expect(page.getByTestId('template-saved')).toBeVisible();
  return (await pricingSection<{ templates: Array<{ id: string }> }>(page, 'developer.pricing.templates'))?.templates[0]?.id ?? '';
}

test.describe('E.3 test-only pricing principal: access, isolation, inertness', () => {
  test('the test principals are never offered on the demo sign-in page, even in the test build', async ({ page, consoleErrors }) => {
    await page.goto(`${BO}/backoffice/sign-in`);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/E3 QA/)).toHaveCount(0);
    expect(await page.content()).not.toContain('res_e3qa');
    expect(consoleErrors).toEqual([]);
  });

  test('all five draft families refuse a header key that differs from the body key (422), writing nothing', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await openEditor(page, EDITORS[0]!);
    for (const [path, body] of CREATES) {
      const before = await businessState(page);
      const r = await call(page, { method: 'POST', path, idempotencyKey: 'qa-header-key-0000001', body: { ...body, idempotencyKey: 'qa-body-key-00000002' } });
      expect(r, path).toEqual({ ok: false, problem: { status: 422, code: 'validation_failed', changed: false } });
      expect(await businessState(page), path).toBe(before);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('COM-001: a draft is private to its creator, its project and its tenant (no id oracle)', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    const id = await createTemplate(page, 'QA private plan');
    expect(id).toMatch(/^pt_/);
    for (const [who, project] of [['res_e3qa_pricing_peer', 'all'], ['res_e3qa_pricing', 'prj_gardens'], ['res_e3qa_cb_pricing', 'all']] as const) {
      await becomePrincipal(page, who, project);
      await page.goto(TEMPLATES);
      await expect(page.getByTestId('payment-plan-templates-page')).toBeVisible();
      await expect(page.getByTestId('template-list-item')).toHaveCount(0);
      const before = await businessState(page);
      const own = await call(page, { method: 'GET', path: `/pricing/plan-templates/${id}` });
      const unknown = await call(page, { method: 'GET', path: '/pricing/plan-templates/pt_999999' });
      expect(own, `${who} @ ${project}`).toEqual(unknown);
      expect(own).toMatchObject({ ok: false, problem: { status: 404, code: 'not_found', changed: false } });
      const list = await call<{ total: number }>(page, { method: 'GET', path: '/pricing/plan-templates' });
      expect(list).toMatchObject({ ok: true, body: { total: 0 } });
      expect(await businessState(page)).toBe(before);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('INV-007: another tenant cannot open a Larkspur unit drawer; it looks exactly like a unit that does not exist', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await openDrawer(page);
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    await becomePrincipal(page, 'res_e3qa_cb_pricing');
    await page.goto(DRAWER);
    const outcome = page.getByTestId('access-outcome');
    await expect(outcome).toHaveAttribute('data-reason', 'out_of_scope');
    const larkspurUnit = await page.getByRole('main').innerText();
    await page.goto(`${BO}/backoffice/inv/edit-price-drawer?record=unt_never_issued_e3qa`);
    await expect(outcome).toHaveAttribute('data-reason', 'out_of_scope');
    expect(await page.getByRole('main').innerText()).toBe(larkspurUnit);
    const before = await businessState(page);
    const own = await call(page, { method: 'GET', path: `/units/${HEIGHTS_UNIT}/price-change-drafts` });
    const unknown = await call(page, { method: 'GET', path: '/units/unt_never_issued_e3qa/price-change-drafts' });
    expect(own).toEqual(unknown);
    expect(own).toMatchObject({ ok: false, problem: { status: 404, changed: false } });
    expect(await call(page, { method: 'GET', path: '/price-change-drafts/pcd_000001' })).toEqual(await call(page, { method: 'GET', path: '/price-change-drafts/pcd_999999' }));
    expect(await businessState(page)).toBe(before);
    expect(consoleErrors).toEqual([]);
  });

  test('revoking pricing.manage hides every pricing draft at once: COM screens give the access outcome, INV-007 offers no save, the API refuses, nothing is written', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await createTemplate(page, 'QA revoked plan');
    await becomePrincipal(page, 'res_e3qa_pricing_revoked');
    for (const [id, path, testId] of COM_SCREENS) {
      await page.goto(`${BO}${path}`);
      // Wave 2 integration: DevScreen `refusal="outcome"` (as E.2/E.7/E.13): the access outcome says why, shows no data.
      const outcome = page.getByTestId('access-outcome');
      await expect(outcome, id).toHaveAttribute('data-reason', 'permission_missing');
      await expect(outcome, id).toHaveAttribute('data-module', 'inventory');
      await expect(page.getByTestId('planned-screen'), id).toHaveCount(0);
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
    await page.goto(DRAWER);
    await expect(page.getByTestId('edit-price-change-drawer')).toBeVisible();
    await expect(page.getByTestId('price-change-no-pricing-permission')).toHaveAttribute('data-reason', 'permission_missing');
    await expect(page.getByTestId('price-change-save')).toHaveCount(0);
    const before = await businessState(page);
    for (const path of ['/pricing/plan-templates', '/pricing/plan-templates/pt_000001', '/pricing/template-projects', `/units/${HEIGHTS_UNIT}/price-change-drafts`]) {
      expect(await call(page, { method: 'GET', path }), path).toMatchObject({ ok: false, problem: { status: 403, changed: false } });
    }
    for (const [path, body] of CREATES) {
      expect(await call(page, { method: 'POST', path, idempotencyKey: 'qa-revoked-key-000001', body: { ...body, idempotencyKey: 'qa-revoked-key-000001' } }), path).toMatchObject({ ok: false, problem: { status: 403, changed: false } });
    }
    expect(await businessState(page)).toBe(before);
    expect(consoleErrors).toEqual([]);
  });

  test('narrowing the creator to the Gardens site mid-session (demo switch) hides Heights drafts and units at once, like ids that do not exist', async ({ page, consoleErrors }) => {
    // The inventory module itself cannot be withdrawn by the demo switch (add-ons only); module withdrawal
    // is covered in e3qa-flows.api.test.ts. The site-scope switch narrows this same person, mid-session.
    await seedPrincipal(page, 'res_e3qa_pricing');
    const id = await createTemplate(page, 'QA site scope plan');
    await openDrawer(page);
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ res_e3qa_pricing: ['site_lk_gardens'] })));
    await page.goto(TEMPLATES);
    await expect(page.getByTestId('payment-plan-templates-page')).toBeVisible();
    await expect(page.getByTestId('template-list-item')).toHaveCount(0);
    await expect(page.getByTestId('template-project').locator('option', { hasText: 'Larkspur Heights' })).toHaveCount(0);
    await page.goto(DRAWER);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', /out_of_scope|site/);
    const before = await businessState(page);
    expect(await call(page, { method: 'GET', path: `/pricing/plan-templates/${id}` })).toEqual(await call(page, { method: 'GET', path: '/pricing/plan-templates/pt_999999' }));
    expect(await call(page, { method: 'GET', path: '/price-change-drafts/pcd_000001' })).toEqual(await call(page, { method: 'GET', path: '/price-change-drafts/pcd_999999' }));
    expect(await call(page, { method: 'GET', path: `/units/${HEIGHTS_UNIT}/price-change-drafts` })).toEqual(await call(page, { method: 'GET', path: '/units/unt_never_issued_e3qa/price-change-drafts' }));
    const write = await call(page, { method: 'POST', path: `/pricing/plan-templates/${id}/versions`, idempotencyKey: 'qa-site-scope-key-0001', body: { expectedVersion: 1, title: 'QA narrowed', allocations: [{ kind: 'down_payment', shareBps: 10000 }], idempotencyKey: 'qa-site-scope-key-0001' } });
    expect(write).toMatchObject({ ok: false, problem: { status: 404, changed: false } });
    expect(await businessState(page)).toBe(before);
    expect(consoleErrors).toEqual([]);
  });

  test('COM-002: the builder shows exactly the server preview, money-exact, and writes nothing', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await page.goto(`${BO}/backoffice/com/payment-plan-builder`);
    await expect(page.getByTestId('payment-plan-builder-page')).toBeVisible();
    await page.getByTestId('plan-unit-picker').getByRole('button').click();
    await page.getByRole('option', { name: /LH-A-0101/ }).click();
    await expect(page.getByTestId('plan-unit-price')).toContainText('LH-A-0101');
    const before = await businessState(page);
    const price = await unitPrice(page);
    await page.getByTestId('plan-preview-submit').click();
    await expect(page.getByTestId('plan-preview-lines').locator('li')).toHaveCount(13);
    const server = await call<{ lines: Array<{ amount: { amount: string } }>; totalAllocated: { amount: string }; totalPrice: { amount: string }; difference: { amount: string }; postingAllowed: boolean; policyStatus: string }>(page, {
      method: 'POST', path: '/pricing/plan-preview', body: { unitId: HEIGHTS_UNIT, allocations: [{ kind: 'down_payment', shareBps: 1000 }, { kind: 'instalments', shareBps: 9000, count: 12 }] },
    });
    expect(server.ok).toBe(true);
    if (server.ok) {
      expect(server.body).toMatchObject({ postingAllowed: false, policyStatus: 'not_approved' });
      expect(server.body.totalAllocated.amount).toBe(server.body.totalPrice.amount);
      expect(server.body.difference.amount).toBe('0.00');
      const shown = await page.getByTestId('plan-preview-lines').locator('li strong').allInnerTexts();
      const digits = (s: string) => s.replace(/[^\d.]/g, '');
      expect(shown.map(digits)).toEqual(server.body.lines.map((l) => l.amount.amount));
    }
    expect(await businessState(page)).toBe(before);
    expect(await unitPrice(page)).toBe(price);
    expect(consoleErrors).toEqual([]);
  });

  test('INV-006 and INV-007: an outage reading the unit price is not shown as "not in your scope"; a 404 is', async ({ page, consoleErrors }) => {
    const SCOPE = 'This unit is not available in your current scope.';
    await seedPrincipal(page, 'res_e3qa_pricing');
    for (const [path, option, scope] of [
      ['/backoffice/inv/unit-price-history', 'price-unit-option', page.getByTestId('unit-price-history-page')],
      ['/backoffice/inv/edit-price-drawer', 'price-change-unit', page.getByTestId('edit-price-change-drawer')],
    ] as const) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(option).first()).toBeVisible();
      await installFaults(page);
      await failGets(page, `^/units/${HEIGHTS_UNIT}/prices$`);
      await page.getByTestId(option).filter({ hasText: 'LH-A-0101' }).click();
      await expect(scope.getByTestId('state-error')).toBeVisible();
      await expect(scope.getByTestId('state-error'), `${path}: 503`).not.toContainText(SCOPE);
      await failGets(page, `^/units/${HEIGHTS_UNIT}/prices$`, 404);
      await scope.getByRole('button', { name: 'Try again' }).click();
      await expect(scope.getByText(SCOPE), `${path}: 404`).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('INV-006: drafts never appear as price history; the baseline stays the fictional seed with no approved changes', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await openDrawer(page);
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    await page.getByTestId('price-change-drawer-history-link').or(page.getByRole('link', { name: 'View price baseline and approved history' })).first().click();
    await expect(page).toHaveURL(new RegExp(`/inv/unit-price-history\\?record=${HEIGHTS_UNIT}`));
    await expect(page.getByTestId('price-baseline')).toContainText('Fictional seed baseline');
    await expect(page.getByTestId('unit-price-history-page')).toContainText('No approved price changes');
    await expect(page.getByTestId('unit-price-history-page')).not.toContainText('17,500,000.25');
    const history = await call<{ revisions: unknown[]; canEdit: boolean; recordState: string }>(page, { method: 'GET', path: `/units/${HEIGHTS_UNIT}/prices` });
    expect(history).toMatchObject({ ok: true, body: { revisions: [], canEdit: false, recordState: 'baseline_only' } });
    expect(consoleErrors).toEqual([]);
  });
});
