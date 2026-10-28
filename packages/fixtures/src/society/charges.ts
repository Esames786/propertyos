import { SCOPE_RANK, type ChargeCategoryKey, type ChargeRule, type Exemption, type Money, type ResolvedCharge, type RuleRef, type SocietyFlat } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';

/**
 * Which rule wins (A4 §2). For one flat and period, each category is charged by the most specific
 * rule in force: site default → building → unit type → flat override. Exemptions apply afterwards,
 * only when approved. Pure and deterministic; the preview stores the result as a snapshot.
 */

/** A rule version in force for a period (YYYY-MM): from ≤ period < to. */
export const ruleInForce = (r: ChargeRule, period: string) => r.from <= period && (r.to === undefined || period < r.to);

export function ruleApplies(r: ChargeRule, flat: Pick<SocietyFlat, 'id' | 'siteId' | 'buildingId' | 'typeId'>): boolean {
  if (r.siteId !== flat.siteId) return false;
  switch (r.scope.level) {
    case 'site':
      return true;
    case 'building':
      return r.scope.id === flat.buildingId;
    case 'unit_type':
      return r.scope.id === flat.typeId;
    case 'unit':
      return r.scope.id === flat.id;
  }
}

export const refOf = (r: ChargeRule): RuleRef => ({ id: r.id, ruleId: r.ruleId, version: r.version, category: r.category, scope: r.scope, scopeName: r.scopeName, amount: r.amount });

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

/** More specific first; for the same scope, the later version first. */
const byPrecedence = (a: ChargeRule, b: ChargeRule) => SCOPE_RANK[b.scope.level] - SCOPE_RANK[a.scope.level] || b.version - a.version || b.from.localeCompare(a.from);

export const exemptionInForce = (e: Exemption, period: string) => e.state === 'approved' && e.from <= period && (e.to === undefined || period < e.to);
const exemptionCovers = (e: Exemption, category: ChargeCategoryKey) => e.categories === 'all' || e.categories.includes(category);

export function resolveCharges(
  flat: Pick<SocietyFlat, 'id' | 'siteId' | 'buildingId' | 'typeId'>,
  rules: readonly ChargeRule[],
  exemptions: readonly Exemption[],
  period: string,
): ResolvedCharge[] {
  const applying = rules.filter((r) => ruleInForce(r, period) && ruleApplies(r, flat));
  const categories = [...new Set(applying.map((r) => r.category))];
  const exemption = exemptions.filter((e) => e.unitId === flat.id && exemptionInForce(e, period));
  return categories
    .map((category) => {
      const [winner, ...overridden] = applying.filter((r) => r.category === category).sort(byPrecedence);
      const base = toPaisa(winner!.amount.amount);
      const ex = exemption.find((e) => exemptionCovers(e, category));
      const amount = ex ? (base * BigInt(100 - ex.percent)) / 100n : base;
      return {
        category,
        base: money(base),
        amount: money(amount),
        winner: refOf(winner!),
        overridden: overridden.map(refOf),
        ...(ex ? { exemption: { id: ex.id, percent: ex.percent, reason: ex.reason } } : {}),
      };
    })
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

const CATEGORY_ORDER: readonly ChargeCategoryKey[] = ['maintenance', 'security', 'lift', 'water', 'generator', 'parking', 'common_electricity', 'sinking_fund', 'one_time_assessment', 'repair', 'late_fee'];

export const totalOf = (lines: readonly ResolvedCharge[]) => lines.reduce((s, l) => s + toPaisa(l.amount.amount), 0n);
