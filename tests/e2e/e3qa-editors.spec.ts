import type { Page } from '@playwright/test';
import { BO, expect, test } from '../support/fixtures';
import { failGets, installFaults, loseNextPost, seedPrincipal, sentRequests } from '../support/e3-pricing';
import { drawerSaved, drawerVersions, EDITORS, fillNew, HEIGHTS_UNIT, openDrawer, openEditor, priceDrafts, propose, retryEveryRead, rows, unitPrice } from '../support/e3-editors';

/**
 * The writes the editors send. Wave 2 integration: an opened draft is in the address (`?record=`), so the shell also
 * posts it as a recent record (E.13 `/workspace/recents`, refused for a pricing draft and never a draft write).
 */
const draftPosts = async (page: Page) => (await sentRequests(page)).filter((r) => r.method === 'POST' && r.path !== '/workspace/recents');

/**
 * Gate E.3 local validation (Issue #33): the four COM draft editors and the INV-007 drawer, driven through
 * their real screens by the test-only pricing principal (`res_e3qa_pricing`, Playwright build only). For
 * each: create then revise; a lost response retried with the same key; reads failing after a successful
 * save (the saved state holds and nothing can send a duplicate under a fresh key); the draft never touches
 * the unit's listed price or price history. Concurrent edits (409) are in e3qa-conflict.spec.ts.
 */

for (const e of EDITORS) {
  test.describe(`${e.id} with the test-only pricing principal`, () => {
    test.beforeEach(async ({ page }) => {
      await seedPrincipal(page, 'res_e3qa_pricing');
    });

    test(`${e.id}: create, then revise; drafts stay inert and the unit price is unchanged`, async ({ page, consoleErrors }) => {
      await openEditor(page, e);
      const price = await unitPrice(page);
      await fillNew(page, e, `QA ${e.id} draft`);
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      await expect(e.listItems(page)).toHaveCount(1);
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(1);
      await e.title(page).fill(`QA ${e.id} draft, revised`);
      await expect(e.saved(page)).toHaveCount(0);
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(2);
      await expect(e.listItems(page)).toHaveCount(1);
      const [row] = await rows(page, e);
      expect(row?.currentVersion).toBe(2);
      expect(row?.state).toBe('draft');
      for (const flag of ['effective', 'approvalAllowed', 'postingAllowed'] as const) if (row && flag in row) expect(row[flag], flag).toBe(false);
      expect(await unitPrice(page)).toBe(price);
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: a lost create response retried with Save sends the same key and makes one draft`, async ({ page, consoleErrors }) => {
      await openEditor(page, e);
      await installFaults(page);
      await fillNew(page, e, `QA ${e.id} lost`);
      await loseNextPost(page, `^${e.api}$`);
      await page.getByTestId(e.save).click();
      await expect(page.getByTestId('state-offline').first()).toBeVisible();
      await expect(e.saved(page)).toHaveCount(0);
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      const posts = (await draftPosts(page));
      expect(posts.map((r) => r.outcome)).toEqual(['applied-but-lost', 'ok']);
      expect(posts[1]!.header).toBe(posts[0]!.header);
      expect(posts.every((r) => r.body === r.header)).toBe(true);
      expect(await rows(page, e)).toHaveLength(1);
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: a lost revision response retried with Save makes one new version`, async ({ page, consoleErrors }) => {
      await openEditor(page, e);
      await fillNew(page, e, `QA ${e.id} revise lost`);
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      await installFaults(page);
      await e.title(page).fill(`QA ${e.id} revise lost v2`);
      await loseNextPost(page, `^${e.api}/[\\w-]+/versions$`);
      await page.getByTestId(e.save).click();
      await expect(page.getByTestId('state-offline').first()).toBeVisible();
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      const posts = (await draftPosts(page));
      expect(posts.map((r) => r.outcome)).toEqual(['applied-but-lost', 'ok']);
      expect(posts[1]!.header).toBe(posts[0]!.header);
      const [row] = await rows(page, e);
      expect(row?.currentVersion).toBe(2);
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(2);
      expect(consoleErrors).toEqual([]);
    });

    test(`${e.id}: reads failing after a successful save keep it saved; no second draft with a fresh key`, async ({ page, consoleErrors }) => {
      await openEditor(page, e);
      await installFaults(page);
      await fillNew(page, e, `QA ${e.id} refresh fails`);
      // Every pricing read fails from here on: the list, the selected draft and the project choices.
      await failGets(page, '^/pricing/');
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      // While the reads fail, the confirmation holds and pressing Save again (where the form still offers it:
      // COM-004 keeps its form, disabled until the saved draft loads) sends nothing.
      const save = page.getByTestId(e.save);
      if ((await save.count()) > 0 && (await save.isEnabled())) await save.click();
      await expect(e.saved(page)).toBeVisible();
      await failGets(page, null);
      await retryEveryRead(page);
      await expect(page.getByTestId(e.history).locator('li')).toHaveCount(1);
      await expect(e.saved(page)).toBeVisible();
      // After recovery the form shows the saved draft; Save stays focusable but a repeat press is not a new write.
      await page.getByTestId(e.save).click();
      await expect(e.saved(page)).toBeVisible();
      expect(await rows(page, e)).toHaveLength(1);
      expect((await rows(page, e))[0]?.currentVersion).toBe(1);
      const posts = (await draftPosts(page));
      expect(posts).toHaveLength(1);
      expect(consoleErrors).toEqual([]);
    });
  });
}

/** INV-007: the edit-price drawer, opened on a Larkspur Heights unit, with the same flows. */
test.describe('INV-007 with the test-only pricing principal', () => {
  test.beforeEach(async ({ page }) => {
    await seedPrincipal(page, 'res_e3qa_pricing');
  });

  test('INV-007: propose, then revise; the listed price and price history never change', async ({ page, consoleErrors }) => {
    await page.goto(`${BO}/backoffice/inv/unit-price-history?record=${HEIGHTS_UNIT}`);
    await expect(page.getByTestId('price-baseline')).toBeVisible();
    const baseline = (await page.getByTestId('price-baseline').textContent()) ?? '';
    const price = await unitPrice(page);
    await page.getByTestId('open-price-change-drawer').click();
    await expect(page.getByTestId('edit-price-change-drawer')).toBeVisible();
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    await expect(drawerVersions(page)).toHaveCount(1);
    await propose(page, '17600000.50', 'Illustrative second proposal for QA review only');
    await expect(drawerSaved(page)).toHaveCount(0);
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    await expect(drawerVersions(page)).toHaveCount(2);
    const [row] = await priceDrafts(page);
    expect(row).toMatchObject({ currentVersion: 2, state: 'draft', effective: false, approvalAllowed: false });
    expect(await unitPrice(page)).toBe(price);
    await page.keyboard.press('Escape');
    await page.goto(`${BO}/backoffice/inv/unit-price-history?record=${HEIGHTS_UNIT}`);
    await expect(page.getByTestId('price-baseline')).toHaveText(baseline);
    expect(consoleErrors).toEqual([]);
  });

  test('INV-007: a lost response retried with Save sends the same key and makes one draft', async ({ page, consoleErrors }) => {
    await openDrawer(page);
    await installFaults(page);
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    await loseNextPost(page, '^/units/[\\w-]+/price-change-drafts$');
    await page.getByTestId('price-change-save').click();
    await expect(page.getByTestId('state-offline').first()).toBeVisible();
    await expect(drawerSaved(page)).toHaveCount(0);
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    const posts = (await draftPosts(page));
    expect(posts.map((r) => r.outcome)).toEqual(['applied-but-lost', 'ok']);
    expect(posts[1]!.header).toBe(posts[0]!.header);
    expect(await priceDrafts(page)).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });

  test('INV-007: reads failing after a successful save keep it saved; no second draft with a fresh key', async ({ page, consoleErrors }) => {
    await openDrawer(page);
    await installFaults(page);
    await propose(page, '17500000.25', 'Illustrative proposal for QA review only');
    // Every read of the drawer fails from here on: the unit's price history, its drafts list and the selected draft.
    await failGets(page, '^/(pricing/units|units/|price-change-drafts/)');
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    // While the reads fail, the confirmation holds and pressing Save again (if offered) sends nothing.
    const save = page.getByTestId('price-change-save');
    if ((await save.count()) > 0 && (await save.isEnabled())) await save.click();
    await expect(drawerSaved(page)).toBeVisible();
    await failGets(page, null);
    // The drawer is modal: its own reads are retried (the unit list behind it recovers on its own later).
    await retryEveryRead(page, page.getByTestId('edit-price-change-drawer'));
    await expect(drawerVersions(page)).toHaveCount(1);
    await expect(drawerSaved(page)).toBeVisible();
    await page.getByTestId('price-change-save').click();
    await expect(drawerSaved(page)).toBeVisible();
    expect(await priceDrafts(page)).toHaveLength(1);
    expect((await priceDrafts(page))[0]?.currentVersion).toBe(1);
    expect((await draftPosts(page))).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });
});
