import type { Locator, Page } from '@playwright/test';
import { BO, expect } from './fixtures';
import { call, pricingSection } from './e3-pricing';

/**
 * Gate E.3 local validation (Issue #33): the four COM draft editors and the INV-007 drawer, described once
 * for the browser specs that drive them with the test-only pricing principal.
 */
export interface Editor {
  id: string;
  path: string;
  page: string;
  section: string;
  rows: 'templates' | 'policies' | 'drafts';
  api: string;
  save: string;
  history: string;
  saved: (page: Page) => Locator;
  listItems: (page: Page) => Locator;
  project: (page: Page) => Locator;
  title: (page: Page) => Locator;
  /** The latest version's content fields, as a revision request sends them. */
  content: readonly string[];
}

const status = (text: string) => (page: Page) => page.getByRole('status').filter({ hasText: text });
/** The header's project switcher also carries a hidden select named "Project": form fields are looked up in main. */
export const main = (page: Page) => page.getByRole('main');

export const EDITORS: readonly Editor[] = [
  {
    id: 'COM-001', path: '/backoffice/com/payment-plan-templates', page: 'payment-plan-templates-page', section: 'developer.pricing.templates', rows: 'templates',
    api: '/pricing/plan-templates', save: 'template-save', history: 'template-version-history', saved: (p) => p.getByTestId('template-saved'),
    listItems: (p) => p.getByTestId('template-list-item'), project: (p) => p.getByTestId('template-project'), title: (p) => p.getByTestId('template-name'), content: ['allocations'],
  },
  {
    id: 'COM-003', path: '/backoffice/com/pricing-policies', page: 'pricing-policies-page', section: 'developer.pricing.policies', rows: 'policies',
    api: '/pricing/policies', save: 'pricing-policy-save', history: 'pricing-policy-versions', saved: status('Pricing draft saved'),
    listItems: (p) => p.getByTestId('pricing-policy-list').getByRole('button'), project: (p) => main(p).getByRole('combobox', { name: 'Project', exact: true }), title: (p) => main(p).getByRole('textbox', { name: 'Draft name', exact: true }), content: ['rules'],
  },
  {
    id: 'COM-004', path: '/backoffice/com/fees-and-discounts', page: 'fees-discounts-page', section: 'developer.pricing.commercial', rows: 'drafts',
    api: '/pricing/commercial-rules', save: 'commercial-save', history: 'commercial-revisions', saved: status('Draft saved without approval or posting.'),
    listItems: (p) => p.getByTestId('commercial-draft-list').getByRole('button'), project: (p) => main(p).getByRole('combobox', { name: 'Project', exact: true }), title: (p) => main(p).getByRole('textbox', { name: 'Draft name', exact: true }), content: ['fees', 'discounts'],
  },
  {
    id: 'COM-005', path: '/backoffice/com/approval-rules', page: 'pricing-approval-rules-page', section: 'developer.pricing.approval-rules', rows: 'drafts',
    api: '/pricing/approval-rules', save: 'approval-draft-save', history: 'approval-version-history', saved: status('Draft saved. No approval rules were activated.'),
    listItems: (p) => p.getByTestId('approval-draft-list').getByRole('button'), project: (p) => main(p).getByRole('combobox', { name: 'Project', exact: true }), title: (p) => main(p).getByRole('textbox', { name: 'Draft title', exact: true }), content: ['rules'],
  },
];

export const HEIGHTS_UNIT = 'unt_lh_a_0101';

/** The unit's whole price-history answer (baseline, revisions, canEdit, state), as one string. */
export async function unitPrice(page: Page, unitId = HEIGHTS_UNIT) {
  const r = await call<{ baseline: unknown; revisions: unknown[]; canEdit: boolean; recordState: string }>(page, { method: 'GET', path: `/units/${unitId}/prices` });
  expect(r.ok, `GET /units/${unitId}/prices`).toBe(true);
  return r.ok ? JSON.stringify(r.body) : '';
}

export type Row = { id: string; currentVersion: number; versions: Array<Record<string, unknown>>; state: string; effective?: boolean; approvalAllowed?: boolean; postingAllowed?: boolean };

export async function rows(page: Page, e: Editor): Promise<Row[]> {
  const s = await pricingSection<Record<string, unknown>>(page, e.section);
  return ((s?.[e.rows] as Row[] | undefined) ?? []);
}

export async function openEditor(page: Page, e: Editor) {
  await page.goto(`${BO}${e.path}`);
  await expect(page.getByTestId(e.page)).toBeVisible();
  await expect(e.project(page).locator('option')).not.toHaveCount(1);
}

export async function fillNew(page: Page, e: Editor, title: string) {
  await e.project(page).selectOption('prj_heights');
  await e.title(page).fill(title);
}

/** Presses each read's "Try again" until none is left (a recovered section can reveal a nested one). */
export async function retryEveryRead(page: Page, scope: Page | Locator = page) {
  await expect.poll(async () => {
    const retry = scope.getByRole('button', { name: 'Try again' });
    const n = await retry.count();
    if (n) await retry.first().click();
    return n;
  }, { timeout: 20_000 }).toBe(0);
}

/** INV-007's drawer on a Larkspur Heights unit. */
export const DRAWER = `${BO}/backoffice/inv/edit-price-drawer?record=${HEIGHTS_UNIT}`;
export const drawerSaved = (page: Page) => page.getByTestId('price-change-saved');
export const drawerVersions = (page: Page) => page.getByTestId('price-change-versions').locator('li');
export const priceDrafts = async (page: Page) => ((await pricingSection<{ drafts: Row[] }>(page, 'developer.pricing.price-change-drafts'))?.drafts ?? []);
export async function openDrawer(page: Page) {
  await page.goto(DRAWER);
  await expect(page.getByTestId('edit-price-change-drawer')).toBeVisible();
  await expect(page.getByTestId('price-change-save')).toBeVisible();
}
export async function propose(page: Page, amount: string, reason: string) {
  await page.getByTestId('price-change-proposed').fill(amount);
  await page.getByTestId('price-change-reason').fill(reason);
}
