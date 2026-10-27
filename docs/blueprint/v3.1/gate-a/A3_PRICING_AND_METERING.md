# A3. Operator pricing rules, worked examples and metering policy

**Gate A output item 4.**
- Covers **SaaS (platform) billing only**: what the platform operator charges a tenant.
- Resident dues are a different obligation, payee and ledger (A4).
- All prices below are **illustrative** and come from V3.1 doc 03 or are invented for the example. None is a proposed commercial price.

## 1. Principles

1. **Price is configuration.** A tenant's price is an effective-dated **subscription contract** made of **components**. No edition or plan has a hard-coded formula.
2. **Quantities come from immutable usage snapshots.** A snapshot records its count definition version and evidence (I-14). A live count is never used for an invoice.
3. **Every number is explainable:** basis, quantity, unit price, cycle, proration, allowance, discount, tax, total. The same breakdown appears in the builder, the quote, the invoice and the simulator.
4. **Calculations run server-side** (in the mock: the fixtures "server", never React components). The UI only displays results. The same golden test vectors (§9) later prove the Laravel implementation.
5. **Nothing financial is deleted.** Changes are amendments (new contract version), adjustment lines or credit notes.

## 2. Component types (the pricing rule matrix)

| Type | Charges | Quantity source | Cadence | Proration | Example |
|---|---|---|---|---|---|
| `FREE` | Nothing: a free-forever or zero-base contract still exists, so limits and history are recorded | — | — | — | "Free plan, up to 20 flats" |
| `TRIAL` | Zero for a period, then the next version applies | — | Once | — | 30-day trial |
| `ONE_TIME` | Setup, onboarding, migration, training | Fixed quantity (usually 1) | Once, on the first invoice after the effective date | No | Onboarding PKR 15,000 |
| `FIXED_RECURRING` | Base platform fee | 1 | Monthly, quarterly, annual or custom | Yes (§3) | Base PKR 0 |
| `PER_SITE` | Per licensed site | `sites.licensed` snapshot | Recurring | Yes | PKR 500 per site |
| `PER_BUILDING` | Per active building | `buildings.active` | Recurring | Yes | — |
| `PER_UNIT` | Per unit, for **one declared unit dimension**: registered, active, occupied, eligible or licensed capacity (§4) | That dimension's snapshot | Recurring | Yes | PKR 40 × 80 eligible flats |
| `PER_SEAT` | Per staff user | `seats.staff_active` | Recurring | Yes | — |
| `PER_MODULE` / `PER_FEATURE` | Add-on price, optionally per site | Granted module/feature (× sites if site-scoped) | Recurring | Yes | Online payments add-on per site |
| `TIERED` | Unit or seat price by volume, with the method **declared**: `graduated` (each band at its own price) or `volume` (all units at the band reached) | The underlying dimension | Recurring | Yes | §5.3 |
| `USAGE` | SMS, WhatsApp, push, storage GB-month, API calls, authorized gateway events | `usage_meter_events` summed per period | In arrears | No (actual use) | 500 SMS included, then a per-message price |
| `DISCOUNT` | Percent, fixed amount or free months, on a component or the contract | — | As the target | Follows the target | 10 % for an annual term |
| `MINIMUM` / `CAP` | A floor or ceiling on a component or the contract total | — | Per period | — | Minimum PKR 2,000 per month |
| `ALLOWANCE` | Included quantity before charging | — | Per period | Prorated with the period | 500 SMS per month |
| `WAIVER` / `CREDIT` | An approved reduction on an invoice, or a balance carried forward | — | Ad hoc | — | Goodwill waiver of one month |
| `TAX` | Tax per jurisdiction and tax code, effective-dated; exemptions recorded with evidence | Taxable line amounts | Per invoice | — | Configured; never hard-coded (D-10) |

**Fields every component carries**
- type, dimension (when quantity-based), scope (tenant, site, module or feature) with its reference;
- pricing method, unit price or tiers, allowance, minimum, cap;
- cadence and billing timing (in advance or in arrears), proration rule, tax code;
- `[effective_from, effective_to)`;
- the source rate-card line, and an override reason when the price differs from the rate card.

## 3. Cadence, timing and proration (defaults proposed, D-7)

| Rule | Proposed default | Alternatives the contract may declare |
|---|---|---|
| Recurring billing timing | **In advance**, on the period start | In arrears |
| Usage billing timing | **In arrears**, for the closed period | — |
| Quantity snapshot for recurring per-unit / per-site | **Snapshot at period start**; additions during the period are billed next period, prorated from the day they became countable; reductions take effect next period | Snapshot at period end; peak in period; daily average |
| Proration method | **Actual days**: amount × days covered ÷ days in that period. A partial first month starts on the effective date | 30-day month; no proration |
| One-time components | Never prorated; billed once on the first invoice after the effective date | — |
| Upgrade (price increase) mid-period | Prorated charge for the remainder of the period, on the next invoice | Immediate invoice |
| Downgrade or removal mid-period | Effective at the **next** period; no refund of the current period unless the amendment says so | Prorated credit |
| Grace and suspension | Overdue platform invoice → `grace` (full access, banner) → `suspended`: only permitted financial-history reads, plus settlement of already-issued invoices if the suspension policy allows it (A1 §4, D-20). All operational mutations are blocked | Days are a contract setting |

## 4. Metering policy: unit counts are not interchangeable

V3.1: a flat may be **registered, active, occupied, eligible or licensed capacity**, and the counts differ.

| Dimension | Counts | Source | Excludes |
|---|---|---|---|
| `units.licensed_capacity` | The number written in the contract | Contract | — (not a count) |
| `units.registered` | Units existing in the tenant DB for licensed sites | Tenant `units` | Archived, merged, demolished |
| `units.active` | Registered units with `status = active` | Tenant `units` | Inactive |
| `units.occupied` | Active units with a current occupancy (owner or tenant) on the snapshot date | Tenant `occupancies` | Vacant |
| `units.eligible` | **Contract-defined.** Default: active units in sites where `dues` or `resident_portal` is granted, excluding only units the *contract* lists as non-billable (e.g., an agreed guard room), each with a recorded reason | Definition version | As defined |
| `sites.licensed` | Sites in the contract | Central `licensed_sites` | Retired sites |
| `buildings.active` | Active buildings in licensed sites | Tenant `buildings` | — |
| `seats.staff_active` | Staff tenant users active at any time in the period (default) or at the snapshot | Tenant `tenant_users` | Residents; deactivated before the period start |
| `sms.sent`, `whatsapp.sent`, `push.sent` | Messages accepted by the provider | `usage_meter_events` (deduplicated by `source_event_id`) | Messages the provider rejected |
| `storage.gb_month` | Average stored GB over the period | Storage meter | — |
| `gateway.authorized_events` | Authorized online payment events processed for the tenant | Gateway events | Failed or cancelled |

**Snapshot procedure**
1. At the snapshot time, the tenant plane runs the **versioned count definition** (`usage_count_definitions`).
2. It returns the number plus **evidence**: the counted unit ULIDs and codes, and the excluded ones with reasons. **Evidence contains no personal data** (flat codes only, no names).
3. The central plane stores an **immutable `usage_snapshot`**: tenant, dimension, period, value, definition version, captured time, evidence reference.
4. The invoice line references the snapshot id.

**Disputes and corrections**
1. A tenant admin or Supreme Admin marks a snapshot `disputed` with a reason.
2. Correcting it creates a `usage_snapshot_correction` (new value, reason, approver).
3. An **adjustment line** is issued on the next invoice, or a platform credit note for a closed period.
4. Original rows are never edited, and every step is in the tenant's billing audit.

**Before a new tenant has any data**, the quote uses the **declared** quantities entered in the wizard (e.g., 80 eligible flats). They are labelled "estimate". The first invoice after go-live uses the first real snapshot, and the difference is visible in the usage tab.

**A dues exemption is not a platform exemption.**
- An association can exempt its own office flat (Al-Noor A-108) from *dues*. It still counts as *eligible* for the platform fee unless the contract's definition excludes it.
- The two decisions belong to different parties and are recorded separately.

**Never silently charge registered units when the contract says occupied or eligible units.** The builder shows the chosen dimension, its definition and the current count side by side with the other counts, so the difference is visible before activation.

## 5. Worked examples (golden vectors for Gate B tests)

### 5.1 Al-Noor Residency: the V3.1 example (80 eligible units)

| Component | Basis | Quantity | Unit price | First full month | Later months |
|---|---|---:|---:|---:|---:|
| Base platform fee | `FIXED_RECURRING` | 1 | PKR 0 | 0 | 0 |
| Flat fee | `PER_UNIT` (`units.eligible`) | 80 | PKR 40 | 3,200 | 3,200 |
| Site fee | `PER_SITE` | 1 | PKR 500 | 500 | 500 |
| Onboarding | `ONE_TIME` | 1 | PKR 15,000 | 15,000 | — |
| **Total before tax and discounts** | | | | **PKR 18,700** | **PKR 3,700** |

### 5.2 Same contract, different count dimension or start date

| Variation | Calculation | Result |
|---|---|---|
| Count **occupied** flats instead (fixture: 76 occupied, 4 vacant) | 76 × 40 + 500 | PKR 3,540 / month |
| Contract starts **16 Nov 2026** (30-day month, 15 days covered) | 15,000 + (3,700 × 15 ÷ 30) | First invoice **PKR 16,850**; December PKR 3,700 |
| 10 % discount on recurring components only | (3,200 + 500) × 0.9 | PKR 3,330 / month; onboarding not discounted |
| Price change from 1 Jan 2027: flat fee PKR 45 (scheduled amendment, version 2) | 80 × 45 + 500 | Nov–Dec PKR 3,700; from Jan **PKR 4,100**; version 1 stays in history |

### 5.3 Tier methods must be declared (illustrative tiers: 1–50 flats at PKR 45, 51+ at PKR 35)

| Method | 80 flats | Result |
|---|---|---|
| `graduated` | 50 × 45 + 30 × 35 | PKR 3,300 |
| `volume` | 80 × 35 | PKR 2,800 |

### 5.4 Usage with an allowance (illustrative)
- 500 SMS included, then PKR 1.50 per message.
- 740 sent → 240 × 1.50 = **PKR 360**, billed in arrears on the next invoice.

## 6. Calculation order (one order, used everywhere)

1. Select the components effective in the period, by contract version.
2. Take each quantity from its snapshot.
3. Subtract the allowance.
4. Price by method: flat, per unit, graduated or volume tiers, or usage.
5. Prorate the recurring components (§3).
6. Apply the component minimum or cap.
7. Apply discounts: component-level first, then contract-level, **before tax**.
8. Round each line half-up to 2 dp.
9. Compute tax per line from its tax code.
10. Apply the contract-level minimum or cap, as an explicit adjustment line.
11. Totals are the sum of rounded lines.

**The gateway-event fee is a SaaS fee charged to the tenant on the platform invoice.**
- It is **never deducted from residents' payments**. Residents' money settles in full to the tenant's own merchant account (A4 §6).
- Any provider fee is between the tenant and their provider.

## 7. Contract lifecycle and controls

| Action | Who | Effect |
|---|---|---|
| Draft or edit a contract | Supreme Admin, platform billing | Draft version; the preview is non-authoritative |
| Activate | Supreme Admin, **unless the contract trips a commercial-approval threshold** (§7.1); then a commercial approver who is not the author must approve first | Version becomes active and immutable; grants follow it |
| Amend (price, components, term) | Supreme Admin | New version with an effective date. Future-dated amendments appear as "Scheduled" |
| Put on a free plan, extend a trial | Supreme Admin | Amendment |
| Waive or credit an invoice | Supreme Admin, with a reason | Adjustment or credit note; the original invoice remains |
| Suspend / reinstate / cancel | Supreme Admin, by explicit policy | Tenant status changes; data retained; finance history never deleted |
| Dispute a count | Tenant admin or Supreme Admin | Snapshot `disputed` → correction flow (§4) |

### 7.1 Commercial approval thresholds (D-14, required correction: shown and enforced in the Gate B mock)

A versioned `commercial_policy` sets the thresholds. **Illustrative defaults** (the owner sets the real values):

| Trigger | Default threshold |
|---|---|
| Any discount | more than **15 %** on a component or the contract |
| Unit price below the rate card | more than **10 %** below the rate-card line (manual override) |
| Free or zero-price recurring terms | beyond the standard trial length (**30 days**) |
| One-time onboarding fee waived or reduced | more than **50 %** |
| Contract term | more than **36 months**, or a price lock longer than 12 months |
| Estimated first-year value | below **PKR 25,000** for a paid edition (minimum-deal rule) |

**How it works**
- **Live in the builder.** The builder evaluates the policy on every change. The quote and the review step list each tripped rule in plain language ("Discount 20 % exceeds the 15 % limit").
- **Activation when a rule is tripped:**
  1. The contract becomes `pending_approval` and the tenant shows *Awaiting commercial approval*.
  2. The approval request records the reasons, the requester and the contract version.
  3. Only someone holding `platform.contracts.approve`, who is **not** the requester, can approve or return it with a comment.
  4. Approval activates the version. A return sends it back to draft.
- **Prototype vs production.**
  - The Gate B mock **enforces** this state machine.
  - Production enforcement (Gate H) adds delegation limits by amount and a full approval matrix, which are out of scope now.

**Separations**
- Tenant lifecycle status (trial, active, suspended…) is separate from billing status (current, overdue, in dispute). Effective licence access is always auditable.
- A tenant admin can never change their own licence or price.
- Emergency support access needs explicit consent and is logged (A1 §4).

## 8. What the HQ screens must show

- **Pricing component table** (in the contract builder): one row per component with basis, dimension, quantity source, quantity, unit price or tiers, cycle, proration, allowance, discount, tax code, effective dates and line total. It also states why the price differs from the rate card.
- **Usage and count preview:** registered, active, occupied and eligible counts next to each other, with the chosen dimension highlighted. **Meter evidence drawer:** counted and excluded flat codes with reasons, definition version and snapshot time.
- **Quote / invoice preview:** the first period and a typical later period, with each line explained, totals in EN and UR, and a printable layout.
- **Pricing simulator:**
  - What-if unit counts, start dates, tiers and discounts.
  - It **never writes** to contracts or invoices, and is labelled "Simulation: nothing is saved".
  - It can copy a scenario into a draft amendment.
- **Version history and audit:** every contract version and who changed what, with diffs.

## 9. Golden test vectors (delivered with Gate B)

Each vector is stored as JSON in `packages/fixtures/src/platform/pricing.vectors.json` and checked by unit tests. It contains:
- the contract components;
- the snapshots;
- the period;
- the expected lines and totals.

The same vectors later become the Laravel contract tests.

**First set:** 5.1, every row of 5.2, 5.3 (both methods), 5.4, plus:
- a 0-price free plan;
- a cap example;
- a disputed-and-corrected snapshot producing an adjustment line.
