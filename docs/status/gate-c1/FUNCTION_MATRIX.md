# Gate C.1 — function matrix

Owner approval of Gate B (commit `7140ee0`) authorised **Gate C.1: Society Setup + Monthly
Maintenance Billing** (A7 §C.1). Each requirement, where it is built, how it is tested and where the
evidence is. Paths are relative to the repository root. Screenshots:
`docs/status/gate-c1/screenshots/<name>-<width>-<en|ur>.png`; videos: `docs/status/gate-c1/video/*.webm`.

## 1. The C.1 workflow (owner's list)

| # | Requirement | Built in | Tests | Evidence |
|---|-------------|----------|-------|----------|
| 1 | Society demo onboarding and guided tour | Get started → **Explore the society demo** (`GetStartedPage.tsx`); demo chooser, society roles and *Start before setup* (`demo/RoleStep.tsx`, `entry.ts`); society preparation (`PreparingStep.tsx`, `POST /society/demo`); society first tasks (`ReadyStep.tsx`); building-manager tour `SOCIETY-TOUR-001` / GUIDE-008 (`packages/ui/src/onboarding/tours/society.ts`) | `society.spec` AC-1 (from Get started), AC-18 (tour: guided step completes when the preview is generated) | `entry-get-started-society-choice-*`, `entry-society-roles-*`, `entry-society-ready-*`; video `society-onboarding-to-79-posted-invoices-desktop-en` |
| 2 | Site / building / block / floor / flat explorer | SITE-001 `SitesPage`, SITE-002/008 `SiteWorkspace` (checklist), SITE-003 `StructurePage` (floors tree and list), SITE-005 `UnitTypesPage`; header site chip (GLOBAL-013) | `society.spec` (axe, reflow, keyboard) | `sites-*`, `site-360-checklist-*`, `structure-tree-*`, `structure-list-block-a-*`, `unit-types-*` |
| 3 | Import and validation of 80 flats | SITE-004 `ImportPage` (upload → check and fix → all-or-nothing → done); validator `society/import.ts`; server-held import session (`/sites/:id/flat-imports…`) | `society.test` (3 errors, 2 duplicates, suggestions reproduce the register, fingerprint); `society.api.test` (refused with errors, duplicates must be acknowledged, re-run creates nothing); `society.spec` AC-1, AC-17 (Urdu mid-import) | `import-upload-*`, `import-review-3-errors-2-repeats-*`, `import-done-80-flats-*`, `import-rerun-creates-nothing-*` |
| 4 | Owner / occupant / responsible-payer relationships | Model `society/model.ts` (ownership, occupancy and liability as separate effective-dated facts; liability per flat); Flat 360 tabs; CUS-001/003, RES-002; BILL-002 per-flat liability; change of payer from a month (`POST /sites/:id/units/:id/payer`) | `society.test` (A-102 four facts, A-201/A-202 split, payer change keeps October); `society.api.test` (AC-3); `society.spec` AC-3 | `flat-a102-ownership-occupancy-*`, `flat-a202-payer-and-account-*`, `person-sana-iqbal-tenant-payer-*`, `units-and-payers-*`, `flat-b204-change-payer-drawer-*`; video `flat-360-connected-records-payer-change-desktop-en` |
| 5 | Opening balances | SITE-007 `OpeningBalancesPage`: import → total → approval by someone other than the importer → opening-balance invoices dated as of go-live | `society.api.test` (importer cannot approve; A-101 PKR 1,000); `society.spec` AC-1 | `opening-balances-approved-*`, `invoice-opening-a101-*` |
| 6 | Recurring charge rules, overrides and exemptions | BILL-003 `ChargesPage` (versions by month), BILL-004 `RulesPage` (site defaults, block / type / flat overrides, new versions, *which rule wins*), BILL-009 `ExemptionsPage` (request → approval by someone else); engine `society/charges.ts` | `society.test` + `dues.vectors.json` (A-101, A-501, B-508, A-108, B-407); `society.api.test`; `society.spec` AC-1 | `charges-and-rates-*`, `charge-rules-which-rule-wins-*`, `charge-rules-site-defaults-*`, `charge-rule-override-drawer-*`, `exemptions-*`, `b-flat-a501-which-rule-wins-*` |
| 7 | Monthly billing preview, approvals and posting | BILL-005 `RunsPage`, BILL-006 `NewRunPage`, BILL-007/008 `RunWorkspace` (summary, flats, exceptions, approval, posting, history); engine `society/billing-run.ts` | `society.test` (79 / PKR 355,800, idempotent post, deterministic hash); `society.api.test` (state path, stale preview, maker ≠ checker by principal, duplicate period, double post); `society.spec` AC-1, phone/Urdu, keyboard | `c-runs-calendar-*`, `c-new-run-*`, `c-run-previewed-summary-*`, `c-run-previewed-flats-*`, `c-run-waiting-manager-cannot-approve-*`, `c-run-treasurer-approves-*`, `c-run-posted-idempotent-*`, `c-run-notified-read-only-*`; video `billing-run-maker-checker-phone-ur` |
| 8 | Invoice and statement drilldowns | FIN-002 society invoices (`SocietyInvoicesPage`), FIN-003 `InvoiceWorkspace`; statement engine `society/statement.ts`; `StatementView` (previous + charges − credits = total payable) in Flat 360, Person 360 and the account | `society.test` (A-101 1,000 + 4,200 = 5,200; tenant-payer statement); `society.spec` AC-8 | `invoices-november-79-*`, `invoice-a101-november-no-edit-*`, `b-flat-a101-statement-*` |
| 9 | Flat 360 with connected contextual tabs | SITE-006 `FlatWorkspace` (reference experience B): chain Block → Floor → Flat → Owner / Occupant → Payer → Charges → Invoice → Statement; floor neighbours; related drawer; tabs | `society.spec` (axe for every tab, keyboard finder) | `b-flat-a102-overview-*` (desktop, tablet, phone; EN and UR) |
| 10 | Read-only posted history, credit-note correction and audit | No edit endpoint (`PATCH /billing/invoices/:id` → 409 `state_locked`); BILL-014 credit-note drawer; run read-only after posting; audit trail (`/society/audit`) in Flat 360, Site 360 and the run | `society.api.test` (edit refused; credit note; statement shows both); `society.spec` AC-1 step 7 | `credit-note-drawer-*`, `invoice-a101-credited-*`, `statement-a101-with-credit-note-*`; video `credit-note-correction-desktop-en` |

## 2. Golden scenario

| Fact | Required | Where it is proved |
|------|----------|--------------------|
| 80 registered flats | 80 | `society.test` register; `society.spec` import done `data-created=80`; dashboard occupancy |
| A-108 exempt | approved exemption, assessed at zero and listed | `dues.vectors.json`; run exceptions tab |
| 79 invoices | 79 | `society.test`, `society.api.test`, `society.spec` (`/billing/invoices?period=2026-11` → 79) |
| November charges | PKR 355,800 | same; run totals screenshot |
| A-101 opening arrears | PKR 1,000; statement 1,000 + 4,200 = 5,200 | `society.test` statement vector; `society.spec` AC-8 |
| Buyer ≠ owner ≠ occupant ≠ payer | A-102: no booking; owner Tariq Mehmood; occupant and payer Sana Iqbal | `society.test`; Flat 360 *Ownership and occupancy* tab (sale/booking: none) |
| Per-unit payer responsibility | A-201 (owner) and A-202 (tenant) on one account, billed separately | `society.test` (two invoices); account statement per payer |
| SaaS unit meters separate | society charges only maintenance / security / lift / water; platform usage is not served by the tenant plane | `society.api.test` "society charges stay apart from SaaS unit meters" |
| Deterministic, idempotent, permission-aware, testable via the mock API | assessment hash stable; post twice → same invoices; every endpoint declares module + permission + suspension | `society.test`, `society.api.test`, `security.test` (every handler declares its access) |
| Manager cannot approve own run | refused by principal | `society.api.test` (also a person holding both permissions); `society.spec` |
| No posted bill silently edited | no edit path; credit notes | `society.api.test`; `society.spec` |

## 3. Mandatory connected UX

| Requirement | Built in | Evidence |
|-------------|----------|----------|
| Building → Floor → Flat → Owner/Occupant → Payer → Charges → Invoice → Statement without sidebar searching | Flat 360 chain (three groups: Where · Who · Money); breadcrumbs to block and floor; floor neighbours; flat finder (dashboard, Site 360, explorer); statement and invoices one tab away | `b-flat-a102-overview-*`; video `flat-360-connected-records-payer-change-desktop-en` |
| Contextual tabs | Flat 360, Site 360, run workspace, account, person (tabs in the address) | screenshots |
| Related-record drawers | Flat 360 *Everything connected* (`RelatedDrawer`, access-checked links); per-flat *why* drawer in the run | `run-item-drawer` axe scans |
| Permission-aware actions | server-decided run actions with the reason shown (`BillingRunDetail.actions`); maker-checker messages; guard sees nothing financial | `c-run-waiting-manager-cannot-approve-*`, `guard-*` |
| Saved filters | filters and search in the address (accounts, invoices, people, roster, run flats, explorer); dashboard figures open pre-filtered lists | `billing-accounts-arrears-*` |
| Intelligent dropdowns | flat finder and flat picker (with or without the dash; shows who pays) | keyboard test |
| Validation and loading / error / success feedback | server problems listed per field (`ProblemAlert`), toasts and live announcements, skeletons, *nothing was changed* on refusal | `import-review-*` |

## 4. Reference experiences (reviewed at desktop, tablet and phone, EN and UR)

| Experience | Screens | Screenshots |
|------------|---------|-------------|
| A. Society Dashboard | HOME-001 society composition | `a-dashboard-ready-{1440,768,390}-{en,ur}`, `a-dashboard-posted-…`, `dashboard-fresh-before-setup-…` |
| B. Flat 360 | SITE-006 | `b-flat-a102-overview-…`, `b-flat-a501-which-rule-wins-…`, `b-flat-a101-statement-…` |
| C. Monthly Billing Workspace | BILL-005/006/007/008 | `c-runs-calendar-…`, `c-new-run-…`, `c-run-previewed-…`, `c-run-waiting-…`, `c-run-treasurer-approves-…`, `c-run-posted-idempotent-…` |

## 5. Rules that carry over

| Rule | How it holds in C.1 |
|------|---------------------|
| Fictional data only | +92 399 phones, no CNICs in the register, `example.com`, IBAN bank code `DEMO`, organisation names carry "(Demo)" |
| Tenant, site, legal-entity and payer isolation | society data only in Al-Noor's dataset; every record checked with its site and legal entity; payer statements limited to the payer's lines; `society.spec` AC-15 |
| Thresholds configurable, Rs 0 visible | exemption shows the base and the zero amount; A-108 listed at zero |
| Critical validation in the mock server | import, opening balances, rules, exemptions, runs, payer changes and credit notes are all validated server-side and refused with field problems |
| Payment proof never marked paid | no payments in C.1; *Collected this month* says it arrives in C.2 |
| UI-first | no Laravel migrations, no real payments or bank integrations, no financial postings (all in the browser session) |
