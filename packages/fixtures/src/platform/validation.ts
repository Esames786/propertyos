import { COMPONENT_TYPES, USAGE_DIMENSIONS, type ContractDraft, type ModuleSelection, type RateCard, type TenantDraft } from '@repo/contracts';
import { CATALOG } from './catalog';
import { TAX_CODES } from './rate-card';

/**
 * Server-side validation for drafts and contracts (owner review of Gate B checkpoint 1). The forms
 * check the same things, but the mock server never trusts them: a malformed price, date, tier, count
 * or a missing reason is refused here with 422 and a field-level code, whatever sent it.
 *
 * Two strengths:
 * - **pricing**: what any quote or simulation needs (numbers, ranges, dates, tiers, tax);
 * - **commit**: also what saving a draft or activating needs (discount and price-override reasons).
 */
export interface Problem {
  code: string;
  params?: Record<string, string>;
}
export type Problems = Record<string, Problem>;

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNIT_BASES = new Set(['units.registered', 'units.active', 'units.occupied', 'units.eligible', 'units.licensed_capacity']);
const MODULE_KEYS = new Set(CATALOG.modules.map((m) => m.key));
const MAX_COUNT = 10_000_000;

const isMoney = (m: unknown): boolean => typeof m === 'object' && m !== null && typeof (m as { amount?: unknown }).amount === 'string' && MONEY.test((m as { amount: string }).amount);
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const isCount = (n: unknown, max = MAX_COUNT): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
const text = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
const v = (code: string, params?: Record<string, string>): Problem => ({ code: `platform:validation.${code}`, ...(params ? { params } : {}) });

export function contractProblems(contract: unknown, opts: { commit: boolean; rateCard: RateCard }): Problems {
  const p: Problems = {};
  if (typeof contract !== 'object' || contract === null) return { contract: v('contractMissing') };
  const c = contract as Partial<ContractDraft>;
  const terms = c.terms;
  if (!terms || typeof terms !== 'object') return { contract: v('contractMissing') };

  if (!isDate(terms.start)) p['terms.start'] = v('start');
  if (terms.termMonths !== null && !(isCount(terms.termMonths, 120) && terms.termMonths >= 1)) p['terms.termMonths'] = v('term');
  if (!['monthly', 'quarterly', 'annual'].includes(terms.billingFrequency as string)) p['terms.billingFrequency'] = v('frequency');
  if (terms.minimumMonthly !== undefined && !isMoney(terms.minimumMonthly)) p['terms.minimumMonthly'] = v('minimum');
  if (terms.capMonthly !== undefined && !isMoney(terms.capMonthly)) p['terms.capMonthly'] = v('cap');
  if (isMoney(terms.minimumMonthly) && isMoney(terms.capMonthly) && Number(terms.minimumMonthly!.amount) > Number(terms.capMonthly!.amount)) p['terms.capMonthly'] = v('minCap');
  // The rate comes from the configured tax code, never from the request (D-10).
  const tax = TAX_CODES.find((x) => x.code === terms.tax?.code);
  if (!tax || Number(terms.tax?.ratePct) !== Number(tax.ratePct)) p['terms.tax'] = v('tax');

  const components = Array.isArray(c.components) ? c.components : [];
  if (components.length === 0) p.components = v('noComponents');
  const ids = new Set<string>();
  components.forEach((x, i) => {
    const n = { n: String(i + 1) };
    const at = (field: string) => `components.${i}.${field}`;
    if (typeof x?.id === 'string') ids.add(x.id);
    if (!(COMPONENT_TYPES as readonly string[]).includes(x?.type)) {
      p[at('type')] = v('componentType', n);
      return;
    }
    if (x.unitPrice !== undefined && !isMoney(x.unitPrice)) p[at('unitPrice')] = v('componentPrice', n);
    if (!isDate(x.effectiveFrom)) p[at('effectiveFrom')] = v('componentStart', n);
    else if (x.effectiveTo !== undefined && !(isDate(x.effectiveTo) && x.effectiveTo > x.effectiveFrom)) p[at('effectiveTo')] = v('componentDates', n);
    if ((x.type === 'PER_UNIT' || x.type === 'TIERED') && x.dimension !== undefined && !UNIT_BASES.has(x.dimension)) p[at('dimension')] = v('componentBasis', n);
    if (x.type === 'USAGE' && x.dimension !== undefined && !(USAGE_DIMENSIONS as readonly string[]).includes(x.dimension)) p[at('dimension')] = v('componentBasis', n);
    if (x.allowance !== undefined && !isCount(x.allowance)) p[at('allowance')] = v('allowance', n);
    if (x.quantity !== undefined && !isCount(x.quantity)) p[at('quantity')] = v('quantity', n);
    if (x.type === 'TRIAL' && !(isCount(x.trialDays ?? 30, 365) && (x.trialDays ?? 30) >= 1)) p[at('trialDays')] = v('trialDays', n);
    if (x.module !== undefined && !MODULE_KEYS.has(x.module)) p[at('module')] = v('module', { module: String(x.module) });
    if (x.type === 'TIERED') {
      const tiers = x.tiers ?? [];
      const ordered = tiers.every((t, j) => (j === tiers.length - 1 ? t.upTo === null : isCount(t.upTo) && (t.upTo as number) > 0 && (j === 0 || (t.upTo as number) > (tiers[j - 1]!.upTo as number))));
      if (tiers.length === 0 || !ordered || !tiers.every((t) => isMoney(t.unitPrice))) p[at('tiers')] = v('tiers', n);
    }
    if (opts.commit && x.rateCardLineId && x.unitPrice && isMoney(x.unitPrice)) {
      const list = opts.rateCard.lines.find((l) => l.id === x.rateCardLineId)?.unitPrice;
      if (list && Number(list.amount) !== Number(x.unitPrice.amount) && !text(x.overrideReason)) p[at('overrideReason')] = v('overrideReason', n);
    }
  });

  const discounts = Array.isArray(c.discounts) ? c.discounts : [];
  discounts.forEach((d, i) => {
    const n = { n: String(i + 1) };
    const at = (field: string) => `discounts.${i}.${field}`;
    const value = Number(d?.value);
    if (d?.kind === 'percent') {
      if (!(typeof d.value === 'string' && Number.isFinite(value) && value > 0 && value <= 100)) p[at('value')] = v('discountPercent', n);
    } else if (d?.kind === 'amount') {
      if (!(typeof d.value === 'string' && MONEY.test(d.value) && value > 0)) p[at('value')] = v('discountAmount', n);
    } else p[at('kind')] = v('discountKind', n);
    if (!(d?.target === 'recurring' || d?.target === 'contract' || ids.has(d?.target ?? ''))) p[at('target')] = v('discountTarget', n);
    if (!isDate(d?.from)) p[at('from')] = v('discountStart', n);
    else if (d.to !== undefined && !(isDate(d.to) && d.to > d.from)) p[at('to')] = v('discountDates', n);
    if (opts.commit && !text(d?.reason)) p[at('reason')] = v('discountReason', n);
  });
  return p;
}

export function quantityProblems(quantities: unknown): Problems {
  if (quantities === undefined) return {};
  if (typeof quantities !== 'object' || quantities === null) return { quantities: v('quantities') };
  const bad = Object.entries(quantities).some(([k, n]) => !(USAGE_DIMENSIONS as readonly string[]).includes(k) || !isCount(n));
  return bad ? { quantities: v('quantities') } : {};
}

function moduleProblems(modules: unknown, siteIds: Set<string>): Problems {
  if (!Array.isArray(modules)) return { modules: v('modules') };
  const p: Problems = {};
  (modules as ModuleSelection[]).forEach((m, i) => {
    if (!MODULE_KEYS.has(m?.module)) p[`modules.${i}`] = v('module', { module: String(m?.module) });
    else if (m.sites !== 'all' && !(Array.isArray(m.sites) && m.sites.every((s) => siteIds.has(s)))) p[`modules.${i}`] = v('moduleSites', { module: m.module });
  });
  return p;
}

/** A draft PATCH: every part that is sent must be well-formed; a contract must pass the commit rules. */
export function draftPatchProblems(patch: Partial<TenantDraft>, current: TenantDraft, rateCard: RateCard): Problems {
  let p: Problems = {};
  if (patch.edition !== undefined && patch.edition !== null && !['developer', 'community', 'portfolio', 'custom'].includes(patch.edition)) p.edition = v('edition');
  if (patch.organisation) {
    const o = patch.organisation;
    if (!text(o.displayName)) p['organisation.displayName'] = { code: 'forms:errors.required' };
    if (!text(o.legalName)) p['organisation.legalName'] = { code: 'forms:errors.required' };
    if (text(o.contactEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(o.contactEmail))) p['organisation.contactEmail'] = v('email');
    if (text(o.displayName).length > 120 || text(o.legalName).length > 160) p['organisation.displayName'] = v('nameLength');
  }
  if (patch.sites !== undefined) {
    if (!Array.isArray(patch.sites)) p.sites = v('sites');
    else
      patch.sites.forEach((s, i) => {
        if (!text(s?.name) || !isCount(s?.buildings, 500) || !isCount(s?.declaredUnits, 100_000) || s.declaredUnits <= 0) p[`sites.${i}`] = v('site', { n: String(i + 1) });
      });
  }
  const sites = Array.isArray(patch.sites) ? patch.sites : current.sites;
  if (patch.modules !== undefined) p = { ...p, ...moduleProblems(patch.modules, new Set(sites.map((s) => s.id))) };
  if (patch.quantities !== undefined) p = { ...p, ...quantityProblems(patch.quantities) };
  if (patch.contract) p = { ...p, ...contractProblems(patch.contract, { commit: true, rateCard }) };
  return p;
}
