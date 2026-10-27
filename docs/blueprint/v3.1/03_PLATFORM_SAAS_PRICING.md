# V3.1 — SaaS Supreme Admin: fully configurable pricing

The SaaS operator chooses **how to charge each tenant**, mixing components in one effective-dated subscription contract. Prices are commercial settings, not hardcoded plan-specific formulas.

## Supported billing dimensions
- FREE/free forever/trial; optional zero base fee.
- ONE_TIME setup/onboarding/migration/training.
- FIXED recurring monthly, quarterly, annually or custom cadence.
- PER_SITE / PER_BUILDING / PER_ELIGIBLE_UNIT_OR_FLAT / PER_STAFF_SEAT.
- PER_MODULE / PER_FEATURE add-ons, including site-scoped enablement.
- TIERED volume pricing (graduated vs volume method declared).
- METERED usage (SMS, notifications, storage, API, authorized transaction events).
- HYBRID multiple components simultaneously, discounts, fee caps/minimums, allowances, waivers, coupons, credits.
- TAX configuration and exemptions according to jurisdiction.
- Effective dates, term, pro-rata calculations, upgrades/downgrades, grace, suspend, cancel, renewal, billing disputes.

## Meter policies
A flat may be REGISTERED, ACTIVE, OCCUPIED, ELIGIBLE or LICENSED CAPACITY. These counts differ. Every priced dimension defines its exact count source, inclusion/exclusion rules, snapshot time, version and ability to dispute/correct with audit. Never silently charge all registered flats if contract says occupied units.

## Illustrative tenant: Al-Noor Residency
80 eligible units.
Monthly base: PKR 0.
Unit fee: PKR 40 x 80 = PKR 3,200.
Building/site fee: PKR 500.
One-time onboarding: PKR 15,000.
First full month before taxes/discounts: PKR 18,700.
Subsequent full month: PKR 3,700.
Change rates/counting rules in Supreme Admin with preview before contract activation.

## Required Supreme Admin UI journey
Tenants → Create Tenant → Tenant Type (Developer/Society/Portfolio) → Add Sites → Module Entitlements → Dependency Check → Pricing Builder (component rows + fee basis + effective dates) → Usage/Unit Count Preview → Tax/Discount → Quote/Invoice Preview → Review → Activate Demo Tenant.

Operator must be able to modify a subscription by approved amendment, schedule future price changes, put tenant on free plan, waive invoices and see complete version/audit trail.

## Billing UX
- Calculation breakdown must show fee basis, quantity, unit price, cycle, tax, allowance, adjustment and total.
- Pricing Simulator supports what-if unit counts and effective dates without mutating authoritative billing.
- Meter Evidence drawer links every usage count to source.
- SaaS invoicing, payment receipt, overdue/dunning, credits and discounts stay entirely in central platform finance.
- Tenant resident payment methods/merchant settlement credentials are separate and do not automatically route funds to the SaaS operator.

## Controls
Tenant lifecycle and plan state distinct from billing status; effective license access remains auditable. Tenant Admin cannot override Supreme Admin license. Emergency support access only with explicit consent and log. No financial history deletion.
