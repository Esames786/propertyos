# Gate B checkpoint 2: function matrix

**Status key**
- **Working:** the screen and logic are real; the data is fictional.
- **Mock working:** the action changes the browser tab's demo store through the mock API.
- **Simulated:** labelled on screen; nothing real happens.
- **Planned:** the register page exists and says it is planned.

**Proof** names the automated test:
- `access` = `tests/e2e/access.spec.ts`
- `t360` = `tests/e2e/hq-tenant360.spec.ts`
- `hq` = `tests/e2e/hq.spec.ts`
- `register` = `tests/e2e/register.spec.ts`
- unit files are named in full.

**The demo organisations**
- **Larkspur Estates (Demo):** a developer that licenses the full developer edition.
- **Shalimar Court Residents (Demo):** the owner's maintenance-only client. It licenses only core and maintenance.
  - Its facility manager, Saima Akram, *deliberately* holds lead, booking and unit permissions in her role. Everything below that stops her is the licence, not the role.

## 1. Effective access in the workspace (backoffice)

| # | Where | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 1 | Sign-in | Identities grouped by organisation | Larkspur and Shalimar Court sections | Simulated (demo sign-in) | screenshots `bo-sign-in-grouped-*` |
| 2 | Sidebar and phone bar | Only areas the plan and the role allow | Saima: Home, Operations (+ help and lab). Larkspur manager: unchanged | Working | `access` 1, 4, 5 |
| 3 | Home | Developer dashboard only when the plan has developer modules | Saima gets the plan home: maintenance quick actions, areas she can open, modules in the plan | Working | `access` 1 |
| 4 | Quick create (header and phone) | Only entries the plan and the role allow; no empty menu | Saima: "New maintenance request" (planned); no lead, visit or practice lead | Working | `access` 1, 5 |
| 5 | Global search (Ctrl K) | Screens and records filtered by plan; no other organisation's records | Operations offered; Sales not offered; searching a Larkspur customer finds nothing | Working | `access` 1; `tenant-access.test.ts` |
| 6 | Deep links, bookmarks, typed addresses | Checked before the page renders; a clear outcome page | Sales home, lead list, a lead, projects, construction → "Not part of this workspace's plan" | Working | `access` 1; `register` (every address outside Larkspur's plan) |
| 7 | Inside the plan, missing permission | "Your role doesn't include this" | Saima → Your plan and modules | Working | `access` 2 |
| 8 | Related records | Links only to what the person may open; the rest says why | Locked rows "Not in your plan" / "Not available to your role" | Working | `RelatedDrawer.test.tsx`; existing related-drawer E2E |
| 9 | Mock API reads and writes | Refused before any data is read, with the API status (403 `module_not_licensed`, 404 out of scope) | 9 developer endpoints refused for Saima, reads and writes | Working | `tenant-access.test.ts`; `access` 1 |
| 10 | Seed records of another organisation | Never served | Search, people, notifications, dashboard and demo overview come back empty for Shalimar | Working | `tenant-access.test.ts` |
| 11 | Your plan and modules (ADM-023) | Read-only plan for administrators | Plan, status, licensed since, sites, included (with sites) and not included by category | Working | `access` 3; `tenant-access.test.ts` |
| 12 | Essentials tour | Steps about modules outside the plan are removed | Saima: welcome, menu, quick actions, search, Create, help | Working | `access` 6 |
| 13 | Larkspur (full plan) | No change | Every developer area and the API as before | Working | `access` 4; all Stage 1.5R specs |

## 2. Tenant 360 (HQ-004)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 14 | Tenants → summary → Open Tenant 360 | A workspace for the tenant | Header, status, MRR, edition, flats, modules | Working | `t360` 1 |
| 15 | Tabs | Overview, Subscription, Modules and sites, Usage, Commercial, Audit; kept in the address | As expected; survives reload | Working | `t360` 1 |
| 16 | Subscription | Terms, components with dates, regular-month breakdown | The Rs 0 base fee stays visible (owner decision) | Working | `t360` 1 |
| 17 | Modules and sites | Grants with sites, in force since, requires; not licensed; sites | Shalimar: Core and Maintenance; "Sales CRM" under not licensed | Working | `t360` 1 |
| 18 | Usage | Declared counts and pricing sources; meters later | As expected, with a note on meters | Working (meters planned) | screenshots |
| 19 | Commercial | Approval with reasons, discounts with reasons, billing | Kestrel: awaiting decision, Omar Sheikh, introductory offer | Working | `t360` 2 |
| 20 | Audit | Every licence, contract, approval and preview event | As expected | Working | `t360` 1, 7 |
| 21 | Platform support | Can see the record; no preview | Preview button hidden; preview address refused | Working | `t360` 3 |
| 22 | Unknown tenant | Not found | As expected | Working | `t360` 4 |

## 3. Preview as client (HQ-009)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 23 | Tenant 360 → Preview as client | The tenant's roles; banner; no tenant records | "No tenant records" badge; nobody signed in | Working | `t360` 5 |
| 24 | Choose a role | Menu, phone bar, every area, quick create, search scopes | Shalimar facility manager: developer areas "Not in plan", Operations available, Administration "Not for this role" | Working | `t360` 5 |
| 25 | Same as the client's real menu | HQ preview = what the person sees in the workspace | Saima's preview menu equals her backoffice menu (cross-app test) | Working | `t360` 6 |
| 26 | Check an address | Same answer as the workspace's deep-link check | Sales home → not in plan | Working | `t360` 5; `tenantWorkspace.test.ts` |
| 27 | What if the plan changed? | Try modules; gains and losses shown; nothing saved | Adding Sales CRM: Sales "Would gain"; store writes unchanged; dependency gaps flagged | Working (what-if) | `t360` 7 |
| 28 | Opening a preview | Audited | "Hamza previewed … (no tenant records)" | Mock working | `t360` 7 |
| 29 | Developer tenant | Roles differ | Larkspur sales: Sales available, Finance "Not for this role" | Working | `t360` 8 |

## 4. Wizard usability (owner's mandatory UX list)

| # | Item | Observed | Status | Proof |
|---|---|---|---|---|
| 30 | Clear step progress | Stepper with reached / locked steps; phones show "Step n of 9" and a bar | Working | `hq` |
| 31 | Smart presets and defaults | Edition presets fill modules and rate-card prices | Working | `hq` AB-1 |
| 32 | Basic vs advanced pricing | Basic by default (prices and what they count); Advanced adds dates and scheduled changes; dated prices stay visible | Working | `hq` basic/advanced |
| 33 | Expandable complex settings | Tax, minimum and cap folded under "More commercial settings" (opens when set) | Working | `hq` basic/advanced |
| 34 | Live pricing summaries | Beside the form; pinned bar on phones and tablets | Working | `hq` phone price bar |
| 35 | Validation and error recovery | Field errors, error summary, server refusals listed and focused | Working | `hq`; `validation.test.ts` |
| 36 | Guided help on real controls | "Show me how" and a first-visit offer; spotlights progress, edition choice and Continue | Working | `hq` HQ-TOUR-002 |
| 37 | Responsive, keyboard, EN/UR | 320 px and 200 % reflow; axe EN/UR desktop and phone | Working | `hq`, `t360`, `access` |
