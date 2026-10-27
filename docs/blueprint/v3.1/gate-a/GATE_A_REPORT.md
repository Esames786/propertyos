# PropertyOS V3.1: Gate A report (architecture and screen-register reconciliation)

**Status: Gate A APPROVED WITH REQUIRED CORRECTIONS (owner review of `cc7ed1c`). Gate B authorized, with a mandatory checkpoint.**

**The six required corrections, now made in the documents**

| # | Correction | Where |
|---|---|---|
| 1 | **D-5 financial entity isolation:** every invoice, payment, bank transaction, settlement, allocation and posting carries its legal entity; cross-entity links are impossible (composite keys) | A2 §3, §5.1, I-19; A4 §5.4 |
| 2 | **Billing liability per unit:** multi-flat accounts keep a responsible payer per flat (`unit_liabilities`); no account-wide percentages; allocation by invoice line | A2 §4.4–4.5, I-5, I-18; A4 §1, §5.4, §8; A6 §4 |
| 3 | **D-8 signup modes:** self-service trial, approval required, invitation only, sales assisted; Get started adapts | A1 §8; A2 central entities, R-19; A6 §3 |
| 4 | **D-14 commercial approvals:** thresholds, pending-approval state and maker ≠ approver, shown and enforced in the Gate B mock | A3 §7.1; A2 I-22; A6 §3; A7 AB-15 |
| 5 | **Suspended tenants:** permitted financial-history reads plus policy-controlled settlement only; operational mutations blocked | A1 §4; A3 §3; A2 I-21; A6 §2; new **D-20** |
| 6 | **Bank transaction deduplication:** identity scoped to account and provider (or import fingerprint); one transaction confirms one payment; references are hints only; maker-checker and verified-beneficiary safeguards kept | A2 §5.2, I-20; A4 §5.1; A6 §4 |

**Original status at `cc7ed1c`: Gate A complete. STOPPED for product-owner approval.**
- **Branch and baseline:** `feature/stage-1.5-premium-design`, commit `c9f7274` (V3.1 handoff) on top of Stage 1.5R.
- **This report:** the commit that adds this folder.
- **What Gate A did:**
  - **Changed:** documentation only, plus one documentation tool (`scripts/gate-a-register-proposal.mjs`).
  - **Not changed:**
    - screens, tests, mock data and production logic;
    - the live screen register (`docs/ui/screen-register.csv`).
  - **Not done:** merged to `main` or started Gate B.

## What was inspected
- **V3.1:** docs 00–07, in order.
- **V2.1 baseline:**
  - read for this gate: the master blueprint (ERD, states, IA, screen inventory), start prompt, execution stages, payment rules, decisions;
  - read in earlier stages: the accessibility, design-token and onboarding docs.
- **Live register:** 321 rows, re-counted on this branch. The recorded figures, **24 built / 8 partial / 289 planned**, match the 1.5R report, but 7 rows are wrong (item 6).
- **Code:**
  - contracts: entities, permissions, persona, portal, workspace, API;
  - mock transport, handlers, personas, demo store;
  - session, permission gate and preferences;
  - both apps' routes and navigation;
  - tokens (including the hidden night palette).
- **Stage 1.5R evidence:** screenshots, used for item 6's design-flaw list.

## Detail documents (this folder)

| File | Gate A output |
|---|---|
| `A1_PRODUCT_MAP_AND_ENTITLEMENTS.md` | 1. product map + two demo tenants; 3. module entitlement and dependency table; access model |
| `A2_NORMALIZED_ERD.md` | 2. normalized logical ERD, platform/tenant boundaries, invariants, V2.1↔V3.1 conflicts |
| `A3_PRICING_AND_METERING.md` | 4. operator pricing rule matrix, worked examples, metering policy |
| `A4_DUES_COLLECTIONS_AND_SETTLEMENT.md` | 5. community dues and collections workflows, bank/merchant destination map |
| `A5_SCREEN_RECONCILIATION.md` + `screen-register-v3.1-proposed.csv` | 6. de-duplicated register diff with built status; design flaws |
| `A6_MOCK_CONTRACTS.md` | 7. proposed mock types, services, endpoints |
| `A7_GATE_B_C_PLAN.md` | 8. Gate B and C bounded plans with acceptance checks |
| This report | 9. decisions and risks; 10. approval request |

## 1. Product map and the two demo tenants (A1)
- **Three planes, four apps.**
  - Platform HQ (Supreme Admin) works on the central DB only.
  - The backoffice and the resident PWA work on one DB per tenant.
  - Public sites read published data only.
- **The two demo tenants**

| | Larkspur Estates (Demo) | Al-Noor Residency (Demo) |
|---|---|---|
| Edition | Full Developer | Maintenance-only society |
| Status | Exists today | New in Gate C |
| Modules | All modules, so its UI is unchanged | No CRM, projects, sales or construction |
| Size and money | Two projects, as today | 80 flats in 2 blocks; dues paid to the association's own verified account |
| Use in the demo | Developer journeys, as built in Stage 1.5R | Reproduces the owner's PKR 18,700 / 3,700 platform pricing example and the A-101 PKR 5,200 statement |

## 2. Normalized ERD and boundaries (A2)
Key corrections to the logical model:
- **The site is the root; a project attaches to a site.** Society flats have no foreign key to projects or bookings.
- **Unit status splits into three independent dimensions:**
  - inventory (sales, developer only);
  - delivery (construction / handover);
  - occupancy (derived).
- **Four facts stay separate and effective-dated:** booking ≠ ownership ≠ occupancy ≠ responsible payer. V3.1's `billing_account_units` mixed units and liable parties; they are split.
- **One shared invoice engine** (`source_type`: instalment schedule, billing run, opening balance…) with billing accounts by kind. Instalments and dues never share a balance.
- **Books, payee and numbering are per legal entity.** A portfolio manager's associations never share books or bank, even inside one tenant.
- **Three principal types:**
  - platform operators;
  - global sign-in identities;
  - tenant users linked to people.
- **Personal accessibility settings** live with the global identity. Appearance settings that depend on the tenant live in the tenant DB.
- **Invariants:** 22 are listed (I-1…I-22; I-19 to I-22 added after the review), each with its production enforcement and how the prototype proves it. Among them:
  - no duplicate billing on retry (unique idempotency keys);
  - submitted ≠ paid;
  - immutable snapshots and posted records;
  - maker ≠ checker;
  - no tenant money in the platform's accounts.

## 3. Module entitlements and access (A1 §4–7)
- **Catalogue:** 27 modules (tenant- or site-scoped) with hard and soft dependencies, plus features (e.g., office cash, late fees, SMS).
- **Editions are presets.** Code checks grants, never "is this a society?".
- **Access = intersection of six layers:** tenant status, module grant, site/feature, permission, data scope, workflow state.
- **One pure function `decide()`** is shared by the API, navigation, Ctrl+K, related drawers, Quick create, widgets and tours.
- **Every refusal has a distinct, honest screen.** "Not part of this plan", "not permitted", "not found" and "planned" no longer look the same.
- **Supreme Admin** sees tenant metadata only. Tenant records need an audited, time-limited, consented support grant.

## 4. Pricing and metering (A3)
- **16 component types:**
  - free, trial, one-time, fixed;
  - per site, per building, per unit, per seat, per module/feature;
  - tiered (graduated or volume, declared), usage;
  - discount, minimum, cap, allowance, plus waivers and tax.
- **One calculation order:** discounts come before tax; rounding is per line.
- **Five distinct unit counts:** registered, active, occupied, eligible, licensed capacity.
  - Invoices use **immutable snapshots with evidence**. The evidence lists flat codes, never names.
  - Corrections are adjustment lines, never edits.
- **Worked examples reproduced exactly:**

| Example | Result (PKR) |
|---|---|
| V3.1 example | **18,700 / 3,700** |
| Occupied count | 3,540 |
| Mid-month start | 16,850 |
| Scheduled increase | 4,100 |
| Graduated vs volume tiers | 3,300 vs 2,800 |

- All examples become golden test vectors, reused later as backend contract tests.

## 5. Community dues, collections and settlement (A4)
- **Building setup** is a nine-step checklist rather than one giant wizard. Imports are all-or-nothing and idempotent.
- **Charge rules:** site → building → unit type → unit; "which rule wins" is always visible.
- **Billing run:** DRAFT → PREVIEWED → APPROVAL_PENDING → APPROVED → POSTED → NOTIFIED.
  - maker ≠ checker;
  - idempotent posting;
  - after posting: credit notes and supplementary runs only.
- **Statement:** the carried-forward balance is never an invoice line. A-101: 4,200 + 1,000 = 5,200.
- **Payment choices:** transfer with proof (Gate C), office cash or cheque by policy (Gate C), online mock (Gate D).
  - Allocation is oldest-first with partial payments and unapplied credit.
  - Duplicate bank references are refused.
- **Destination map:** SaaS fees go to the platform; instalments to the developer entity; dues to the association entity. Nothing routes through the platform.
- **Beneficiary (IBAN) changes need two people and a cooling-off.** This guards against the most common real-world fraud.

## 6. Screen register reconciliation (A5 + CSV)

| | Live register | Proposed V3.1 register |
|---|---|---|
| Rows | 321 | 390 (321 kept with stable IDs + 69 new) |
| Distinct screens | 321 | **331** (59 rows are tabs, drawers, steps, merges or supersessions) |
| Built / partial / planned | 24 / 8 / 289 | **28 / 8 / 295** |

- **By gate:** built 20 · **B 16** (+2 extended) · **C 39** (+8 extended) · D 33 · E 145 · F 18 · G 50.
- **Corrections to the live register**
  - Resident tour: planned → built.
  - Hold drawer, unit quick view and portal bank details: planned → partial.
  - Both accessibility-preference screens: built → partial against V3.1.
  - One template error.
  - **7 built screens were never registered:** the entry flow, sign-ins, the More page and the Sales tour.
- **V3.1 critical families, all mapped to register IDs:**
  - Supreme Admin: 22 items, 18 in Gate B.
  - Maintenance-only client: 24 items, 17 in Gate C.
  - Resident PWA: 17 items, mostly Gates C–D.
  - Personalization in all three apps: Gate D.
- **13 design flaws that colour alone will not fix**, from the screenshots. They include:
  - navigation that ignores licensing;
  - a hero-first dashboard;
  - an instalment-only portal;
  - hidden context on phones;
  - clipped quick actions;
  - prototype tools in product navigation;
  - settings split across four places;
  - no text-size control;
  - one-product demo; developer vocabulary;
  - no dense-table pattern;
  - an over-long More page;
  - denial states that look like "planned".
  - Each flaw has a fix and a gate.

## 7. Mock contracts (A6)
- **Typed contracts:** `access.ts`, `platform.ts`, `sites.ts`, `billing.ts`, `payments.ts`.
- **Pure engines** (pricing, charges, billing run, allocation, statement) with golden vectors.
- **About 85 mock endpoints** (19 platform, 58 tenant, 10 portal), each declaring the module and permission it requires.
- **New error codes and domain events.**
- **Compatibility:** existing types and endpoints stay. Larkspur keeps its demo store and gets every grant, so **all 134 E2E tests must pass unchanged**.

## 8. Gate B and Gate C plans (A7)
**Gate B: Supreme Admin journey**
- Create a society tenant → modules with dependency check → hybrid pricing → quote 18,700 / 3,700 → simulated activation.
- Amendment and version history; simulator; preview as a society role with no developer modules; support agent denied.
- Also delivers the access foundation, the HQ app, a reusable `DataTable` and flaw fixes F-1, F-5, F-6, F-12, F-13.
- 14 acceptance checks.

**Gate C: the 80-flat society**
- C.1, setup and billing:
  - import with errors → payers → charges and overrides → billing run (golden total **PKR 355,800**, 79 invoices) with maker ≠ checker and idempotent posting → credit note.
- C.2, collections and resident:
  - resident proof → verification → receipt and statement;
  - partial, over-paid, duplicate, needs-information and rejected paths;
  - office cash rules; reconciliation; dashboards; role and scope denials.
- A short owner checkpoint between C.1 and C.2.
- 19 acceptance checks.

## 9. Decisions requested and risks

### Decisions (my recommendation in **bold**)

| # | Decision | Recommendation | Detail |
|---|---|---|---|
| D-1 | Platform HQ app | **A separate app `apps/platform-hq`**, not a shell inside the backoffice | A1 §1 |
| D-2 | Editions | **Presets of grants; access decided only by grants** | A1 §2 |
| D-3 | Property hierarchy | **Site-rooted; projects attach to sites** | A2 §4 |
| D-4 | Unit status | **Split into inventory / delivery / occupancy** | A2 §4.2 |
| D-5 | Invoicing and entity isolation | **One engine with source types; billing accounts by kind; liability per unit (`unit_liabilities`); line-level allocation; every financial record bound to its legal entity, with cross-entity links impossible** (corrected) | A2 §4–5.1 |
| D-6 | Legal entities | **Books, payee and numbering per legal entity; no commingling inside a tenant** | A2 §9.4 |
| D-7 | Proration and snapshots | **Billed in advance; snapshot at period start; actual-day proration; downgrades next period** | A3 §3 |
| D-8 | Signup and onboarding | **A configurable platform onboarding policy: self-service trial, approval required, invitation only or sales assisted. Get started adapts; the demo stays available** (corrected) | A1 §8 |
| D-9 | Support access | **Tenant-admin consent per grant; read-only; 4 h default, 24 h maximum; visible to the tenant** | A1 §4 |
| D-10 | Tax | **Configured per jurisdiction and legal entity; your tax adviser confirms codes and rates** | A2 §9.4 |
| D-11 | Late fees | **Off by default; only after legal review and bylaws** | A4 §2 |
| D-12 | Society demo name | Keep **"Al-Noor Residency (Demo)"** to match your example, or pick a more distinctive fictional name (real buildings may share it) | A1 §3 |
| D-13 | Beneficiary changes | **Maker-checker + 24 h cooling-off + resident notice** | A4 §6 |
| D-14 | Commercial approvals | **Versioned thresholds (illustrative defaults: discount > 15 %, price > 10 % below the rate card, free beyond 30 days…); pending-approval state and approver ≠ author shown and enforced in the Gate B mock; full production matrix at Gate H** (corrected) | A3 §7.1 |
| D-15 | Collection by a portfolio manager on an association's behalf | **Only with written authority; default off** | A4 §6 |
| D-16 | Payer change mid-period | **Effective next period; a split is a manual staff action** | A4 §8 |
| D-17 | Identity | **One global sign-in per person, with memberships in several tenants** | A2 §9.1 |
| D-18 | Gate C delivery | **Two halves with a short checkpoint after C.1** | A7 C.1 |
| D-19 | Register switch | **The proposed register replaces the live one at the start of Gate B** (with resolver and tests updated together) | A5 |
| D-20 *(new, from correction 5)* | Settlement while suspended | **Allowed by default:** residents may still settle already-issued invoices and finance may verify them. Everything operational is blocked | A1 §4 |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Gate C is large (39 screens + 8 extended) | Template reuse, the C.1 checkpoint, tabs and drawers instead of pages, exclusions listed in A7 |
| R-2 | Mock calculations mistaken for real ones | All money logic in the mock server, labelled; golden vectors become backend contract tests; nothing claims "paid" without verification |
| R-3 | Regressions in the working 1.5R journeys | Larkspur gets every grant; the full 134-test suite is a gate exit criterion |
| R-4 | Legal and regulatory: collecting on behalf, late fees, tax, payment aggregation | Defaults are off or separated; owner's legal and tax advisers before Gate H |
| R-5 | Privacy: the platform operator seeing residents' data | Metadata-only HQ; name-free meter evidence; audited support grants |
| R-6 | Payment-detail (IBAN) fraud | Maker-checker, cooling-off, resident notice, verified-only display |
| R-7 | Bundle growth with a third app and a second tenant | Per-tenant fixtures loaded on demand; the planned dictionary and vendor splitting moves earlier, to Gate B |
| R-8 | Accessibility claims | Dense tables and wizards are tested at 320 px and 200 %. **The manual screen-reader pass from 1.5R is still outstanding**; I recommend one NVDA session before Gate C |
| R-9 | Toolchain | Node 20 has been end-of-life since April 2026 (ADR-0001). Plan the Node 24 upgrade before Gate H |
| R-10 | Two registers until the switch | Only the live one drives the apps. The proposal is generated from it, so it cannot drift silently |

## 10. Approval requested (STOP)
Please confirm or change:
1. The Gate A architecture (items 1–7), including decisions **D-1 to D-19**.
2. The proposed register (`screen-register-v3.1-proposed.csv`) and its switch at the start of Gate B.
3. **Authorization to start Gate B** as scoped in A7 (Supreme Admin journey + access foundation), and the Gate C plan as the next step after Gate B review.

Until then, nothing further is implemented. Stage 2 remains withdrawn, and `main` is untouched.
