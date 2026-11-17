import type { Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';

/**
 * Gate E.7 cross-browser smoke (Firefox and WebKit projects, provisional Wave 1): a journal prepared by
 * the accounts officer, approved and posted by the finance controller, and the trial balance moving by
 * its amount; a statement import previewed with its duplicates flagged; the journals and the trial
 * balance at 320 px with 200 % text in Urdu. The full checks run in Chromium (tests/e2e/e7-ledger.spec.ts).
 * Business date: 26 October 2026.
 */
const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
}

async function become(page: Page, persona: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, value }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona) },
  );
}

async function as(page: Page, persona: string, path: string, ready: string) {
  await become(page, persona);
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

async function choose(page: Page, select: string, option: RegExp) {
  await page.getByTestId(select).locator('button').first().click();
  await page.getByRole('option', { name: option }).click();
}

test('a journal prepared by one person, approved and posted by another; the trial balance moves by its amount', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await seed(page, { persona: 'lk_accounts' as PersonaId });
  await as(page, 'lk_accounts', '/backoffice/acc/create-journal', 'journal-form');
  await page.getByTestId('journal-date').fill('2026-10-24');
  await page.getByTestId('journal-memo').fill('Demo accrual — security services, October (fictional)');
  await choose(page, 'journal-line-0-account', /^5200/);
  await page.getByTestId('journal-line-0-debit').fill('125000');
  await choose(page, 'journal-line-1-account', /^2200/);
  await page.getByTestId('journal-line-1-credit').fill('125000');
  await expect(page.getByTestId('journal-totals')).toHaveAttribute('data-balanced', 'true');
  await page.getByTestId('journal-send').click();
  await expect(page.getByTestId('journal-detail')).toHaveAttribute('data-state', 'submitted');
  const id = new URL(page.url()).searchParams.get('record')!;
  await as(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${id}`, 'journal-approve');
  for (const step of ['approve', 'post'] as const) {
    await page.getByTestId(`journal-${step}`).click();
    await page.getByTestId('journal-ack').click();
    await page.getByTestId('journal-confirm').click();
    await expect(page.getByTestId('journal-detail')).toHaveAttribute('data-state', step === 'approve' ? 'approved' : 'posted');
  }
  await as(page, 'lk_controller', '/backoffice/acc/trial-balance', 'ledger-tb');
  await expect(page.getByTestId('ledger-tb')).toHaveAttribute('data-debit', '176775000.00');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('a statement import preview flags duplicates and an invalid row; nothing is imported until someone else approves', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seed(page, { persona: 'lk_treasury' as PersonaId });
  await as(page, 'lk_treasury', '/backoffice/bank/bank-import', 'bank-new');
  await page.getByTestId('bank-preview').click();
  const counts = page.getByTestId('bank-import-counts');
  await expect(counts).toHaveAttribute('data-new', '3');
  await expect(counts).toHaveAttribute('data-dup-file', '1');
  await expect(counts).toHaveAttribute('data-dup-prior', '2');
  await expect(counts).toHaveAttribute('data-invalid', '1');
  await expect(page.getByTestId('bank-line')).toHaveCount(4);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 × 700, Urdu, 200 %: the journals and the trial balance are not clipped, spilled or broken mid-word', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { persona: 'lk_controller' as PersonaId, locale: 'ur-PK' });
  for (const p of ['usr_lsp_0011', 'usr_lsp_0012']) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}` });
  for (const [path, ready] of [
    ['/backoffice/acc/journal-entries', 'journal-list'],
    ['/backoffice/acc/journal-entries?record=jnl_lke_0007', 'journal-detail'],
    ['/backoffice/acc/trial-balance', 'tb-list'],
  ] as const) {
    await as(page, 'lk_controller', path, ready);
    expect(await layoutProblems(page), path).toEqual([]);
  }
  expect(appErrors(consoleErrors)).toEqual([]);
});
