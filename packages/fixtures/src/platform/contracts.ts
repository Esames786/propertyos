import { componentFromLine, type ContractDraft, type EditionKey, type PricingComponent } from '@repo/contracts';
import { presetFor } from './catalog';
import { RATE_CARD, rateCardLine } from './rate-card';

/** First day of the month after `iso` (contracts start on a billing boundary by default). */
export function nextMonthStart(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The edition preset's components priced from the rate card. With a trial, every charge (including
 * one-time onboarding) starts when the trial ends.
 */
export function defaultContract(edition: EditionKey, options: { start: string; trial?: boolean }): ContractDraft {
  const { start } = options;
  const trialDays = options.trial ? (rateCardLine('rc_trial')?.trialDays ?? 30) : 0;
  const chargesFrom = trialDays ? addDays(start, trialDays) : start;
  const components: PricingComponent[] = [];
  if (trialDays) components.push(componentFromLine(rateCardLine('rc_trial')!, 'cmp_trial', start));
  for (const id of presetFor(edition).components) {
    const line = rateCardLine(id);
    if (line) components.push(componentFromLine(line, `cmp_${id.replace(/^rc_/, '')}`, chargesFrom));
  }
  return {
    terms: { start, termMonths: 12, billingFrequency: 'monthly', timing: 'advance', tax: { code: 'NONE', ratePct: '0' } },
    components,
    discounts: [],
  };
}

export const RATE_CARD_LINE_IDS = RATE_CARD.lines.map((l) => l.id);
