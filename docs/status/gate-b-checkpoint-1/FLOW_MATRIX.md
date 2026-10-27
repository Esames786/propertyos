# Gate B checkpoint 1: function matrix (Platform HQ)

**Status key**
- **Working:** the screen and logic are real; the data is fictional.
- **Mock working:** the action changes this tab's demo store through the mock API, and every connected screen shows the change.
- **Simulated:** labelled on screen; nothing real happens.
- **Planned:** the register page exists and says it is planned.

**Persistence.** HQ demo changes live in `sessionStorage` (`demo:platform:v1`). They survive a reload, are discarded when the tab closes, and More → **Reset demo data** clears them. Nothing is sent to anyone.

**Proof** is the automated test that covers the row: `hq` = `tests/e2e/hq.spec.ts`, `vectors` = the unit-test vector files.

## Shell and sign-in

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 1 | Open `/hq` with no identity | Demo sign-in with the three platform identities | As expected; each card says what the identity can do | Simulated (labelled) | `register.spec` (HQ-025), screenshots `hq-sign-in-*` |
| 2 | Choose Supreme Admin | Dashboard; full navigation; Create tenant in the header (desktop) or centre button (phone) | As expected | Working | `hq` AB-1, phone |
| 3 | Choose Platform support | No Create tenant, no simulator; tenant records refused | No Create in header or quick actions; the simulator is not in the menu; records → 403 `support_grant_required` | Working | `hq` AB-9 |
| 4 | Search (Ctrl K) | Tenants, requests and HQ screens the identity may open | As expected | Working | screenshots; palette shared with backoffice (`command-palette.spec`) |
| 5 | English ⇄ اردو | Mirrored layout; entries kept | As expected, also in the middle of the wizard | Working | `hq` AB-12 |
| 6 | Phone: bottom bar, centre Create, More | Four destinations and a raised Create; More lists areas, identity switch, reset, sign out | As expected; no sideways scrolling | Working | `hq` phone |
| 7 | More → View the demo as → another identity | Switches identity; that identity's first-login welcome appears once | As expected | Simulated (labelled) | `hq` AB-15 |
| 8 | More → Reset demo data | Demo tenants, drafts and approvals return to the seed | As expected | Mock working | `platform.test.ts` (reset) |

## Dashboard (HQ-001)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 9 | Figure cards (MRR, ARR, paying, trials, approvals, flats) | Calculated from the tenants; each opens the filtered list | MRR Rs 59,780.00 from the seed; Awaiting approval opens `?status=awaiting_approval` | Working | `hq` dashboard |
| 10 | Needs your attention → Kestrel (approval) | Opens the tenant summary at its approval | Opens `?tenant=tnt_kestrel` with the reason "A discount of 20 % is above the 15 % limit." and Approve | Working | `hq` dashboard |
| 11 | Quick actions | Create tenant, simulator, approvals, requests, tenants; filtered by permission | As expected | Working | `hq` AB-9 |
| 12 | Onboarding policy panel | Shows the current D-8 policy and what Get started offers | Shows *Approval required* and the four modes | Working (display) | screenshots |
| 13 | Platform billing chart | 12 months with a data table | Illustrative seed history | Simulated (labelled) | screenshots |

## Tenants (HQ-002) and summary (HQ-004, partial)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 14 | Status / edition / sort / search | Filters the list; kept in the address | As expected; survives reload | Working | `hq` filters |
| 15 | Workspace requests tab | Seeded requests by kind (approval, sales, trial) | As expected, read-only | Working (read-only) | `hq` filters |
| 16 | Open a tenant | Summary drawer: status, sites, modules, contract, quote, history | As expected | Working | `hq` AB-1 |
| 17 | Summary → Simulate pricing | Simulator starts from this tenant's contract | Opens `/hq/simulator?tenant=…` with the tenant's contract (Rs 3,700.00 a month for Al-Noor) | Working | `hq` AB-1 |
| 18 | Summary → Tenant 360 | Planned page | Opens the HQ-004 planned page | Planned | not automated (parameterised route) |

## Create tenant (HQ-003)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 19 | Choose an edition | Preset modules and rate card | Community → 12 modules, Al-Noor rate card | Working | `hq` AB-1 |
| 20 | Organisation with missing fields → Continue | Error summary and field errors; focus moves to the summary | As expected | Working | `hq` axe (error state scanned) |
| 21 | Sites: flats and buildings | Counts feed the declared quantities | 80 flats → 80 eligible flats in the quote | Working | `hq` AB-1 |
| 22 | Switch off Receivables | Continue disabled; plain explanation | "Community dues needs Receivables." | Working | `hq` AB-3 |
| 23 | Add Receivables (one click) | Requirement met; Continue enabled | As expected | Working | `hq` AB-3 |
| 24 | Site-scoped module → choose sites | Entitlement saved per site | As expected | Mock working | `platform.test.ts`, vectors (site add-on) |
| 25 | Pricing: change a price, add a component, schedule a price change | Live price re-priced on the server | As expected; the old version ends on the date the new one starts | Working | vectors (scheduled price change); screenshots |
| 26 | Counts: declared estimates | Marked as estimates; drive the quote | As expected | Working | screenshots |
| 27 | Tax code, minimum, cap, discount with reason | Applied by the engine; a discount needs a reason | As expected; Continue shows a field error until the reason is filled. The mock server refuses the same save without a reason, and the wizard lists and focuses its refusal | Working | vectors; `hq` AB-15; `hq` server refusal; `validation.test.ts` |
| 28 | Quote | First invoice, next invoice, typical month, first-year value, 12 periods, breakdown | Al-Noor: 18,700.00 / 3,700.00 / 59,400.00 | Working | `hq` AB-1/2 |
| 29 | Refresh or Back mid-wizard | Entries kept (server draft, step in the address) | As expected | Mock working | `hq` draft |
| 30 | Review → Edit a section | Returns to that step, then back to review | As expected; the review shows the change | Working | `hq` review → Edit |
| 31 | Review → Activate demo tenant | Confirmation states the effect; tenant created active (or trial) | "Al-Noor Residency (Demo) is set up"; appears in the list, dashboard and search | Simulated (labelled) | `hq` AB-1 |
| 32 | Activate twice (double click, retry) | One tenant | Idempotent | Mock working | `platform.test.ts` |
| 32a | Phone or tablet: edit prices on a long step | The live price stays in view | A compact price bar stays pinned under the header (first invoice, typical month, policy badge) | Working | `hq` phone price bar |
| 32b | Every step at 320 px and 200 % zoom | No sideways scrolling | As expected (two overflows found and fixed, see `test-results.md`) | Working | `hq` AB-12 reflow |

## Commercial approvals (D-14)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 33 | 20 % discount | Live price and quote say *Needs commercial approval*, with the reason | As expected | Working | `hq` AB-15 |
| 34 | Review → Submit for approval | Tenant *Awaiting approval*; not billed | As expected | Mock working | `hq` AB-15 |
| 35 | Requester opens it | "You requested this approval, so another approver must decide it."; no Approve | As expected; the server also refuses, comparing principal IDs (a renamed maker is still refused; another person with the same name is not) | Working | `hq` AB-15; `platform.test.ts`; `validation.test.ts` |
| 36 | Approver → Approve | Tenant active; history records who approved | "Approved by Ayesha Siddiqui"; "Contract approved for Kite Gardens Society (Demo)" | Mock working | `hq` AB-15 |
| 37 | Approver → Return without a comment | Refused; a comment is required | As expected | Mock working | `platform.test.ts` |

## Pricing simulator (HQ-013)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 38 | Open | V3.1 example: 18,700.00 / 3,700.00 | As expected | Working | `hq` AB-6 |
| 39 | Occupied flats (76) | 3,540.00 a month; the change against the start | As expected | Working | `hq` AB-6 |
| 40 | 100 flats | 4,500.00 a month | As expected | Working | `hq` AB-6 |
| 41 | Discount slider beyond 15 % | Approval notice appears | As expected | Working | video 1 |
| 42 | Any what-if | Nothing saved | Store write counter unchanged | Working | `hq` AB-6 |
| 43a | Phone: price bar → See the results | Moves to the results and focuses them | As expected | Working | `hq` phone price bar |

## Foundations

| # | Item | Status | Proof |
|---|---|---|---|
| 43 | `decide()`: six layers, suspension classes (D-20), future-dated grants, maker ≠ checker | Working (library) | `access.test.ts`, 37 vectors |
| 44 | Pricing engine | Working | `pricing.test.ts`, 23 vectors |
| 45 | Commercial policy check (six rules) | Working | vectors (approval cases) |
| 46 | V3.1 register adopted; V2.1 IDs and routes preserved | Working | `npm run register:sync -- --check`; `register.spec` (355 addresses) |
| 47 | HQ tour (HQ-TOUR-001, 8 steps) | Working | `hq` tour (1440, 390, 320) |
