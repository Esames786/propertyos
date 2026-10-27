import {
  COMMERCIAL_RULES,
  EDITIONS,
  MODULE_KEYS,
  SIGNUP_POLICIES,
  type CommercialPolicyConfig,
  type ConfigChange,
  type ConfigDisplayStatus,
  type ConfigKind,
  type ConfigPayload,
  type ConfigVersion,
  type ContractDraft,
  type EditionKey,
  type EditionPreset,
  type ModuleCatalog,
  type ModuleCatalogEntry,
  type ModuleSelection,
  type RateCard,
  type SignupPolicyConfig,
} from '@repo/contracts';
import { FIXTURE_NOW } from '../seed';
import { MODULES, PRESETS } from './catalog';
import { COMMERCIAL_POLICY, RATE_CARD } from './rate-card';
import type { Problem, Problems } from './validation';

/**
 * Versioned commercial configuration (Gate B remaining scope). Each kind is a series of versions;
 * the version in force on a date is the approved one with the latest effective date on or before
 * it. Seeds are version 1 of each, ILLUSTRATIVE defaults approved by a second person, so nothing in
 * the engines is a permanent constant: change a version here (or in HQ) and every quote, simulation,
 * contract and entitlement check that runs for a later date follows it.
 */

export const TODAY = FIXTURE_NOW.toISOString().slice(0, 10);

export const SEED_POLICY: CommercialPolicyConfig = {
  ...COMMERCIAL_POLICY,
  approverRoles: ['commercial_approver', 'supreme_admin'],
  exceptions: [],
};

export const SEED_SIGNUP: SignupPolicyConfig = {
  byEdition: { community: 'approval_required', portfolio: 'approval_required', developer: 'sales_assisted', custom: 'invitation_only' },
  trialDays: 30,
  maxSelfServiceUnits: 120,
  requireVerifiedEmail: true,
};

const seed = (kind: ConfigKind, label: string, payload: ConfigPayload, reasonKey: string): ConfigVersion => ({
  id: `cfg_${kind}_1`,
  kind,
  version: 1,
  label,
  state: 'approved',
  status: 'in_force',
  effectiveFrom: '2026-01-01',
  payload,
  reason: reasonKey,
  basedOn: null,
  changes: [],
  createdBy: 'Hamza Qureshi',
  createdById: 'usr_hq_0001',
  createdAt: '2025-12-15T09:00:00Z',
  submittedAt: '2025-12-15T09:05:00Z',
  decidedBy: 'Ayesha Siddiqui',
  decidedById: 'usr_hq_0002',
  decidedAt: '2025-12-16T10:00:00Z',
});

export const SEED_CONFIG: readonly ConfigVersion[] = [
  seed('rate_card', 'rc-2026.01-1', { kind: 'rate_card', rateCard: RATE_CARD }, 'Illustrative launch rate card (Gate A, A3).'),
  seed('commercial_policy', COMMERCIAL_POLICY.version, { kind: 'commercial_policy', policy: SEED_POLICY }, 'Illustrative thresholds (A3 §7.1); the owner sets the real values.'),
  seed('catalogue', '2026.10-1', { kind: 'catalogue', modules: MODULES }, 'Module catalogue of Gate A (A1 §5).'),
  seed('signup_policy', 'su-2026.01-1', { kind: 'signup_policy', signup: SEED_SIGNUP }, 'Onboarding policies decided in D-8.'),
];

// ---------------------------------------------------------------- which version applies

const approved = (versions: readonly ConfigVersion[], kind: ConfigKind) => versions.filter((v) => v.kind === kind && v.state === 'approved');

/** The approved version in force on `at` (latest effective date, then highest version). */
export function versionAt(versions: readonly ConfigVersion[], kind: ConfigKind, at: string): ConfigVersion {
  const candidates = approved(versions, kind).filter((v) => v.effectiveFrom <= at.slice(0, 10));
  const pick = candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0];
  return pick ?? approved(versions, kind).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]!;
}

export function displayStatus(v: ConfigVersion, versions: readonly ConfigVersion[], today = TODAY): ConfigDisplayStatus {
  if (v.state !== 'approved') return v.state;
  if (v.effectiveFrom > today) return 'scheduled';
  return versionAt(versions, v.kind, today).id === v.id ? 'in_force' : 'superseded';
}

export const rateCardOf = (v: ConfigVersion): RateCard => (v.payload.kind === 'rate_card' ? { ...v.payload.rateCard, id: v.id, version: v.version, effectiveFrom: v.effectiveFrom } : RATE_CARD);
export const policyOf = (v: ConfigVersion): CommercialPolicyConfig => (v.payload.kind === 'commercial_policy' ? { ...v.payload.policy, version: v.label } : SEED_POLICY);
export const catalogueModulesOf = (v: ConfigVersion): readonly ModuleCatalogEntry[] => (v.payload.kind === 'catalogue' ? v.payload.modules : MODULES);
export const signupOf = (v: ConfigVersion): SignupPolicyConfig => (v.payload.kind === 'signup_policy' ? v.payload.signup : SEED_SIGNUP);

/** Edition presets follow the catalogue version (which modules each edition includes). */
export function presetsFrom(modules: readonly ModuleCatalogEntry[]): EditionPreset[] {
  return PRESETS.map((p) => ({ ...p, modules: modules.filter((m) => m.includedIn.includes(p.key)).map((m) => m.key) }));
}

export function catalogueFrom(v: ConfigVersion): ModuleCatalog {
  const modules = catalogueModulesOf(v);
  return { version: v.label, modules, presets: presetsFrom(modules) };
}

/** Policy limits for an edition on a date, exceptions applied. */
export function policyFor(policy: CommercialPolicyConfig, edition: EditionKey, at: string): CommercialPolicyConfig {
  const live = policy.exceptions.filter((e) => e.edition === edition && (e.until === undefined || at.slice(0, 10) < e.until));
  if (!live.length) return policy;
  const field = { discount_above_limit: 'maxDiscountPct', price_below_floor: 'maxBelowRateCardPct', free_beyond_trial: 'maxFreeDays', onboarding_reduced: 'maxOnboardingReductionPct', term_too_long: 'maxTermMonths' } as const;
  const next: CommercialPolicyConfig = { ...policy };
  for (const e of live) {
    if (e.rule === 'first_year_below_minimum') next.minFirstYearValue = { amount: `${e.limit}.00`, currency: 'PKR' };
    else (next as unknown as Record<string, number>)[field[e.rule]] = e.limit;
  }
  return next;
}

// ---------------------------------------------------------------- what changed

const keyOf = (item: unknown, i: number) => {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    if (typeof o.id === 'string') return o.id;
    if (typeof o.key === 'string') return o.key;
  }
  return String(i);
};

function flatten(value: unknown, path: string, out: Map<string, string>) {
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x !== 'object' || x === null)) {
      out.set(path, value.join(', '));
      return;
    }
    value.forEach((item, i) => flatten(item, path ? `${path}.${keyOf(item, i)}` : keyOf(item, i), out));
    return;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.amount === 'string' && o.currency === 'PKR' && Object.keys(o).length === 2) {
      out.set(path, `Rs ${o.amount}`);
      return;
    }
    for (const [k, v] of Object.entries(o)) flatten(v, path ? `${path}.${k}` : k, out);
    return;
  }
  if (value !== undefined) out.set(path, String(value));
}

/** Field-by-field differences between two payloads (or any two JSON values). */
export function diff(before: unknown, after: unknown, root = ''): ConfigChange[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten(before, root, a);
  flatten(after, root, b);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths.filter((p) => a.get(p) !== b.get(p)).map((p) => ({ path: p, before: a.get(p) ?? '—', after: b.get(p) ?? '—' }));
}

const payloadBody = (p: ConfigPayload): unknown =>
  p.kind === 'rate_card' ? p.rateCard.lines : p.kind === 'commercial_policy' ? { ...p.policy, version: undefined } : p.kind === 'catalogue' ? p.modules : p.signup;

export const payloadDiff = (before: ConfigPayload, after: ConfigPayload) => diff(payloadBody(before), payloadBody(after));

/** What an amendment changes: modules and sites, components, discounts and terms. */
export const contractDiff = (before: { contract: ContractDraft; modules: readonly ModuleSelection[] }, after: { contract: ContractDraft; modules: readonly ModuleSelection[] }) =>
  diff(
    { modules: before.modules.map((m) => ({ key: m.module, sites: m.sites === 'all' ? 'all' : [...m.sites] })), components: before.contract.components, discounts: before.contract.discounts, terms: before.contract.terms },
    { modules: after.modules.map((m) => ({ key: m.module, sites: m.sites === 'all' ? 'all' : [...m.sites] })), components: after.contract.components, discounts: after.contract.discounts, terms: after.contract.terms },
  );

// ---------------------------------------------------------------- validation (the server never trusts the form)

const v = (code: string, params?: Record<string, string>): Problem => ({ code: `platform:config.validation.${code}`, ...(params ? { params } : {}) });
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const isMoney = (m: unknown) => typeof m === 'object' && m !== null && typeof (m as { amount?: unknown }).amount === 'string' && MONEY.test((m as { amount: string }).amount);
const intIn = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORM_ROLES = new Set(['supreme_admin', 'commercial_approver', 'platform_support']);

function rateCardProblems(card: RateCard, base: RateCard): Problems {
  const p: Problems = {};
  if (!card.lines?.length) return { lines: v('linesRequired') };
  const baseIds = new Set(base.lines.map((l) => l.id));
  const ids = new Set<string>();
  for (const l of card.lines) {
    if (!baseIds.has(l.id)) p[`lines.${l.id}`] = v('unknownLine');
    if (ids.has(l.id)) p[`lines.${l.id}`] = v('duplicateLine');
    ids.add(l.id);
    if (l.unitPrice !== undefined && !isMoney(l.unitPrice)) p[`lines.${l.id}.unitPrice`] = v('price');
    if (l.floorPrice !== undefined && (!isMoney(l.floorPrice) || (l.unitPrice && Number(l.floorPrice.amount) > Number(l.unitPrice.amount)))) p[`lines.${l.id}.floorPrice`] = v('floor');
    if (l.tiers) {
      let last = 0;
      l.tiers.forEach((t, i) => {
        if (!isMoney(t.unitPrice)) p[`lines.${l.id}.tiers.${i}`] = v('price');
        if (t.upTo !== null && (!intIn(t.upTo, 1, 10_000_000) || t.upTo <= last)) p[`lines.${l.id}.tiers.${i}`] = v('tiers');
        if (t.upTo !== null) last = t.upTo;
        if (t.upTo === null && i !== l.tiers!.length - 1) p[`lines.${l.id}.tiers.${i}`] = v('tiers');
      });
    }
    if (l.type === 'TRIAL' && !intIn(l.trialDays, 1, 365)) p[`lines.${l.id}.trialDays`] = v('trialDays');
    if (l.allowance !== undefined && !intIn(l.allowance, 0, 10_000_000)) p[`lines.${l.id}.allowance`] = v('allowance');
    if (!l.editions?.length || l.editions.some((e) => !EDITIONS.includes(e))) p[`lines.${l.id}.editions`] = v('editions');
  }
  for (const id of baseIds) if (!ids.has(id)) p[`lines.${id}`] = v('lineRemoved');
  return p;
}

function policyProblems(policy: CommercialPolicyConfig): Problems {
  const p: Problems = {};
  if (!intIn(policy.maxDiscountPct, 0, 100)) p.maxDiscountPct = v('percent');
  if (!intIn(policy.maxBelowRateCardPct, 0, 100)) p.maxBelowRateCardPct = v('percent');
  if (!intIn(policy.maxOnboardingReductionPct, 0, 100)) p.maxOnboardingReductionPct = v('percent');
  if (!intIn(policy.maxFreeDays, 0, 365)) p.maxFreeDays = v('days');
  if (!intIn(policy.maxTermMonths, 1, 120)) p.maxTermMonths = v('months');
  if (!isMoney(policy.minFirstYearValue)) p.minFirstYearValue = v('price');
  if (!policy.approverRoles?.length || policy.approverRoles.some((r) => !PLATFORM_ROLES.has(r))) p.approverRoles = v('approvers');
  if (policy.approverRoles?.includes('platform_support')) p.approverRoles = v('approversSupport');
  const ids = new Set<string>();
  for (const e of policy.exceptions ?? []) {
    const at = `exceptions.${e.id}`;
    if (!e.id || ids.has(e.id)) p[at] = v('exceptionId');
    ids.add(e.id);
    if (!EDITIONS.includes(e.edition)) p[`${at}.edition`] = v('editions');
    if (!COMMERCIAL_RULES.includes(e.rule)) p[`${at}.rule`] = v('rule');
    if (!intIn(e.limit, 0, 10_000_000)) p[`${at}.limit`] = v('limit');
    if (e.until !== undefined && (!DATE.test(e.until) || e.until <= TODAY)) p[`${at}.until`] = v('until');
    if (!e.reason?.trim()) p[`${at}.reason`] = v('reasonRequired');
  }
  return p;
}

function catalogueProblems(modules: readonly ModuleCatalogEntry[], base: readonly ModuleCatalogEntry[]): Problems {
  const p: Problems = {};
  const keys = new Set(modules.map((m) => m.key));
  for (const b of base) if (!keys.has(b.key)) p[`modules.${b.key}`] = v('moduleRemoved');
  const byKey = new Map(modules.map((m) => [m.key, m]));
  for (const m of modules) {
    if (!MODULE_KEYS.includes(m.key)) p[`modules.${m.key}`] = v('unknownModule');
    if (m.key === 'core' && (!m.alwaysOn || m.requires.length)) p['modules.core'] = v('coreFixed');
    for (const r of m.requires) {
      if (r === m.key) p[`modules.${m.key}.requires`] = v('selfRequire');
      else if (!byKey.has(r)) p[`modules.${m.key}.requires`] = v('unknownModule');
      // A tenant-wide module cannot depend on something granted per site (it could not be satisfied everywhere).
      else if (m.scope === 'tenant' && byKey.get(r)!.scope === 'site' && !base.find((b) => b.key === m.key)?.requires.includes(r)) p[`modules.${m.key}.requires`] = v('scopeMismatch', { module: m.key, requires: r });
    }
    if (m.includedIn.some((e) => !EDITIONS.includes(e)) || m.addonFor.some((e) => !EDITIONS.includes(e))) p[`modules.${m.key}.editions`] = v('editions');
    if (m.includedIn.some((e) => m.addonFor.includes(e))) p[`modules.${m.key}.editions`] = v('includedAndAddon');
  }
  // No cycles: a module may not (indirectly) require itself.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const cyclic = (k: string): boolean => {
    if (done.has(k)) return false;
    if (visiting.has(k)) return true;
    visiting.add(k);
    const found = (byKey.get(k as ModuleCatalogEntry['key'])?.requires ?? []).some((r) => cyclic(r));
    visiting.delete(k);
    done.add(k);
    return found;
  };
  for (const m of modules) if (cyclic(m.key)) p[`modules.${m.key}.requires`] = v('cycle', { module: m.key });
  return p;
}

function signupProblems(s: SignupPolicyConfig): Problems {
  const p: Problems = {};
  for (const e of EDITIONS) if (!SIGNUP_POLICIES.includes(s.byEdition?.[e])) p[`byEdition.${e}`] = v('signup');
  if (!intIn(s.trialDays, 1, 90)) p.trialDays = v('trialDays');
  if (!intIn(s.maxSelfServiceUnits, 1, 100_000)) p.maxSelfServiceUnits = v('units');
  if (typeof s.requireVerifiedEmail !== 'boolean') p.requireVerifiedEmail = v('flag');
  return p;
}

export function configProblems(payload: ConfigPayload, base: ConfigPayload): Problems {
  if (payload.kind !== base.kind) return { payload: v('kind') };
  switch (payload.kind) {
    case 'rate_card':
      return rateCardProblems(payload.rateCard, (base as Extract<ConfigPayload, { kind: 'rate_card' }>).rateCard);
    case 'commercial_policy':
      return policyProblems(payload.policy);
    case 'catalogue':
      return catalogueProblems(payload.modules, (base as Extract<ConfigPayload, { kind: 'catalogue' }>).modules);
    case 'signup_policy':
      return signupProblems(payload.signup);
  }
}
