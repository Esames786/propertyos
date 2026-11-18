import type { Page } from '@playwright/test';
import { BO, expect, test } from '../support/fixtures';
import { becomePrincipal, businessState, call, seedPrincipal } from '../support/e3-pricing';
import { DRAWER, drawerVersions, EDITORS, fillNew, HEIGHTS_UNIT, label, main, openEditor, priceDrafts, propose, rows, type Editor } from '../support/e3-editors';

/**
 * Gate E.3 integration (Wave 2, Agent 2): contextual deep links to private drafts. The open draft is in the
 * address (`?record=<id>`; INV-007: `?record=<unit>&draft=<id>`): the link opens exactly that draft for its
 * creator, Back and Forward move between drafts without losing keyboard focus, revised and stale drafts stay
 * safe, and another creator, another project (scope or header), another organisation and an unknown id all
 * get the same not-found. With the test-only pricing principals (Playwright's build only).
 */

/** A valid create body per editor (its API), for drafts made without the UI. */
const BODY: Record<string, (title: string) => Record<string, unknown>> = {
  'COM-001': (title) => ({ projectId: 'prj_heights', title, allocations: [{ kind: 'down_payment', shareBps: 2000 }, { kind: 'instalments', shareBps: 8000, count: 4 }] }),
  'COM-003': (title) => ({ projectId: 'prj_heights', title, rules: [{ unitType: 'residential', baseRate: { amount: '12500.50', currency: 'PKR' }, floorRiseBps: 100, cornerPremiumBps: 0, parkFacingPremiumBps: 250 }] }),
  'COM-004': (title) => ({ projectId: 'prj_heights', title, fees: [{ code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: { amount: '1.00', currency: 'PKR' } }], discounts: [{ code: 'EARLY_DISC', label: 'Illustrative discount', rateBps: 2000, maxAmount: { amount: '30.00', currency: 'PKR' } }] }),
  'COM-005': (title) => ({ projectId: 'prj_heights', title, rules: [{ subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' }, requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false }] }),
};
let keys = 0;
const key = () => `qa-link-key-${String(++keys).padStart(6, '0')}-${Date.now()}`;

async function create(page: Page, e: Editor, title: string): Promise<string> {
  const k = key();
  const r = await call<{ id: string }>(page, { method: 'POST', path: e.api, idempotencyKey: k, body: { ...BODY[e.id]!(title), idempotencyKey: k } });
  expect(r.ok, `${e.id} create`).toBe(true);
  return r.ok ? r.body.id : '';
}
async function revise(page: Page, e: Editor, id: string, expectedVersion: number, title: string) {
  const k = key();
  const { projectId: _project, ...rest } = BODY[e.id]!(title);
  const r = await call(page, { method: 'POST', path: `${e.api}/${id}/versions`, idempotencyKey: k, body: { ...rest, expectedVersion, idempotencyKey: k } });
  expect(r.ok, `${e.id} revise`).toBe(true);
}
const editorText = async (page: Page) => (await main(page).innerText()).replace(/\s+/g, ' ');
const notFound = (page: Page) => page.getByTestId('state-not-found');

for (const e of EDITORS) {
  test.describe(`${e.id} deep links`, () => {
    test(`${e.id}: a saved draft takes its place in the address; the link reopens it after a reload, focus on the confirmation`, async ({ page, consoleErrors }) => {
      await seedPrincipal(page, 'res_e3qa_pricing');
      await openEditor(page, e);
      await fillNew(page, e, 'QA linked draft');
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      await expect(e.saved(page)).toBeFocused();
      const id = (await rows(page, e))[0]!.id;
      await expect(page).toHaveURL(new RegExp(`${e.path}\\?record=${id}$`));
      // The page stayed mounted (no shell placeholder): the confirmation keeps focus after the address changed.
      await expect(e.saved(page)).toBeFocused();
      await page.reload();
      await expect(e.title(page)).toHaveValue('QA linked draft');
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(1);
      await expect(e.listItems(page).filter({ hasText: 'QA linked draft' })).toHaveAttribute('aria-current', 'true');
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: Back and Forward move between drafts opened from the list; focus stays on the list; Back reaches the blank form`, async ({ page, consoleErrors }) => {
      await seedPrincipal(page, 'res_e3qa_pricing');
      await openEditor(page, e);
      const a = await create(page, e, 'QA link A');
      const b = await create(page, e, 'QA link B');
      await page.reload();
      await e.listItems(page).filter({ hasText: 'QA link A' }).click();
      await expect(page).toHaveURL(new RegExp(`record=${a}$`));
      await expect(e.title(page)).toHaveValue('QA link A');
      const itemB = e.listItems(page).filter({ hasText: 'QA link B' });
      await itemB.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`record=${b}$`));
      await expect(e.title(page)).toHaveValue('QA link B');
      await expect(itemB).toBeFocused();
      await expect(itemB).toHaveAttribute('aria-current', 'true');
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`record=${a}$`));
      await expect(e.title(page)).toHaveValue('QA link A');
      await expect(e.listItems(page).filter({ hasText: 'QA link A' })).toHaveAttribute('aria-current', 'true');
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${e.path}$`));
      await expect(e.title(page)).toHaveValue('');
      await expect(e.listItems(page).and(page.locator('[aria-current="true"]'))).toHaveCount(0);
      await page.goForward();
      await expect(e.title(page)).toHaveValue('QA link A');
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: another creator, another project (header or scope), another organisation and an unknown id get one not-found; nothing is written`, async ({ page, consoleErrors }) => {
      await seedPrincipal(page, 'res_e3qa_pricing');
      await openEditor(page, e);
      const id = await create(page, e, 'QA private draft');
      const unknown = id.replace(/\d+$/, '999999');
      const visits: Array<[Parameters<typeof becomePrincipal>[1], string]> = [
        ['res_e3qa_pricing_peer', 'all'], ['res_e3qa_pricing', 'prj_gardens'], ['res_e3qa_pricing_heights', 'all'], ['res_e3qa_cb_pricing', 'all'],
      ];
      for (const [who, project] of visits) {
        await becomePrincipal(page, who, project);
        await page.goto(`${BO}${e.path}?record=${id}`);
        await expect(notFound(page), `${who} @ ${project}`).toBeVisible();
        await expect(e.title(page)).toHaveCount(0);
        await expect(page.getByTestId(e.history)).toHaveCount(0);
        const before = await businessState(page);
        const hidden = await editorText(page);
        await page.goto(`${BO}${e.path}?record=${unknown}`);
        await expect(notFound(page)).toBeVisible();
        expect(await editorText(page), `${who} @ ${project}: hidden = unknown`).toBe(hidden);
        expect(await businessState(page)).toBe(before);
      }
      // The creator, with the header on all projects, still opens it.
      await becomePrincipal(page, 'res_e3qa_pricing', 'all');
      await page.goto(`${BO}${e.path}?record=${id}`);
      await expect(e.title(page)).toHaveValue('QA private draft');
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: a link to a draft revised elsewhere opens the latest version; a stale form is refused (409, nothing written) and the link then revises the latest`, async ({ page, consoleErrors }) => {
      await seedPrincipal(page, 'res_e3qa_pricing');
      await openEditor(page, e);
      const id = await create(page, e, 'QA stale link v1');
      await revise(page, e, id, 1, 'QA stale link v2');
      await page.goto(`${BO}${e.path}?record=${id}`);
      await expect(e.title(page)).toHaveValue('QA stale link v2');
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(2);
      // Another tab revises while this form is open.
      await revise(page, e, id, 2, 'QA stale link v3 elsewhere');
      await e.title(page).fill('QA stale link edited here');
      const before = await businessState(page);
      await page.getByTestId(e.save).click();
      await expect(main(page).getByTestId('state-error')).toBeVisible();
      expect(await businessState(page)).toBe(before);
      await page.reload();
      await expect(e.title(page)).toHaveValue('QA stale link v3 elsewhere');
      await e.title(page).fill('QA stale link v4');
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`record=${id}$`));
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(4);
      expect((await rows(page, e)).find((r) => r.id === id)?.currentVersion).toBe(4);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('INV-007 and INV-006 links', () => {
  test('INV-007: a draft link opens that draft in its unit\'s drawer; Back returns to the previous one; hidden, unknown and other-unit drafts get one not-found', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await page.goto(DRAWER);
    await expect(page.getByTestId('price-change-save')).toBeVisible();
    await propose(page, '17500000.25', 'Illustrative proposal one for QA only');
    await page.getByTestId('price-change-save').click();
    await expect(page.getByTestId('price-change-saved')).toBeVisible();
    const first = (await priceDrafts(page))[0]!.id;
    await expect(page).toHaveURL(new RegExp(`record=${HEIGHTS_UNIT}&draft=${first}$`));
    await expect(page.getByTestId('price-change-saved')).toBeFocused();
    await page.reload();
    await expect(page.getByTestId('price-change-proposed')).toHaveValue('17500000.25');
    await expect(drawerVersions(page)).toHaveCount(1);
    // A second proposal, then Back to the first.
    await page.getByTestId('edit-price-change-drawer').getByRole('button', { name: label('priceChangeNew') }).click();
    await propose(page, '17600000.50', 'Illustrative proposal two for QA only');
    await page.getByTestId('price-change-save').click();
    await expect(page.getByTestId('price-change-saved')).toBeVisible();
    const second = (await priceDrafts(page)).find((d) => d.id !== first)!.id;
    await expect(page).toHaveURL(new RegExp(`draft=${second}$`));
    await page.getByTestId('price-change-drafts').getByRole('button').first().click();
    await expect(page).toHaveURL(new RegExp(`draft=${first}$`));
    await expect(page.getByTestId('price-change-proposed')).toHaveValue('17500000.25');
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`draft=${second}$`));
    await expect(page.getByTestId('price-change-proposed')).toHaveValue('17600000.50');
    // One not-found: another creator, an unknown id, a draft of another unit.
    const answers: string[] = [];
    for (const [who, address] of [
      ['res_e3qa_pricing_peer', `${DRAWER}&draft=${first}`],
      ['res_e3qa_pricing_peer', `${DRAWER}&draft=pcd_999999`],
      ['res_e3qa_pricing', `${BO}/backoffice/inv/edit-price-drawer?record=unt_lh_a_0102&draft=${first}`],
      ['res_e3qa_pricing', `${DRAWER}&draft=pcd_999999`],
    ] as const) {
      await becomePrincipal(page, who);
      await page.goto(address);
      const drawer = page.getByTestId('edit-price-change-drawer');
      await expect(drawer.getByTestId('state-not-found'), address).toBeVisible();
      await expect(page.getByTestId('price-change-proposed')).toHaveCount(0);
      await expect(page.getByTestId('price-change-versions')).toHaveCount(0);
      await expect(page.getByTestId('price-change-save')).toBeDisabled();
      answers.push(await drawer.getByTestId('state-not-found').innerText());
    }
    expect(new Set(answers).size).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test('unit links go to E.2\'s unit quick view (INV-002) from INV-006 and the INV-007 drawer', async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await page.goto(`${BO}/backoffice/inv/unit-price-history?record=${HEIGHTS_UNIT}`);
    const fromHistory = page.getByTestId('price-history-open-unit');
    await expect(fromHistory).toHaveAttribute('href', `/backoffice/inv/unit-quick-view?record=${HEIGHTS_UNIT}`);
    await page.goto(DRAWER);
    await expect(page.getByTestId('price-change-open-unit')).toHaveAttribute('href', `/backoffice/inv/unit-quick-view?record=${HEIGHTS_UNIT}`);
    await page.getByTestId('price-change-open-unit').click();
    await expect(page).toHaveURL(new RegExp(`/inv/unit-quick-view\\?record=${HEIGHTS_UNIT}$`));
    await expect(page.getByTestId('access-outcome')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
