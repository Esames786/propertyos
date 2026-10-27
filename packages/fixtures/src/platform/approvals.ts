import type { ApprovalCheck, CommercialPolicyConfig, ContractDraft, EditionKey, Money, RateCard } from '@repo/contracts';
import { policyFor, SEED_POLICY } from './config';
import { RATE_CARD } from './rate-card';

/**
 * Commercial approval thresholds (Gate A review, correction 4 / D-14; A3 §7.1). A contract that
 * trips any rule cannot activate until an approver who is not its author approves it. The check is
 * pure and runs on every quote, so the builder shows the reasons as they arise. The thresholds come
 * from the policy version in force (with any exception for the edition), and floors from the rate
 * card version in force: none of them is a constant here.
 */
const paisa = (m: Money | undefined) => (m ? Math.round(Number(m.amount) * 100) : 0);
const fmt = (p: number) => (p / 100).toFixed(2);
const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function checkApproval(contract: ContractDraft, ctx: { edition: EditionKey; firstYearValue: Money; policy?: CommercialPolicyConfig; rateCard?: RateCard }): ApprovalCheck {
  const p = policyFor(ctx.policy ?? SEED_POLICY, ctx.edition, contract.terms.start);
  const rateCardLine = (id: string) => (ctx.rateCard ?? RATE_CARD).lines.find((l) => l.id === id);
  const reasons: ApprovalCheck['reasons'] = [];

  // Discounts above the limit (percent, or an amount that is that large a share of its component).
  for (const d of contract.discounts) {
    let pct = Number(d.value);
    if (d.kind === 'amount') {
      const target = contract.components.find((c) => c.id === d.target);
      const base = target ? paisa(target.unitPrice) * (target.quantity ?? 1) : 0;
      pct = base > 0 ? (paisa({ amount: d.value, currency: 'PKR' }) / base) * 100 : 100;
    }
    if (pct > p.maxDiscountPct) reasons.push({ rule: 'discount_above_limit', params: { value: pct.toFixed(1).replace(/\.0$/, ''), limit: String(p.maxDiscountPct) } });
  }

  for (const c of contract.components) {
    const list = c.rateCardLineId ? rateCardLine(c.rateCardLineId) : undefined;
    // Unit price below the rate card (or below the line's own floor).
    if (list?.unitPrice && c.unitPrice && c.type !== 'ONE_TIME') {
      const listP = paisa(list.unitPrice);
      const floor = list.floorPrice ? paisa(list.floorPrice) : Math.round(listP * (1 - p.maxBelowRateCardPct / 100));
      if (paisa(c.unitPrice) < floor) reasons.push({ rule: 'price_below_floor', params: { price: fmt(paisa(c.unitPrice)), list: fmt(listP), limit: String(p.maxBelowRateCardPct) } });
    }
    // One-time onboarding reduced by more than the limit.
    if (c.type === 'ONE_TIME' && list?.unitPrice && paisa(list.unitPrice) > 0) {
      const cut = (1 - paisa(c.unitPrice) / paisa(list.unitPrice)) * 100;
      if (cut > p.maxOnboardingReductionPct) reasons.push({ rule: 'onboarding_reduced', params: { value: cut.toFixed(0), limit: String(p.maxOnboardingReductionPct) } });
    }
    // Free terms beyond the standard trial length.
    if (c.type === 'TRIAL' && (c.trialDays ?? 0) > p.maxFreeDays) reasons.push({ rule: 'free_beyond_trial', params: { days: String(c.trialDays), limit: String(p.maxFreeDays) } });
    if (c.type === 'FREE') {
      const length = c.effectiveTo ? days(c.effectiveFrom, c.effectiveTo) : Infinity;
      if (length > p.maxFreeDays) reasons.push({ rule: 'free_beyond_trial', params: { days: Number.isFinite(length) ? String(length) : '∞', limit: String(p.maxFreeDays) } });
    }
  }

  if (contract.terms.termMonths !== null && contract.terms.termMonths > p.maxTermMonths) {
    reasons.push({ rule: 'term_too_long', params: { months: String(contract.terms.termMonths), limit: String(p.maxTermMonths) } });
  }

  // Minimum deal size, only for contracts that charge a recurring price at all.
  const paysRecurring = contract.components.some((c) => c.type !== 'ONE_TIME' && c.type !== 'TRIAL' && c.type !== 'FREE' && paisa(c.unitPrice) > 0) || contract.components.some((c) => c.type === 'TIERED');
  if (paysRecurring && paisa(ctx.firstYearValue) < paisa(p.minFirstYearValue)) {
    reasons.push({ rule: 'first_year_below_minimum', params: { value: fmt(paisa(ctx.firstYearValue)), minimum: fmt(paisa(p.minFirstYearValue)) } });
  }

  return { required: reasons.length > 0, reasons, policyVersion: p.version };
}
