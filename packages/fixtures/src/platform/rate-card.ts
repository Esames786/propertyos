import { pkr, type CommercialPolicy, type RateCard, type RateCardLine } from '@repo/contracts';

/**
 * Rate card v1 (Gate A, A3). Every price is ILLUSTRATIVE fixture data, not a commercial proposal.
 * The community lines reproduce the owner's V3.1 example: PKR 0 base, PKR 40 per eligible flat,
 * PKR 500 per site, PKR 15,000 onboarding.
 */
const line = (l: RateCardLine) => l;

export const RATE_CARD: RateCard = {
  id: 'rc_2026_v1',
  version: 1,
  effectiveFrom: '2026-01-01',
  currency: 'PKR',
  lines: [
    // Base platform fees
    line({ id: 'rc_comm_base', type: 'FIXED_RECURRING', unitPrice: pkr('0.00'), cadence: 'monthly', editions: ['community', 'portfolio', 'custom'] }),
    line({ id: 'rc_dev_base', type: 'FIXED_RECURRING', unitPrice: pkr('25000.00'), cadence: 'monthly', editions: ['developer', 'custom'] }),
    // Quantity-based
    line({ id: 'rc_unit_eligible', type: 'PER_UNIT', dimension: 'units.eligible', unitPrice: pkr('40.00'), cadence: 'monthly', editions: ['community', 'portfolio', 'custom'] }),
    line({ id: 'rc_unit_registered', type: 'PER_UNIT', dimension: 'units.registered', unitPrice: pkr('30.00'), cadence: 'monthly', editions: ['developer', 'custom'] }),
    line({
      id: 'rc_unit_tiered',
      type: 'TIERED',
      dimension: 'units.eligible',
      tierMethod: 'graduated',
      tiers: [
        { upTo: 50, unitPrice: pkr('45.00') },
        { upTo: null, unitPrice: pkr('35.00') },
      ],
      cadence: 'monthly',
      editions: ['community', 'portfolio', 'custom'],
    }),
    line({ id: 'rc_site', type: 'PER_SITE', dimension: 'sites.licensed', unitPrice: pkr('500.00'), cadence: 'monthly', editions: ['community', 'portfolio', 'developer', 'custom'] }),
    line({ id: 'rc_building', type: 'PER_BUILDING', dimension: 'buildings.active', unitPrice: pkr('300.00'), cadence: 'monthly', editions: ['portfolio', 'custom'] }),
    line({ id: 'rc_dev_seat', type: 'PER_SEAT', dimension: 'seats.staff_active', unitPrice: pkr('1500.00'), cadence: 'monthly', editions: ['developer', 'portfolio', 'custom'] }),
    // One-time
    line({ id: 'rc_onboarding_comm', type: 'ONE_TIME', unitPrice: pkr('15000.00'), cadence: 'once', editions: ['community', 'portfolio', 'custom'] }),
    line({ id: 'rc_onboarding_dev', type: 'ONE_TIME', unitPrice: pkr('75000.00'), cadence: 'once', editions: ['developer', 'custom'] }),
    line({ id: 'rc_migration', type: 'ONE_TIME', unitPrice: pkr('25000.00'), cadence: 'once', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    // Free and trial
    line({ id: 'rc_trial', type: 'TRIAL', trialDays: 30, cadence: 'once', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    line({ id: 'rc_free', type: 'FREE', unitPrice: pkr('0.00'), cadence: 'monthly', editions: ['community', 'custom'] }),
    // Module add-ons (site-scoped modules are priced per site)
    line({ id: 'rc_mod_online_payments', type: 'PER_MODULE', module: 'online_payments', unitPrice: pkr('1500.00'), cadence: 'monthly', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    line({ id: 'rc_mod_accounting', type: 'PER_MODULE', module: 'accounting', unitPrice: pkr('2500.00'), cadence: 'monthly', editions: ['community', 'portfolio', 'custom'] }),
    line({ id: 'rc_mod_public_website', type: 'PER_MODULE', module: 'public_website', unitPrice: pkr('15000.00'), cadence: 'monthly', editions: ['developer', 'custom'] }),
    line({ id: 'rc_mod_white_label', type: 'PER_MODULE', module: 'white_label', unitPrice: pkr('5000.00'), cadence: 'monthly', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    line({ id: 'rc_mod_api', type: 'PER_MODULE', module: 'api_access', unitPrice: pkr('3000.00'), cadence: 'monthly', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    line({ id: 'rc_mod_dues', type: 'PER_MODULE', module: 'dues', unitPrice: pkr('4000.00'), cadence: 'monthly', editions: ['developer', 'custom'] }),
    // Usage (billed in arrears)
    line({ id: 'rc_sms', type: 'USAGE', dimension: 'sms.sent', unitPrice: pkr('1.50'), allowance: 500, cadence: 'monthly', editions: ['developer', 'community', 'portfolio', 'custom'] }),
    line({ id: 'rc_storage', type: 'USAGE', dimension: 'storage.gb_month', unitPrice: pkr('50.00'), allowance: 10, cadence: 'monthly', editions: ['developer', 'community', 'portfolio', 'custom'] }),
  ],
};

export const rateCardLine = (id: string) => RATE_CARD.lines.find((l) => l.id === id);

/** Illustrative thresholds (A3 §7.1). The owner sets the real values. */
export const COMMERCIAL_POLICY: CommercialPolicy = {
  version: 'cp-2026.10-1',
  maxDiscountPct: 15,
  maxBelowRateCardPct: 10,
  maxFreeDays: 30,
  maxOnboardingReductionPct: 50,
  maxTermMonths: 36,
  minFirstYearValue: pkr('25000.00'),
};

/**
 * Tax codes offered in the builder. ILLUSTRATIVE: real codes and rates are configured per
 * jurisdiction and confirmed by the owner's tax adviser (D-10); nothing is hard-coded in the engine.
 */
export const TAX_CODES = [
  { code: 'NONE', ratePct: '0' },
  { code: 'DEMO-10', ratePct: '10' },
] as const;
