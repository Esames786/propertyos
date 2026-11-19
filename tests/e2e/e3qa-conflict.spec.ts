import { expect, test } from '../support/fixtures';
import { businessState, call, seedPrincipal } from '../support/e3-pricing';
import { drawerSaved, drawerVersions, EDITORS, fillNew, openDrawer, openEditor, priceDrafts, propose, rows, type Row } from '../support/e3-editors';

/**
 * Gate E.3 local validation (Issue #33): concurrent edits and stale versions in the browser. Another session
 * of the same person revises a draft first (version 1 → 2) while this screen still shows version 1 with
 * unsaved edits. Saving here must be refused (409) with nothing written, and reopening the draft must show
 * the latest version, from which a revision becomes version 3.
 */

for (const e of EDITORS) {
  test(`${e.id}: a concurrent revision makes this form stale: 409, nothing written; reopening revises the latest`, async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
    await openEditor(page, e);
    await fillNew(page, e, `QA ${e.id} concurrent`);
    await page.getByTestId(e.save).click();
    await expect(e.saved(page)).toBeVisible();
    const [created] = await rows(page, e);
    // Another tab of the same person revises it first (version 1 → 2).
    const detail = await call<Row>(page, { method: 'GET', path: `${e.api}/${created!.id}` });
    expect(detail.ok).toBe(true);
    const latest = detail.ok ? detail.body.versions.at(-1)! : {};
    const other = await call(page, {
      method: 'POST', path: `${e.api}/${created!.id}/versions`, idempotencyKey: 'qa-other-tab-revision-0001',
      body: { expectedVersion: 1, title: `QA ${e.id} other tab`, ...Object.fromEntries(e.content.map((k) => [k, latest[k]])), idempotencyKey: 'qa-other-tab-revision-0001' },
    });
    expect(other.ok).toBe(true);
    // This form still shows version 1 and has unsaved edits.
    await e.title(page).fill(`QA ${e.id} this tab`);
    const before = await businessState(page);
    await page.getByTestId(e.save).click();
    await expect(page.getByTestId('state-error').first()).toBeVisible();
    await expect(e.saved(page)).toHaveCount(0);
    expect(await businessState(page)).toBe(before);
    expect((await rows(page, e))[0]?.currentVersion).toBe(2);
    // Reopening the draft shows the latest version; a revision from there is version 3.
    await e.listItems(page).first().click();
    await expect(e.title(page)).toHaveValue(`QA ${e.id} other tab`);
    await e.title(page).fill(`QA ${e.id} this tab again`);
    await page.getByTestId(e.save).click();
    await expect(e.saved(page)).toBeVisible();
    expect((await rows(page, e))[0]?.currentVersion).toBe(3);
    await expect(page.getByTestId(e.history).locator('li')).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });
}

test('INV-007: a concurrent revision makes this drawer stale: 409, nothing written; reopening revises the latest', async ({ page, consoleErrors }) => {
  await seedPrincipal(page, 'res_e3qa_pricing');
  await openDrawer(page);
  await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
  await page.getByTestId('price-change-save').click();
  await expect(drawerSaved(page)).toBeVisible();
  const [created] = await priceDrafts(page);
  const other = await call(page, {
    method: 'POST', path: `/price-change-drafts/${created!.id}/versions`, idempotencyKey: 'qa-other-tab-revision-0001',
    body: { expectedVersion: 1, proposedPrice: { amount: '17700000.00', currency: 'PKR' }, reason: 'Another tab revised this proposal first', idempotencyKey: 'qa-other-tab-revision-0001' },
  });
  expect(other.ok).toBe(true);
  await propose(page, '17800000.00', 'This tab still shows the first version');
  const before = await businessState(page);
  await page.getByTestId('price-change-save').click();
  await expect(page.getByTestId('state-error').first()).toBeVisible();
  await expect(drawerSaved(page)).toHaveCount(0);
  expect(await businessState(page)).toBe(before);
  await page.getByTestId('price-change-drafts').getByRole('button').first().click();
  await expect(page.getByTestId('price-change-proposed')).toHaveValue('17700000.00');
  await propose(page, '17900000.00', 'Revised again from the latest version');
  await page.getByTestId('price-change-save').click();
  await expect(drawerSaved(page)).toBeVisible();
  expect((await priceDrafts(page))[0]?.currentVersion).toBe(3);
  await expect(drawerVersions(page)).toHaveCount(3);
  expect(consoleErrors).toEqual([]);
});
