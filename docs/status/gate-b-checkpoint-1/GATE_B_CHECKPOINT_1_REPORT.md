# Gate B, checkpoint 1: Platform HQ shell, tenant creation and pricing simulator

**Status: built; STOPPED FOR OWNER REVIEW.** The rest of Gate B has not been started, and Gate C has not been started.

**What this checkpoint is**
- It follows the owner's Gate A decision: *"Implement the foundational HQ shell, tenant-creation flow and pricing simulator first … STOP FOR OWNER REVIEW BEFORE EXPANDING INTO THE REST OF GATE B."*
- The scope is A7 §B.5b, items 1–6.
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched.
- **Not done, as instructed:**
  - no real payment gateway;
  - no backend, no database migration, no real provisioning, email or SMS;
  - no merge.

**Data.** Every organisation, person, phone number and amount is fictional. PropertyOS is a codename.

## 1. How to try it

| Step | What to do |
|---|---|
| Start | `npm run dev`, then open **http://localhost:5175/hq**. `npm run dev:hq` starts HQ on its own |
| Sign in | Demo sign-in. Choose **Hamza Qureshi (Supreme Admin)**, **Ayesha Siddiqui (Commercial approver)** or **Iqra Rana (Platform support)** |
| Owner's example | **Create tenant** → Community → "Al-Noor Residency (Demo)" → 80 flats → Continue through the steps. The live price shows **Rs 18,700.00** for the first invoice and **Rs 3,700.00** for a typical month |
| Approval path | Add a **20 %** discount in *Tax and discounts*. The quote says *Needs commercial approval*, and the result is *Waiting for approval*. Switch to Ayesha (More → View the demo as), open the tenant and choose **Approve** |
| Simulator | **Pricing simulator** in the sidebar. Change flats, unit basis, dates, prices, tiers or discount. Nothing is saved |
| Reset | More → **Reset demo data**. Closing the tab also discards demo changes |

The other two apps run as before: backoffice on 5173, customer portal on 5174.

## 2. The six Gate A corrections

All six are made in the Gate A documents (see the table at the top of [`GATE_A_REPORT.md`](../../blueprint/v3.1/gate-a/GATE_A_REPORT.md)). This checkpoint makes the following of them real in code.

| # | Correction | In the documents | In this checkpoint's code and UI |
|---|---|---|---|
| 1 | D-5 financial entity isolation | A2 §3, §5.1, I-19; A4 §5.4 | Contract only: the `cross_entity_forbidden` error is in the mock contracts (A6). Tenant finance screens are Gate C |
| 2 | Per-unit payer on multi-flat billing accounts; no account-wide percentages | A2 §4.4–4.5, I-5, I-18; A4; A6 §4 | Contract only (`UnitLiability`). Gate C |
| 3 | D-8 signup modes (self-service trial, approval required, invitation only, sales assisted) | A1 §8; A2; A6 §3 | **HQ shows the current policy** on the dashboard, and the seeded workspace requests (approval, sales, trial) in Tenants → Workspace requests. **Not yet:** Get started adapting to each mode in the backoffice. It is listed for after this review (A7 §B.5b) |
| 4 | D-14 commercial approvals shown and enforced | A3 §7.1; A2 I-22; A6 §3 | **Built.** Six policy rules are checked on the server for every quote. The reasons appear in the live price, the quote and the review. Activation becomes *Awaiting commercial approval*. The requester cannot decide; another person holding `platform.contracts.approve` approves, or returns the contract with a required comment. Dashboard, tenants list and summary all show the waiting state |
| 5 | Suspended tenants: financial-history reads, policy-controlled settlement, operational changes blocked | A1 §4; A3 §3; A2 I-21; A6 §2; D-20 | **Built in the shared access rule** `decide()`, with 7 suspension test vectors. HQ shows the suspended tenant (Cedar Hills) as *financial history only*. Applying `decide()` across the backoffice menus and handlers comes after this review |
| 6 | Bank transaction dedupe by account + provider identity (or import fingerprint); maker-checker and verified beneficiaries kept | A2 §5.2, I-20; A4 §5.1; A6 §4 | Contract only. Gate C |

## 3. What was built

### 3.1 Platform HQ app (`apps/platform-hq`, port 5175)
- **Its own app**, separate from the backoffice (D-1).
- **Shell:** sidebar, header, phone bars and More page, reusing the shared shell. The header shows a **Central platform** chip so operators know they are not inside a tenant.
- **Search:** finds tenants, workspace requests and HQ screens.
- **Also in the shell:** notifications, help and tours, preferences, English/اردو.
- **Sign-in:** demo sign-in for the three platform identities.
- **Permissions:** each identity sees only the navigation, quick actions and Create buttons its permissions allow. Platform support has no Create tenant and no simulator.
- **Tenant records:** HQ never reads them. Every `/platform/tenants/:id/records/*` call is refused with 403 `support_grant_required`.

### 3.2 HQ dashboard (HQ-001)
- **Greeting** and the as-of date.
- **Six figures:** MRR with change, ARR, paying tenants, active trials, awaiting approval, flats under management. Each opens the filtered list.
- **Needs your attention:** approvals, trials ending, grace, suspended, new requests.
- **Also on the dashboard:**
  - quick actions;
  - onboarding policy (D-8);
  - platform billing (12 months, illustrative, with a data table);
  - tenant mix;
  - module adoption;
  - trials and requests;
  - recent activity.

### 3.3 Tenants (HQ-002) and tenant summary (part of HQ-004)
- **Filters:** search, status, edition and sort, all kept in the address. They survive a reload and Back.
- **Layout:** a table on desktop, cards on phones.
- **Workspace requests tab:** read-only list.
- **Summary drawer:**
  - status and billing state;
  - legal details;
  - sites with flat counts;
  - modules;
  - the contract and its quote;
  - the approval panel (approve or return);
  - history.
- **Not yet:** the full **Tenant 360** workspace, which is after this review.

### 3.4 Create tenant wizard (HQ-003, with HQ-005, HQ-011, HQ-012, HQ-016)

| Step | What it does |
|---|---|
| 1. Type and edition | Developer, Community, Portfolio or Custom. Each preset switches on its modules and rate card |
| 2. Organisation | Names, city, language, contact. Validation with an error summary |
| 3. Sites | One or more sites with kind, city, buildings and flats |
| 4. Modules and site entitlements | Live dependency check on the server. Missing requirements block Continue and are explained in plain words; **one click adds them**. Site-scoped modules choose their sites |
| 5. Pricing | The full pricing builder (§4). The live price is beside it and is always priced by the server |
| 6. Usage and counts | Declared counts per dimension (eligible / occupied / registered flats, sites, buildings, seats, SMS…), marked as estimates until meters exist |
| 7. Tax and discounts | Tax code (illustrative), contract minimum and cap, discounts with a required reason |
| 8. Quote | First invoice, next invoice, typical month, first-year value, the 12-period schedule and the line breakdown, plus the approval check |
| 9. Review | Every section with an Edit link. Confirmation says exactly what happens. The result is **simulated activation** (active or trial) or **Awaiting commercial approval** |

- **Server-side drafts:** each step is saved as a draft on the mock server. The draft and step are in the address, so a refresh, Back or a language switch keeps every entry.
- **Repeat clicks:** activation is idempotent.
- **Live price placement:** beside the form on wide screens. On phones and tablets, a compact price bar stays pinned under the header while you edit.

### 3.5 Pricing simulator (HQ-013)
- **Starting points:** the V3.1 example (Al-Noor), any tenant's contract, or an edition's rate card.
- **What-ifs:** flat count (slider and field), unit basis (eligible / occupied / registered), sites, seats, SMS, start date, billing frequency, a quick discount, and the full builder.
- **Results:** first invoice, typical month, first-year value and the change against the starting point. A 12-period chart compares the scenario with the baseline, with a data table. The approval check is included.
- **Phones:** the results come after the controls, so a pinned price bar shows the two key amounts as you change them, with **See the results** to jump down.
- **Never writes.** The E2E test confirms the mock store's write counter is unchanged after many what-ifs.

### 3.6 Foundations (A7 §B.5b item 6)
- **Access rule `decide()`** (`packages/contracts/src/access.ts`):
  - six layers: tenant status and suspension class, module grant with effective dates, site/feature, permission, scope, record state (locked, maker ≠ checker);
  - **37 shared test vectors**.
- **Pricing engine** (`packages/fixtures/src/platform/pricing.ts`):
  - integer paisa, month-aligned billing periods, proration by actual days;
  - discounts before tax, minimum/cap adjustments, tax per line;
  - rounding half away from zero;
  - **23 golden vectors**.
- **Commercial policy check:** six rules (A3 §7.1).
- **V3.1 screen register adopted atomically** (D-19):
  - `docs/ui/screen-register.csv` is now the V3.1 register: 390 rows, 331 distinct screens;
  - the V2.1 register is archived in `docs/ui/archive/`;
  - the sync script refuses a register that drops or moves any of the 321 V2.1 IDs or routes;
  - the E2E suite opens all 355 openable addresses.

## 4. Pricing: what the owner asked for and what exists

| Asked for | Status | Where to see it |
|---|---|---|
| Free | Working | `FREE` component; open-ended free needs approval beyond 30 days (vector) |
| One-time | Working | Onboarding fee in every preset |
| Fixed recurring | Working | Base platform fee |
| Per eligible flat/unit | Working | `PER_UNIT` with a chosen basis: eligible, occupied, registered, active or licensed capacity |
| Per site / per building | Working | `PER_SITE`, `PER_BUILDING` |
| Per user | Working | `PER_SEAT` (active staff seats) |
| Per module | Working | `PER_MODULE`, scoped to chosen sites |
| Tiered | Working | Graduated or volume bands, editable |
| Usage | Working | `USAGE` per unit used, with an included allowance |
| Hybrid | Working | Any mix of the above in one contract |
| Discounts | Working | Percent or fixed, on recurring or one-time components, with dates and a required reason |
| Caps and allowances | Working | Contract minimum and cap per month; usage allowance |
| Trial | Working | 30-day trial toggle; charges, including onboarding, start when the trial ends |
| Quantity changes | Working | Counts step and simulator; the price updates live |
| Effective dates and versioned rates | Working | Each component has *effective from / until*. "Schedule a price change" adds the next version from a later date. The rate card and commercial policy carry versions |
| Non-mutating what-ifs | Working | The simulator (§3.5) |
| Amending an active contract (version 2) | **Not yet** | After this review (AB-5) |

**Owner's example, verified on screen and in the vectors**

| Figure | Amount |
|---|---|
| First invoice | Rs 18,700.00 (onboarding 15,000 + 80 flats × 40 + 1 site × 500) |
| Typical month | Rs 3,700.00 |
| First-year value | Rs 59,400.00 |
| Counting occupied flats instead (76) | Rs 3,540.00 a month |
| Price change to Rs 45 a flat from 1 Jan 2027 | Rs 4,100.00 a month from then |
| Mid-month start | Prorated by actual days |

## 5. Working vs simulated vs planned (exact list)

**Key**
- **Working:** real logic running in the prototype, on fictional data.
- **Mock working:** the change is saved in this tab's demo store, and every connected screen shows it.
- **Simulated:** labelled on screen; nothing real happens.
- **Planned:** the register page exists and says so.

| Function | Status | Notes |
|---|---|---|
| HQ shell, navigation, phone bars, More, search, help, tours, preferences, EN/UR | Working | |
| Demo sign-in and identity switch (3 platform identities) | Simulated | No real sign-in or MFA (Gate H) |
| Permission-aware navigation, quick actions and Create buttons | Working | Platform permissions only. The backoffice is unchanged so far |
| Mock server permission checks; tenant-record denial (403) | Working | |
| Dashboard figures (MRR, ARR, paying, trials, approvals, flats) | Working | Calculated from the demo tenants; they change when you add one |
| Platform billing chart and outstanding amount | Simulated | Illustrative seed history; no central invoices yet (HQ-017, not in Gate B) |
| Needs your attention list | Working | Built from tenant state, trials, approvals and requests |
| Onboarding policy panel (D-8) | Working (display) | Shows the policy; changing it and Get started variants are after this review |
| Tenants list: filters, sort, URL state, table/cards | Working | |
| Workspace requests tab | Working (read-only) | Seeded requests; convert, approve and decline come later |
| Tenant summary drawer | Working | Full Tenant 360 is after this review |
| Create tenant wizard and draft saving | Mock working | Drafts live in the tab's demo store |
| Dependency check and one-click fixes | Working | Server-side check |
| Site-level module entitlements | Mock working | Saved on the draft and the tenant |
| Pricing builder, live price, quote, 12-period schedule | Working | Priced by the mock server's engine; never in the page |
| Tax codes | Simulated | Illustrative codes and a demo 10 % rate; real codes come from the owner's tax adviser |
| Commercial policy thresholds | Working (illustrative values) | The rules are real; the numbers (15 %, 10 %, 30 days, 50 %, 36 months, Rs 25,000) are placeholders for the owner |
| Activation (active or trial) | Simulated | Creates the tenant in the demo store. No database, provisioning, email or invoice |
| Awaiting approval → approve / return with comment | Mock working | Maker ≠ checker enforced on the server |
| Pricing simulator | Working | Never writes (tested) |
| HQ tour (8 steps) and tour library | Working | |
| Access rule `decide()` | Working (library + tests) | Not yet wired into backoffice menus and handlers |
| Tenant 360, View As Client, catalogue page, dependency matrix, rate-card page, meters, amendments | Planned | Each opens its planned page with its register ID |
| Get started signup-mode variants (backoffice) | Planned | After this review |

## 6. Evidence

**Screenshots** (`screenshots/`, 126 files)
- Each screen is captured in English and Urdu, at 1440 px and 390 px.
- **Screens:** sign-in, dashboard (viewport and full page), tenants, tenant summary with an approval, workspace requests, every wizard step, the dependency problem, done, review with approval reasons, done (waiting for approval), the requester's own approval, simulator and simulator what-if, a planned page, More (phone).
- **Tour:** every step of the HQ tour.
- **Naming:** `hq-<screen>-<width>-<lang>.png`.
- **Full-page phone captures** show the floating top and bottom bars part-way down the image. That is how the capture tool stitches fixed bars; on a phone they stay at the screen edges.

**Videos** (`video/`, MP4)

| File | Shows |
|---|---|
| `hq-create-tenant-and-simulate-desktop-en.mp4` (50 s) | Dashboard → create Al-Noor through all nine steps → activate → summary → simulator what-ifs (occupied flats, discount up to the approval line) |
| `hq-commercial-approval-desktop-en.mp4` (39 s) | 20 % discount → awaiting approval → the requester cannot approve → switch to the commercial approver → approve → active |
| `hq-phone-ur.mp4` (37 s) | Urdu, 390 px: dashboard, the full wizard, simulator, More |

**Tests and accessibility:** see [`test-results.md`](test-results.md). **Function-by-function proof:** see [`FLOW_MATRIX.md`](FLOW_MATRIX.md).

## 7. Known limitations (honest list)
- **Bundle growth.** The shared chunk grew in every app, because the V3.1 register and the new `platform` dictionary ship in all three apps (details in `test-results.md`). Loading dictionaries per app and per language is still planned for Stage 6.
- **Separate demo data.** HQ's demo data is separate from the backoffice's. A tenant created in HQ does not yet appear as a workspace in the backoffice; that arrives with View As Client and provisioning.
- **Browser coverage.** Chromium only.
- **Screen reader.** No manual screen-reader pass yet (AB-14, NVDA + Chrome). The automated axe scans are not a substitute.
- **Illustrative values.** Commercial thresholds, tax codes and rate-card prices are placeholders for the owner to replace.

## 8. After review: the rest of Gate B (not started)
1. Tenant 360 workspace (HQ-004), with grants (HQ-008), usage and meter evidence (HQ-014/015, AB-7) and audit (HQ-019).
2. View As Client / preview as a tenant role (HQ-009, AB-8): a safe preview with no tenant records and no unrestricted impersonation.
3. Access foundation across the backoffice menus, quick actions, search, linked records and handlers, with access outcome pages (GLOBAL-012) and "Your plan & modules" (ADM-023).
4. Get started signup-mode variants (AB-17).
5. Module catalogue and dependency matrix (HQ-006/007), read-only rate card (HQ-010).
6. Contract amendment to version 2 (AB-5) and the module-disable impact report (AB-4).
7. The manual NVDA pass (AB-14).

## 9. Decisions the owner may want to make at this review
1. **Commercial policy numbers.** Confirm or replace the six illustrative thresholds (§5).
2. **Community base fee.** The Community rate card's base platform fee is Rs 0, so Al-Noor matches the V3.1 example exactly. Should it stay as a visible Rs 0 line, or be hidden?
3. **Order of the post-review work** (§8). Suggested order: 3, then 1, then 2, then 4–7. Applying access across the backoffice first makes Tenant 360 and View As Client safe to build on.
