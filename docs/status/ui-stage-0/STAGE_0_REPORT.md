# Stage 0 Report — Repository intake and architecture choice

| | |
|---|---|
| **Date** | 2026-10-26 |
| **Blueprint** | V2.1 (root files verified byte-identical to `PropertyOS_UI_First_Blueprint_V2_1_Guided_Onboarding.zip`) |
| **Stage status** | Complete, awaiting owner approval |
| **Code written** | None. Stage 0 adds documents only (listed in §10). |

---

## 1. Summary

The repository is empty apart from the blueprint, so there is nothing to migrate or keep compatible with. Recommendations:

- **Architecture (ADR-0001):** an npm-workspaces repo with two Vite + React 19 + TypeScript SPAs, `apps/backoffice` and `apps/customer-web`, sharing five source packages (`tokens`, `i18n`, `ui`, `contracts`, `fixtures`).
  - Components are built on **React Aria Components** with Tailwind v4 tokens.
  - Pages are pure functions of typed props, so the backoffice moves into Laravel + Inertia later by swapping the router and data adapters, not by rewriting pages.
  - The customer app's prototype *is* its production architecture.
- **Guided onboarding (ADR-0002):** our own engine on React Aria rather than Driver.js. Inspecting Driver.js 1.10.2 found global arrow-key hijacking, `innerHTML` content, DOM outside React (no live translation) and ARIA attributes written onto app elements.
- **Toolchain:** Node 24 LTS is needed. The installed Node 20 is end-of-life and below what React Router 8, Vitest 5 and axe-playwright require.
- **Blueprint conflicts:** 26 found (§3), each with a proposed resolution. None blocks Stage 1. Three need an owner decision eventually (§8).

---

## 2. Repository and environment status

| Item | Finding |
|---|---|
| Files | `00_`–`09_` blueprint files + V2.1 ZIP at root. No code. |
| Version control | **Not a git repository.** |
| Node / npm | 20.20.1 / 10.8.2 under Laragon. Node 20 EOL 2026-04-30. Current LTS: 24.22.1, 22.23.4 |
| PHP / Composer / MySQL / Redis | 8.3.16 / present / 8.0.30 / 5.0.14. Not used before backend stage |
| PATH | Node, PHP and Composer are **not** on PATH outside the Laragon terminal; scripts and docs will account for this |
| Screen register | 321 rows (315 in V2 + 6 `GUIDE-*`): backoffice 259, customer 28, public 18, SaaS 10, shared 6 |

---

## 3. Blueprint conflicts found, with proposed resolutions

### Design tokens and formatting (verified numerically)

| # | Conflict | Evidence | Resolution |
|---|---|---|---|
| C1 | Suggested `--color-border #CBD5E1` is used for controls, but WCAG 1.4.11 needs ≥ 3:1 for input boundaries | 1.48:1 on white, 1.42:1 on `#F8FAFC` | Keep `#CBD5E1` for decorative dividers only. Add `--color-border-control: #64748B` (4.76:1) for inputs, checkboxes and table boundaries. |
| C2 | `--color-focus` equals `--color-primary`, so focus is invisible on a primary button | 1.00:1 against primary fill | 2 px ring + 2 px offset in page background (ring vs. background 6.41:1). White inner ring on filled/dark surfaces. Contrast test covers both. |
| C3 | Token names differ: 01 uses `--background/--danger`, 07 uses `--color-bg/--color-error` | — | Use 07's `--color-*` naming throughout. |
| C4 | CLDR formats **PKR with 0 decimals by default**, so amounts are silently rounded | `Intl` en-PK and ur-PK: `12500000.5` → `Rs 12,500,001` | Money formatter always sets 2 fraction digits. Money is carried as decimal strings. Unit tests pin this. |
| C5 | Locale defaults disagree: short date en-PK `26/10/2026` vs ur-PK `26/10/26`; compact numbers en-PK `13M` vs ur-PK `1.3 کروڑ` | Node 20 ICU 78.2 / CLDR 48 | Explicit date patterns (e.g. `26 Oct 2026` / `26 اکتوبر 2026`). Compact notation banned for exact amounts. Lakh/crore vs million grouping is an owner decision (§8). |
| C6 | 01 asks for "Geist Sans **or** Inter, choose one" | — | **Inter** (ADR-0001 §2.8). |

### Screen register (`06_SCREEN_REGISTER.csv`)

| # | Conflict | Resolution |
|---|---|---|
| C7 | `template` column labels **265 of 321** rows `index`, including dashboards, reports, create forms and payment flows. Stage list (03) names 9 template families, 01 §11 names 10, V2.1 adds `welcome`, `guided-tour`, `training`, `settings`. | Project-local copy `docs/ui/screen-register.csv` adds a `ui_template` column with the canonical families in §5. Assigned in Stage 2; the owner's CSV stays untouched. |
| C8 | `RPT-010 Cash flow` is tagged `wizard`; `WEB-010 360 tour` is tagged `workspace/detail` | Map to `report` and `public-story` (media viewer). |
| C9 | 34 workspace routes carry no record id (e.g. `/backoffice/crm/lead-360-workspace`), but 01 §7 requires deep links per record and tab | Canonical record routes `/backoffice/{area}/{collection}/:id/:tab?`. The register URL stays resolvable by opening a default fictional record (one client-side `replace`, no history pollution). |
| C10 | Drawers and overlays are listed as pages (`CRM-004 New lead drawer`, `GLOBAL-001 Command palette`, `GUIDE-002` overlay) | Overlays are URL state on a parent page (`?drawer=new-lead`). The register URL opens the parent with the overlay open, so it is deep-linkable and back-button safe. |
| C11 | **Duplicate route:** `GUIDE-002` and `GUIDE-003` both `/backoffice/help/tours` | `GUIDE-003` library at `/backoffice/help/tours`. `GUIDE-002` launches at `/backoffice/help/tours/GLOBAL-TOUR-001` (or `?tour=` on any route). |
| C12 | `GUIDE-005` uses `/portal/help/tours`; every other customer route is `/customer/portal/*` | Serve at `/customer/portal/help/tours`. Keep `/portal/help/tours` as an alias. |
| C13 | `GUIDE-006` (surface `tab`) at `/backoffice/settings/onboarding`, while preferences live at `GLOBAL-008 /backoffice/global/profile--preferences` | One Preferences page with tabs (Language, Accessibility, Guided tours). Both URLs open the matching tab. |
| C14 | `GUIDE-001` route is `/backoffice` (root), but the home is `HOME-001 /backoffice/home/role-aware-dashboard` | `/backoffice` resolves to the persona's home. The welcome appears over the first page that has no "busy" lock. |
| C15 | The same report appears twice: Trial balance (ACC-006/RPT-007), P&L (ACC-007/RPT-008), Balance sheet (ACC-008/RPT-009), Budget vs actual (EXP-009/RPT-014); Customer statement (COL-004) ≈ Customer ledger (CUS-008) | One implementation with two entry points and breadcrumbs that reflect the entry context. |
| C16 | `&` produced odd slugs: `profile--preferences`, `plans--entitlements`, `p-l` | Kept as-is for register compatibility. Clean canonical slugs are proposed in Stage 7, not before. |
| C17 | 315 rows have permission `TBD per role/scope` | Prototype uses an **illustrative** permission catalogue in `@repo/contracts/permissions.ts`, clearly marked non-authoritative. Reconciled in Stage 7. |
| C18 | 01 §15 caveat says "Do not build 250 individual polished screens"; the register has 321 | Same strategy, larger count: all routes on shared templates, polish reserved for the 24 signature screens. |

### Toolchain and libraries

| # | Conflict | Resolution |
|---|---|---|
| C19 | Node 20.20.1 is EOL and below the minimums of react-router 8.5.0 (≥ 22.22), vitest 5 (≥ 22.12) and @axe-core/playwright 4.14 (≥ 22.12) | **Owner decision:** use Laragon's Node 20.20.1. Use the newest versions that support Node 20: react-router 7.18.4, vitest 4.1.12, @axe-core/playwright 4.13.0, ESLint 9.39.5, jsdom 26.1.0. |
| C20 | TypeScript 7.0.2 is current, but typescript-eslint 8.72 supports `<6.1.0` | Pin TypeScript 6.0.3. |
| C21 | 09 §8 suggests Driver.js | ADR-0002: own engine (evidence there). |
| C22 | 09 §8 puts tour strings in `packages/ui/src/onboarding/locales/en.json`; 01 §3 organizes translations by namespace and uses `en-PK`/`ur-PK` | `onboarding` namespace in `@repo/i18n/locales/{en-PK,ur-PK}/`. One dictionary system, one parity check. |

### Scope and process

| # | Conflict | Resolution |
|---|---|---|
| C23 | Your V2.1 message asks Stage 1 to include "module-specific tutorials"; 09 §10 places Sales/Inventory/Finance/Project tours in Stage 3 (their screens don't exist until Stages 2–3) | Stage 1 delivers the **module-tour mechanism**: registry, module-first-use offer, role filtering, practice banner and training store. It is proven by `GLOBAL-TOUR-001` plus one small **demonstration tour on the Stage 1 forms lab** that exercises `GUIDED_ACTION` and `SIMULATED_TASK`. The real module tours ship with their screens in Stage 3, the resident tour in Stage 4. |
| C24 | Repo is not under version control | Recommend `git init` and a baseline commit of the blueprint before Stage 1. **Needs approval** (§8). |
| C25 | Blueprint files and ZIP sit at the repo root | Move them to `docs/blueprint/v2.1/` (ZIP to `docs/blueprint/archive/`). **Needs approval** (§8). |
| C26 | 01 prescribes Naskh for Urdu UI; many Urdu readers expect Nastaliq | Follow the blueprint (Naskh for UI). Ask a native Urdu reader to review the Stage 1 specimen screenshots. Display/marketing face is decided in Stage 4/5. |

---

## 4. Assumptions (correct any that are wrong)

| # | Assumption |
|---|---|
| A1 | Latin digits for all numbers, amounts, dates and IDs in both locales. This is the CLDR default for `ur-PK` (`numberingSystem: latn`). Urdu digits stay possible as configuration. |
| A2 | Exact amounts use 3-digit grouping (`Rs 12,500,000.00`) in both locales until the lakh/crore decision (§8). |
| A3 | Display timezone `Asia/Karachi`; fixture instants stored as ISO-8601 UTC. |
| A4 | All fixture people, companies, phones, CNICs and IBANs are fictional. IBANs use a non-existent `DEMO` bank code with a valid checksum format. Every payment surface is labelled **DEMO**. |
| A5 | Demo personas for Stage 1: **Manager** (all projects), **Sales** (one project only), **Finance**, **Resident** (customer app, owns 2 units). Maintenance and Security are added in Stage 2/3. |
| A6 | "First login" = first entry for **tenant + persona + app**, per 09 §5. A "Reset demo onboarding" control re-creates it. |
| A7 | SaaS HQ screens live in the backoffice app with their own shell for the prototype. |
| A8 | The prototype runs locally only; nothing is deployed. |
| A9 | Sound feedback: Stage 1 implements the OFF-by-default preference with two quiet synthesized tones (no audio assets), so the setting is not a dead control. |
| A10 | Drafts survive back/forward navigation through an **in-memory** draft store. Nothing with personal data is written to `localStorage`/`sessionStorage`. Only locale, accessibility preferences and tour progress persist. |

---

## 5. Route inventory and template families

**Register coverage plan.** Every one of the 321 `prototype_route` values resolves. Until a screen is built, its route renders an intentional **Planned screen** state showing its ID, name, template family and target stage, never a 404. Stage 2 replaces all of these.

**Canonical template families**, reconciling 01 §11, 03, 09 and the CSV:

| Family | Used for | Examples |
|---|---|---|
| `dashboard` | Role/area overviews with KPI tiles + accessible data tables | HOME-001, FIN-001, MNT-001 |
| `index` | Filterable lists, saved views, bulk actions, cards on phone | CRM-002, FIN-002 |
| `workspace` | Entity 360: header, metrics, tabs, related drawer, activity | CRM-003, CUS-003, INV-003 |
| `form` | Drawer/sheet or full-page create/edit | CRM-004, FIN-007 |
| `wizard` | Multi-step with summary panel | BKG-003, HND-009, FIN-010 |
| `approval` | Decision view with evidence and reason capture | APR-002, APR-003, FIN-009 |
| `calendar` | Scheduler with list alternative | CRM-009, AMN-002 |
| `matrix` | Visual grid with list/table alternative | INV-001, ADM-007 |
| `report` | Chart + underlying table + export | RPT-*, ACC-006..008 |
| `reconciliation` | Split view matching two sources | BANK-004 |
| `settings` | Grouped preference/config forms | ADM-008..020, GUIDE-006 |
| `auth` | Centered, minimal-chrome flows | AUTH-* |
| `public-story` | Cinematic section + static accessible alternative | WEB-* |
| `onboarding` | Welcome, tour overlay, practice | GUIDE-* |

**Route rules:**
- Register URL = guaranteed address.
- Records: `/{app}/{area}/{collection}/:id/:tab?`.
- Overlays: search params (`?drawer=`, `?tour=`).
- Tabs: path segment.

Every page and tab is deep-linkable, with no state that exists only on the client.

---

## 6. Mock contract plan

- **Shapes** live in `@repo/contracts` as zod schemas + TS types:
  - IDs: ULID-style strings plus human references (`LD-2026-00042`, `INV-2026-001284`).
  - Money: `{ amount: "12500000.00", currency: "PKR" }`.
  - Dates: ISO-8601.
  - Statuses: translation keys (`status.unit.available`), so stored values never contain display text.
- **Lifecycle states shown are exactly those in 01 §9.** No transitions are invented. Fixtures only *display* states; they do not implement a workflow engine.
- **API error contract** (for later backend agreement): `{ status, code, messageKey, errors?: { [field]: [{ code, params }] }, correlationId }`, with a mapper for Laravel's 422 `{ message, errors }`.
- **Search contract** (Ctrl+K): `search({ q, scope }) → { routes[], records[], actions[] }`, filtered by the active persona's permissions *inside the transport*, so the UI cannot show what scope excludes.

**Stage 1 entity subset:** Tenant, Persona, Project → Tower → Floor → Unit, Party, Lead, Invoice (summary), Notification, ActivityEvent, TourProgress.

**Stage 1 dataset size:** 1 fictional tenant, 2 projects, 5 towers, about 600 units (enough to prove async search), 150 parties, 120 leads, 60 invoices. All deterministic from a fixed seed.

**Stage 2 adds the full list:**
- **Sales:** Opportunity, Visit, Quote, Hold, Reservation, Booking (+ parties, payment plan, installments).
- **Customer finance:** Payment, Evidence, Allocation, Receipt, Credit, Refund.
- **Ownership and occupancy:** Ownership/OwnershipParty, Transfer, Occupancy, Household, Vehicle, Parking/Storage.
- **Accounting and banking:** Account, Journal, Period, Bank account/transaction/reconciliation.
- **Suppliers and procurement:** Supplier bill/payment, PR/RFQ/PO/GRN.
- **Expenses and budgets:** Expense, Budget, CostCenter.
- **HR and payroll:** Employee, Attendance, Advance, Payroll run, Payslip.
- **Documents and approvals:** Document/Version, Approval.
- **Construction and handover:** Construction milestone/update, Handover, Clearance, Inspection, Snag.
- **Residents and facilities:** Maintenance request/Work order, Visitor pass, Amenity booking, Notice.
- **Communications and audit:** Message/Template, AuditEvent.
- **Platform:** Plan, Domain, Role, User.

---

## 7. Run commands and test strategy

**Commands (created in Stage 1):**

| Command | Does |
|---|---|
| `npm install` | Installs all workspaces |
| `npm run dev` | Backoffice on http://localhost:5173/backoffice, customer on http://localhost:5174/customer/portal |
| `npm run dev:backoffice` / `npm run dev:customer` | One app |
| `npm run build` / `npm run preview` | Production build / serve it |
| `npm run typecheck` | `tsc -b` across workspaces |
| `npm run lint` | ESLint (incl. no hard-coded strings, a11y rules) + logical-CSS check + i18n key parity |
| `npm run test` | Vitest unit/component tests |
| `npm run test:e2e` | Playwright e2e + axe against preview builds |
| `npm run evidence` | Captures the stage screenshot matrix into `docs/status/ui-stage-N/screenshots/` |
| `npm run register:sync` | Regenerates the typed screen manifest from the register CSV |

Outside the Laragon terminal, prefix PATH with the Node 24 folder. The README will show the exact line.

**Test layers:**

| Layer | Tool | Covers |
|---|---|---|
| Static | `tsc`, ESLint, `check-logical-css`, `check-i18n` | Types; no hard-coded strings; no physical left/right CSS; en-PK/ur-PK key parity |
| Unit | Vitest | Money/date/phone/CNIC/IBAN formatters; token contrast pairs; tour state machine; progress store; permission filter; fixture determinism and "fictional data" rules |
| Component | Vitest + Testing Library | Form controls' labels/errors/ARIA; tabs; dialogs |
| E2E | Playwright (Chromium in Stage 1; WebKit + Firefox added in Stage 6) | Keyboard-only journeys, locale switch keeps state, drawer/dialog focus, Ctrl+K, persona scoping, tour acceptance tests |
| Accessibility (automated) | @axe-core/playwright, tags `wcag2a wcag2aa wcag21a wcag21aa wcag22aa` | Every built route × EN/UR × 1440/390, plus open overlays and tour steps |
| Reflow/zoom | Playwright | 320 px width and 200 % zoom (720 × 450 CSS px at DPR 2): no page-level horizontal scroll; controls reachable |
| Screen reader | **Manual** NVDA + Chrome, VoiceOver + Safari, TalkBack | Checklist handed over each stage. Automated ARIA snapshots are a proxy, not a substitute, and the reports will say so. |

---

## 8. Decisions needed from you

**Before Stage 1:**
1. **Approve ADR-0001** (architecture) and **ADR-0002** (own onboarding engine instead of Driver.js).
2. **Node 24.22.1 LTS:** may I install it into `D:\laragon2\bin\nodejs\node-v24.22.1-win-x64` (official nodejs.org ZIP, Node 20 untouched)? Or would you rather install it yourself through Laragon?
3. **Version control:** may I run `git init`, move the blueprint into `docs/blueprint/v2.1/` (ZIP to `docs/blueprint/archive/`), and commit a baseline? After that I'd commit once per completed stage, only with your OK.

**Not blocking, needed by Stage 2/3:**

4. **Amount grouping:** `12,500,000` (million) or `1,25,00,000` (lakh/crore) for exact amounts, and whether dashboards may show "1.25 crore" style summaries.
5. **Urdu digits:** keep Latin digits in Urdu (A1), or offer Urdu digits as a user preference.
6. **Native Urdu review** of Stage 1 typography screenshots (C26).

---

## 9. Evidence: commands run during Stage 0

All read-only, except downloading package tarballs into the session scratch folder for inspection.

| Check | Result |
|---|---|
| Repo listing | 10 blueprint files + ZIP; no code; no `.git` |
| ZIP vs root files | All 10 byte-identical |
| V2 → V2.1 diff | New doc 09; additions in 00, 01 §19, 02, 03 (Stages 1–4, 6), 04, 07, 08; 6 new CSV rows |
| CSV parse (quote-aware) | 321 rows, 0 malformed; duplicate route `/backoffice/help/tours`; 38 route prefixes |
| Toolchain | Node 20.20.1, npm 10.8.2, PHP 8.3.16, git 2.53.0; Node LTS index from nodejs.org |
| npm registry | Versions and engine ranges in ADR-0001 §1 and §2.4 |
| Contrast (WCAG formula) | Pairs in C1/C2 |
| `Intl` (Node 20.20.1, ICU 78.2, CLDR 48.0) | Outputs in C4/C5. Browsers may ship a different CLDR; Stage 1 tests pin behaviour in the browser too. |
| Driver.js 1.10.2 dist | Findings in ADR-0002 §2 |
| React Aria 1.22.1 types | Toast, Autocomplete, Sheet, Popover `triggerRef`, Modal, Table, DatePicker, NumberField present |
| React Router 8.5.0 | Data-router APIs present (`createBrowserRouter`, `useBlocker`, `ScrollRestoration`, `useSearchParams`); `react-router-dom` package removed in v8 (import from `react-router`) |

No screenshots exist for Stage 0 because no UI exists yet.

---

## 10. Files added in Stage 0

- `docs/adr/ADR-0001-frontend-architecture.md`
- `docs/adr/ADR-0002-guided-onboarding-engine.md`
- `docs/status/ui-stage-0/STAGE_0_REPORT.md` (this file)
- `docs/status/ui-stage-0/STAGE_1_PLAN.md`

No existing file was modified or moved.
