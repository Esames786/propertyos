# Gate C.1: test, accessibility and localisation results

**Run date:** 2026-10-28.

**Environment**
- Production builds of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Chromium (Playwright 1.64.1), axe-core 4.13.0.
- Retries **off**. Leftover servers stopped before every run.
- **Chromium only.** Firefox, Edge and Safari/WebKit have not been run (tracked in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **17** namespaces (new: `sites`, `billing`), **4,119 keys** each (Gate B: 15 namespaces, 3,016 keys) |
| Unit and component tests | `npm test` | **531 / 531** in 29 files (Gate B: 501 in 27) |
| Golden vectors | `packages/fixtures/src/society/dues.vectors.json` | 5 flats, run totals, 2 statements, 5 payer facts; all passing |
| Register | `npm run register:sync -- --check` | 394 rows, 335 distinct: **62 built, 18 partial, 255 planned** (Gate B: 47 / 12 / 276); all 321 V2.1 IDs and addresses preserved |
| End-to-end | `npx playwright test --project=e2e` | **218 / 218 on two consecutive full runs** (runs 4 and 5, below). Gate B: 201 |
| Accessibility (inside E2E) | axe in `a11y`, `get-started`, `portal`, `hq`, `access`, `security`, `hq-commercial`, **`society`** | **558 axe scans per run, 15,474 rule passes, 0 violations** (Gate B: 422 / 11,598 / 0). The society spec alone: 136 scans, 3,876 passes, every C.1 screen and overlay in EN/UR at 1440 and 390, each also checked for horizontal overflow |
| Evidence | `npx playwright test --project=evidence tests/evidence/gatec1.evidence.spec.ts` | **18 / 18** (3.6 min): **232 screenshots** and **4 videos** (see the report, §7) |
| Manual screen reader (NVDA) and other browsers | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed**: needs a person running NVDA, and runs in Firefox, Edge and Safari |

## New unit tests

| File | Tests | Covers |
|---|---|---|
| `packages/fixtures/src/society/society.test.ts` | 21 | The register (80 flats; 63 / 12 / 4 / office; 64 standard, 16 penthouse; 8 tenants pay); fictional phones; A-102's four facts and payer history; A-201/A-202 one account, two payers; import of the sample file (3 errors with suggestions, 2 duplicates; fixed rows reproduce the register; re-run finds all registered; stable fingerprint); *which rule wins* vectors; a pending exemption changes nothing; November assessment 80 → **79 invoices, PKR 355,800**, A-108 exempt; **posting twice creates nothing**; one invoice per account and payer; deterministic assessment hash that changes with a rule; statements (A-101 **1,000 + 4,200 = 5,200**; B-407); a tenant-payer's statement holds only their flat; a payer change keeps October with the old payer, and changing again from the same date replaces instead of stacking |
| `packages/fixtures/src/society/society.api.test.ts` | 8 | The whole C.1 storyline through the fail-closed mock API, person by person (import refused with errors, duplicates must be acknowledged, re-run creates nothing; importer can't approve opening balances; requester can't approve an exemption; one open run per period; stale preview blocks submit; the preparer can't approve; double post and retry; notify; edit refused 409; credit note limited to the open amount; statement shows both); payer change; the dashboard's tasks for each person; **maker ≠ checker by principal for a person holding both permissions**; the guard refused everywhere; the treasurer can't prepare and the manager can't issue credit notes; other organisations see nothing of Al-Noor (and the suspended co-operative can read its billing history but not create a run); society charges kept apart from SaaS unit meters |
| `packages/fixtures/src/platform/platform.test.ts` | +1 | The Al-Noor that HQ's wizard creates has the same site and modules as the workspace's Al-Noor |
| `packages/fixtures/src/security.test.ts` | unchanged count | Now also enumerates every new society endpoint: each declares module, permission and suspension class; signed-out → 401, no access → 403, unlicensed module → 403, all before the handler runs |

## End-to-end: `tests/e2e/society.spec.ts` (17 tests)

| Test | Acceptance |
|---|---|
| Storyline, desktop English: Get started → society demo before setup → import (3 fixes, 2 repeats, all-or-nothing, re-run creates nothing) → A-102's facts → opening balances (importer waits, treasurer approves) → site defaults → penthouse override → *which rule wins* for A-501 → A-108 exemption approved by the treasurer → November run (79, PKR 355,800, A-108 exempt) → the manager can't approve (UI and API) → duplicate period refused → treasurer approves → posts → a second post is a replay → 79 invoices for PKR 355,800 → notify → read-only → A-101 statement 1,000 + 4,200 = 5,200 → credit note → statement shows both (4,800) | AC-1 – AC-8 |
| A payer change from next month leaves the October balance with the old payer; November bills the tenant | AC-3 |
| Phone, Urdu: the manager prepares and sends November (bottom bar, site chip, primary action, flats 20 per page) | AC-1 (phone UR) |
| Keyboard only: flat finder (`a102`, ↓, Enter) and creating and previewing the run | AC-1 (keyboard) |
| Search (Ctrl+K) finds flats, people and the billing screens; a developer's palette offers none | — |
| The guard: no billing or sites in the menu, refused addresses, the units-and-payers page is the planned page, 403 from every financial endpoint; a developer can't open Sites; Shalimar sees no Al-Noor (404) | AC-15 |
| Switching to Urdu in the middle of an import keeps the work (address, rows, then fixes and reload) | AC-17 |
| 320 px reflow and 200 % zoom: run workspace, its flats, the statement and the dashboard | AC-17 |
| The building-manager tour frames real controls; its guided step completes when the preview is generated | AC-18 |
| axe + horizontal overflow on every C.1 screen (25 views) in EN/UR × 1440/390 | AC-1 (axe) |
| axe on the run workspace tabs, the four overlays (why-drawer, payer drawer, rule drawer, credit note) and the import review in EN/UR × 1440/390 | AC-1 (axe, overlays) |

## Localisation
- **Parity:** every key exists in English and Urdu (4,119 each); placeholders match; no empty values.
- **RTL:** logical CSS only (the lint guard refuses physical left/right); directional icons mirror; floor neighbours swap sides in Urdu (screenshots `b-flat-a102-overview-*-ur`).
- **Bidi isolation:** flat codes, account numbers, invoice references, IBANs and amounts are isolated left to right inside Urdu text.
- **Months and dates** are formatted by the browser's Urdu calendar names ("نومبر 2026").
- **Urdu runs:** the phone storyline, every axe pass in Urdu, the import language switch, and Urdu screenshots of every screen.
- **Free text is never translated:** names (including names entered in Urdu script), reasons and file names keep their script.

## Full runs

| Run | Result | Duration | Notes |
|---|---|---|---|
| Society spec, first run | 8 / 16 | 4.4 min | **Product bug found:** the flat finder never filtered (React Aria's ComboBox filters only uncontrolled `defaultItems`; it was given `items`), so typing `a102` and Enter opened A-501. Fixed in the finder and the flat picker. **Accessibility fixes:** Flat 360's fact cards nested `dt`/`dd` one level too deep (axe `definition-list`, `dlitem`); wide tables scrolled in regions that a keyboard could not reach (axe `scrollable-region-focusable`), now focusable, named regions. One test clicked a visually hidden radio input instead of its card |
| Society spec, second run | **16 / 16** | 3.0 min | |
| Full 1 | **217 / 217** | 14.4 min | No regression in the Gate B suites. Line reporter, so no axe totals recorded |
| Full 2 | **217 / 217** | 15.4 min | 558 scans, 15,474 passes, 0 violations |
| Full 3 | 217 / 218 | 14.3 min | After adding the society screens to Ctrl+K and a test for them. That new test pressed Ctrl+K before the developer's page had rendered (test timing); the test now waits for the page and the palette. Repeated 5 times afterwards: 5 / 5 |
| Full 4 | **218 / 218** | 14.5 min | 558 scans, 15,474 passes, 0 violations |
| Full 5 | **218 / 218** | 14.3 min | Final code and final tests. 558 scans, 15,474 passes, 0 violations |

