import type { Page } from '@playwright/test';
import { BO, CU, expect, test, waitForApp } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';

/**
 * GitHub Issue #21 cross-browser smoke (Firefox and WebKit projects): in the credit-note drawer, the
 * answer to the first press is lost on the way back (the server issued the note); pressing "Issue credit
 * note" again shows that same note as issued, and the invoice holds one note. The full checks run in
 * Chromium (tests/e2e/cn-idempotency.spec.ts). Business date: 26 October 2026.
 */
async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

/** Loses the answer to the next credit-note POST after the server acted on it (see the e2e spec). */
const loseNextAnswer = (page: Page) =>
  page.evaluate(() => {
    const transport = window.__prototype!.transport;
    const original = transport.request.bind(transport);
    let lose = true;
    transport.request = (async (req: Parameters<typeof original>[0]) => {
      const answer = await original(req);
      if (lose && req.method === 'POST' && /\/credit-notes$/.test(req.path)) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return answer;
    }) as typeof transport.request;
  });

test('a press after a lost answer shows the credit note already issued; one note on the invoice', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, { staff: 'alnoor_treasurer' });
  await page.goto(`${CU}/customer/portal/home`);
  const invoiceId = (await ok(societyApi<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'))).position.current.invoiceId;
  await become(page, 'backoffice', 'alnoor_treasurer');
  await waitForApp(page);
  await page.goto(`${BO}/backoffice/fin/invoice-workspace?record=${invoiceId}`);
  await expect(page.getByTestId('invoice-workspace')).toBeVisible();
  await loseNextAnswer(page);
  await page.getByTestId('invoice-credit-note').click();
  const drawer = page.getByTestId('credit-note-drawer');
  await drawer.locator('input[data-testid="credit-amount-maintenance"]').fill('600');
  await drawer.locator('textarea[data-testid="credit-reason"]').fill('Lift out of service for two weeks');
  await drawer.getByTestId('credit-note-save').click();
  await expect(drawer.getByTestId('credit-note-outcome-unknown')).toBeVisible();
  await drawer.getByTestId('credit-note-save').click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('toast-success')).toHaveCount(1);
  await expect(page.getByTestId('toast-success').first()).toContainText('ANR-CN-0001');
  await expect(page.getByTestId('invoice-credit-notes').locator('li')).toHaveCount(1);
  const notes = (await ok(societyApi<{ creditNotes: Array<{ ref: string }> }>(page, `/billing/invoices/${invoiceId}`))).creditNotes;
  expect(notes.map((n) => n.ref)).toEqual(['ANR-CN-0001']);
  expect(appErrors(consoleErrors)).toEqual([]);
});
