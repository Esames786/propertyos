import { readFileSync } from 'node:fs';
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

const dictionary = (locale: string) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/pricing.json`, 'utf8')) as Record<string, string>;
const EN = dictionary('en-PK');
const UR = dictionary('ur-PK');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pricing label in either language (exact), so the same locators drive English and Urdu screens. */
export const label = (key: string) => new RegExp(`^(?:${escape(EN[key]!)}|${escape(UR[key]!)})$`);
const field = (role: 'combobox' | 'textbox', key: string) => (p: Page) => main(p).getByRole(role, { name: label(key) });

export const EDITORS: readonly Editor[] = [
  {
    id: 'COM-001', path: '/backoffice/com/payment-plan-templates', page: 'payment-plan-templates-page', section: 'developer.pricing.templates', rows: 'templates',
    api: '/pricing/plan-templates', save: 'template-save', history: 'template-version-history', saved: (p) => p.getByTestId('template-saved'),
    listItems: (p) => p.getByTestId('template-list-item'), project: (p) => p.getByTestId('template-project'), title: (p) => p.getByTestId('template-name'), content: ['allocations'],
  },
  {
    id: 'COM-003', path: '/backoffice/com/pricing-policies', page: 'pricing-policies-page', section: 'developer.pricing.policies', rows: 'policies',
    api: '/pricing/policies', save: 'pricing-policy-save', history: 'pricing-policy-versions', saved: status('Pricing draft saved'),
    listItems: (p) => p.getByTestId('pricing-policy-list').getByRole('button'), project: field('combobox', 'policyProject'), title: field('textbox', 'policyName'), content: ['rules'],
  },
  {
    id: 'COM-004', path: '/backoffice/com/fees-and-discounts', page: 'fees-discounts-page', section: 'developer.pricing.commercial', rows: 'drafts',
    api: '/pricing/commercial-rules', save: 'commercial-save', history: 'commercial-revisions', saved: status('Draft saved without approval or posting.'),
    listItems: (p) => p.getByTestId('commercial-draft-list').getByRole('button'), project: field('combobox', 'commercialProject'), title: field('textbox', 'commercialName'), content: ['fees', 'discounts'],
  },
  {
    id: 'COM-005', path: '/backoffice/com/approval-rules', page: 'pricing-approval-rules-page', section: 'developer.pricing.approval-rules', rows: 'drafts',
    api: '/pricing/approval-rules', save: 'approval-draft-save', history: 'approval-version-history', saved: status('Draft saved. No approval rules were activated.'),
    listItems: (p) => p.getByTestId('approval-draft-list').getByRole('button'), project: field('combobox', 'approvalProject'), title: field('textbox', 'approvalName'), content: ['rules'],
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

/** The seven E.3 screens, each brought to its authorized, populated state (a draft with two versions selected, a preview computed …). */
export interface Screen {
  id: 'INV-006' | 'INV-007' | 'COM-001' | 'COM-002' | 'COM-003' | 'COM-004' | 'COM-005';
  slug: string;
  /** Where its content is: the page, or (INV-007) the drawer over it. */
  region: (page: Page) => Locator;
  prepare: (page: Page) => Promise<void>;
}

// Short, realistic values: at 320 px with 200 % text a longer value scrolls inside its single-line field, which
// the layout check counts as clipped (a long title stays readable only by scrolling the field: see the report).
const draftBodies: Record<string, Record<string, unknown>> = {
  '/pricing/plan-templates': { projectId: 'prj_heights', title: 'Heights plan', allocations: [{ kind: 'down_payment', shareBps: 2000 }, { kind: 'instalments', shareBps: 7000, count: 12 }, { kind: 'on_possession', shareBps: 1000 }] },
  '/pricing/policies': { projectId: 'prj_heights', title: 'Heights rates', rules: [{ unitType: 'residential', baseRate: { amount: '18500.00', currency: 'PKR' }, floorRiseBps: 150, cornerPremiumBps: 500, parkFacingPremiumBps: 300 }] },
  '/pricing/commercial-rules': { projectId: 'prj_heights', title: 'Heights fees', fees: [{ code: 'FILE_FEE', label: 'File fee', mode: 'fixed', amount: { amount: '25000.00', currency: 'PKR' } }, { code: 'TRANSFER', label: 'Transfer fee', mode: 'rate_bps', rateBps: 100 }], discounts: [{ code: 'EARLY_BIRD', label: 'Early pay', rateBps: 200, maxAmount: { amount: '500000.00', currency: 'PKR' } }] },
  '/pricing/approval-rules': { projectId: 'prj_heights', title: 'Heights review', rules: [{ subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' }, requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false }, { subject: 'discount_exception', threshold: { amount: '250000.00', currency: 'PKR' }, requiredReviewers: 1, makerCheckerRequired: true, allowSelfApproval: false }] },
};

/** Creates a draft and one revision through the API (from any loaded backoffice page). */
async function seedDraft(page: Page, api: string) {
  const body = draftBodies[api]!;
  const created = await call<{ id: string }>(page, { method: 'POST', path: api, idempotencyKey: `qa-shot-${api.slice(9)}-c1`, body: { ...body, idempotencyKey: `qa-shot-${api.slice(9)}-c1` } });
  if (!created.ok) throw new Error(`seed ${api}: ${JSON.stringify(created.problem)}`);
  const { projectId: _project, ...rest } = body;
  const revised = await call(page, { method: 'POST', path: `${api}/${created.body.id}/versions`, idempotencyKey: `qa-shot-${api.slice(9)}-r2`, body: { ...rest, title: `${String(body.title)} v2`, expectedVersion: 1, idempotencyKey: `qa-shot-${api.slice(9)}-r2` } });
  if (!revised.ok) throw new Error(`revise ${api}: ${JSON.stringify(revised.problem)}`);
}

async function ready(page: Page) {
  await page.goto(`${BO}/backoffice/inv/unit-price-history`);
  await expect(page.getByTestId('unit-price-history-page')).toBeVisible();
}

const editorScreen = (e: Editor, slug: string): Screen => ({
  id: e.id as Screen['id'], slug, region: (p) => p.getByTestId(e.page),
  prepare: async (page) => {
    await ready(page);
    await seedDraft(page, e.api);
    await page.goto(`${BO}${e.path}`);
    await expect(page.getByTestId(e.page)).toBeVisible();
    await e.listItems(page).first().click();
    await expect(page.getByTestId(e.history).locator('li')).toHaveCount(2);
  },
});

export const SCREENS: readonly Screen[] = [
  {
    id: 'INV-006', slug: 'inv-006-price-history', region: (p) => p.getByTestId('unit-price-history-page'),
    prepare: async (page) => {
      await page.goto(`${BO}/backoffice/inv/unit-price-history?record=${HEIGHTS_UNIT}`);
      await expect(page.getByTestId('price-baseline')).toBeVisible();
    },
  },
  {
    id: 'INV-007', slug: 'inv-007-price-drawer', region: (p) => p.getByTestId('edit-price-change-drawer'),
    prepare: async (page) => {
      await ready(page);
      const created = await call<{ id: string }>(page, { method: 'POST', path: `/units/${HEIGHTS_UNIT}/price-change-drafts`, idempotencyKey: 'qa-shot-price-change-c1', body: { proposedPrice: { amount: '33250000.00', currency: 'PKR' }, reason: 'Corner unit with park view; illustrative internal proposal', idempotencyKey: 'qa-shot-price-change-c1' } });
      if (!created.ok) throw new Error(JSON.stringify(created.problem));
      await call(page, { method: 'POST', path: `/price-change-drafts/${created.body.id}/versions`, idempotencyKey: 'qa-shot-price-change-r2', body: { expectedVersion: 1, proposedPrice: { amount: '33500000.00', currency: 'PKR' }, reason: 'Revised after an illustrative comparison; still a private draft', idempotencyKey: 'qa-shot-price-change-r2' } });
      await openDrawer(page);
      await page.getByTestId('price-change-drafts').getByRole('button').first().click();
      await expect(drawerVersions(page)).toHaveCount(2);
    },
  },
  editorScreen(EDITORS[0]!, 'com-001-plan-templates'),
  {
    id: 'COM-002', slug: 'com-002-plan-builder', region: (p) => p.getByTestId('payment-plan-builder-page'),
    prepare: async (page) => {
      await page.goto(`${BO}/backoffice/com/payment-plan-builder`);
      await expect(page.getByTestId('payment-plan-builder-page')).toBeVisible();
      await page.getByTestId('plan-unit-picker').getByRole('button').click();
      await page.getByRole('option', { name: /LH-A-0101/ }).click();
      await page.getByTestId('plan-preview-submit').click();
      await expect(page.getByTestId('plan-preview-lines').locator('li')).toHaveCount(13);
    },
  },
  editorScreen(EDITORS[1]!, 'com-003-pricing-policies'),
  {
    ...editorScreen(EDITORS[2]!, 'com-004-fees-discounts'),
    prepare: async (page) => {
      await editorScreen(EDITORS[2]!, 'com-004-fees-discounts').prepare(page);
      // The read-only preview on a unit of the same project.
      await main(page).getByRole('combobox', { name: label('commercialUnit') }).selectOption(HEIGHTS_UNIT);
      await page.getByTestId('commercial-compute').click();
      await expect(page.getByTestId('commercial-preview-result')).toBeVisible();
    },
  },
  editorScreen(EDITORS[3]!, 'com-005-approval-rules'),
];
