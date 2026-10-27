# Gate B, checkpoint 2: effective access, Tenant 360 and Preview as client

**Status: built; STOPPED FOR OWNER REVIEW.**
- The rest of Gate B has not been started; nor has Gate C.
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched.
- **Not done, as instructed:** no payment providers, no production migrations, no merge.
- **Data:** fictional throughout. PropertyOS is a codename.

**Checkpoint 1 was closed first** (commit `a681bc0`):
- principal-based maker-checker;
- server-side validation;
- final runs 7 and 8 at 159 / 159;
- `npm test` 419 / 419.

See [`../gate-b-checkpoint-1/test-results.md`](../gate-b-checkpoint-1/test-results.md).

## 1. How to try it

| Where | Who | What to look at |
|---|---|---|
| http://localhost:5173/backoffice/sign-in | **Saima Akram**, facility manager, *Shalimar Court Residents (Demo)* | A maintenance-only client: the home, menus, Create, search; open `/backoffice/crm/sales-home` directly |
| same | **Adnan Malik**, committee administrator, Shalimar Court | **Your plan and modules** (Administration, or the link on the home) |
| same | Nadia Rahman (Larkspur manager) | Nothing changed for a full developer plan |
| http://localhost:5175/hq/tenants | **Hamza Qureshi** (Supreme Admin) | Open a tenant → **Open Tenant 360** → **Preview as client** → choose a role → **What if the plan changed?** |

**About Shalimar Court's facility manager.** Saima's role deliberately holds lead, booking and unit permissions. What stops her reaching the developer CRM, sales, booking and construction is her organisation's licence, as the owner required. The tests prove this with reads and writes against the mock API, not only menus.

## 2. What was built

### 2.1 Effective access across the workspace (item 1)
- **One rule, three places.** `decide()` (Gate A access model) and its UI form `decideTarget()` evaluate, in order:
  - tenant lifecycle;
  - licensed module in force (effective-dated);
  - site and feature;
  - permission;
  - scope;
  - state.

  The **mock API**, the **workspace UI** and the **HQ preview** all use them.
- **Permissions know their module** (`PERMISSION_MODULE`). Every existing `can()` check in the app now also asks whether the module is licensed. Drawers, page buttons, quick create, project switcher and tours all follow the plan without per-screen code.
- **One tenant directory** (`packages/fixtures/src/tenant-directory.ts`) holds each tenant's modules, sites and status. HQ's seed and the workspace both read it, so HQ and the client agree. Shalimar Court is in it, and in HQ's tenant list.
- **Where it applies:**

  | Surface | What happens |
  |---|---|
  | Navigation (sidebar, phone bar, More) | Only areas the plan and the role allow |
  | Home | A plan-aware home when the plan has no developer modules: maintenance quick actions, areas, modules in the plan |
  | Quick create | Only allowed entries; no button when nothing is allowed |
  | Global search | Screens filtered by plan; records come from the server, which never returns another organisation's seed records |
  | Quick actions | Filtered by plan and role |
  | Related records | Links only to what the person may open; the rest is listed with the reason |
  | Deep links | Every address is checked before it renders: built pages, register planned pages and typed addresses. Not in plan / site / role / suspended / not active → **GLOBAL-012 access outcome** with a way on; module content is never shown |
  | Mock API, reads and writes | Every endpoint declares its module; refused before any data is read (403 `module_not_licensed`, 404 out of scope, as the backend will) |
  | Tours | Steps about modules outside the plan are removed |
  | **ADM-023 Your plan and modules** | Read-only, for administrators: edition, status, licensed since, sites, modules included (with sites) and not included |

### 2.2 Tenant 360 (HQ-004, item 2)
- **Tabs, kept in the address:**
  - **Overview:** organisation; lifecycle, contract and billing kept apart; the approval decision; access at a glance.
  - **Subscription:** terms, components with effective dates, and the regular-month breakdown. **Rs 0 lines stay visible**, as decided.
  - **Modules and sites:** grants with sites, in force since and requirements; modules not licensed; sites.
  - **Usage:** declared counts and the quantities used for pricing.
  - **Commercial:** approval with reasons, discounts with reasons, billing.
  - **Audit:** licence, contract, approvals and previews, with principal and time.
- **Read-only for platform support.**
- **Licence changes:** granting or removing a module on a live tenant is a contract amendment (remaining Gate B). Tenant 360 says so and points to the safe what-if in the preview.

### 2.3 Preview as client (HQ-009, item 3)
- **Exact, not a copy.** The tenant's licence is evaluated for one of its roles using the workspace's own navigation model and access rule. It shows their menu and phone bar, every area with its availability and reason, quick create, search scopes, and an address check.
- **Proven equal.** A cross-app test compares the HQ preview of Saima's role with Saima's real backoffice menu.
- **Safe:**
  - the preview session carries effective access only (`containsTenantRecords: false`);
  - nobody is signed in as the client, so there is no impersonation;
  - opening a preview is audited.
- **What if the plan changed?** Try a different module set and see "Would gain / Would lose" per area, with dependency gaps flagged. It is never saved and never audited, like the pricing simulator.

### 2.4 Wizard usability (owner's mandatory list)

| Item | Done |
|---|---|
| Clear step progress | Stepper with reached and locked steps; phones show "Step n of 9" and a bar |
| Smart presets and defaults | Edition presets fill modules and rate-card prices |
| Basic vs advanced pricing | **Basic** by default (each price and what it counts). **Advanced** adds effective dates and scheduled price changes. Prices that already carry dates keep them visible and say why |
| Expandable complex settings | Tax, monthly minimum and cap folded under **More commercial settings**; it opens by itself when a value is set |
| Live pricing summaries | Beside the form on wide screens; pinned bar on phones and tablets |
| Validation and error recovery | Field errors and summary; server refusals listed and focused (checkpoint 1 closure) |
| Guided help on real controls | **HQ-TOUR-002 "Create a tenant"**: "Show me how" on the wizard and a one-time first-visit offer; spotlights progress, edition choice and Continue |
| Responsive, keyboard, EN/UR RTL | 320 px and 200 % reflow; axe EN/UR on desktop and phone |
| No needless full-screen navigation or reloads | The wizard, Tenant 360 tabs and the preview all update in place; state is in the address |

## 3. Working vs simulated (every major function)

| Function | Status | Notes |
|---|---|---|
| Effective access in menus, search, quick actions, quick create, related records, deep links, tours | Working | Same rule as the API |
| Mock API enforcement (reads and writes) | Working | Mock server; the backend must apply the same rule (Gate H) |
| Plan-aware home; Your plan and modules; access outcome pages | Working | |
| Tenant directory shared by HQ and the workspace | Working (demo data) | A real backend replaces it |
| Tenant 360 | Working | Read-only. Amendments, meters and central invoices come later |
| Preview as client (roles, areas, address check) | Working | No records, no impersonation |
| Preview what-if | Working (what-if) | Never saved |
| Audit of preview opening | Mock working | |
| Wizard basic/advanced, folded settings, guided help | Working | |
| Maintenance screens behind the maintenance-only home | Planned | Honest planned pages (MNT-xxx) |
| Demo sign-in, identity switch | Simulated | Real sign-in is Gate H |

## 4. Evidence

**Screenshots** (`screenshots/`, 86): every view in English and Urdu, at 1440 px and 390 px.
- **Backoffice:** grouped sign-in; Saima's home; quick create; More (phone); deep link not in plan; not for this role; the plan page; Larkspur unchanged.
- **HQ, Tenant 360:** overview, subscription, modules, usage, commercial, audit.
- **HQ, Preview as client:** Shalimar facility manager; Larkspur sales; what-if adding Sales CRM.
- **Wizard:** guided help, pricing basic and advanced, terms folded and open.

**Videos** (`video/`, MP4)

| File | Shows |
|---|---|
| `hq-tenant360-preview-whatif-desktop-en.mp4` (24 s) | Tenant 360 → subscription and modules → preview as committee administrator → facility manager → address check → what-if adding Sales CRM ("Would gain") |
| `bo-maintenance-only-client-desktop-en.mp4` (38 s) | Saima's home → quick create (maintenance only) → search "Sales" finds nothing → deep links to Sales home and a lead → "Not part of this workspace's plan" → back home → Operations |
| `hq-preview-phone-ur.mp4` (11 s) | The preview on a phone, in Urdu |
| `bo-maintenance-only-phone-ur.mp4` (12 s) | The client on a phone, in Urdu: home, Create, a refused deep link |

**Tests, accessibility and bundle:** [`test-results.md`](test-results.md). **Every function with its proof:** [`FLOW_MATRIX.md`](FLOW_MATRIX.md).

## 5. Known limitations (honest list)
- **HQ and the workspace keep separate demo stores.** Both read the same tenant directory, so they agree in the demo. A licence change made in HQ would only reach a client's workspace through a backend. Applying licence changes is in any case an amendment (remaining Gate B).
- **Sites and features.** The rule checks site and feature entitlements; unit tests cover site-limited grants and future-dated grants. Workspace screens don't pass a site with each record yet (demo records have no site context), and no screen is feature-gated yet.
- **Suspended tenants.** The rule allows financial history, allows settlement when the policy allows it, and blocks operations (unit-tested since checkpoint 1). No suspended tenant has workspace identities yet. Its read-only workspace states come with the suspension flow.
- **Commercial thresholds** are still illustrative defaults on the mock server. Screens show what the server returns and don't hardcode them. The configurable, versioned **Commercial Policies** screen is in the remaining Gate B work, as decided.
- **Personal accessibility settings** (font size, light/dark, high contrast, palettes, motion) are mandatory and scheduled for **Gate D**. They are not dropped.
- **Not yet covered:** a manual NVDA pass (AB-14), and browsers other than Chromium.
- **Bundle size:** see `test-results.md`.

## 6. Remaining Gate B (after this review; not started)
1. Signup-policy variants on Get started.
2. Module catalogue and dependency matrix.
3. Rate-card management, and **Commercial Policies and Approval Settings**: configurable, versioned rules, approver roles, exceptions, audit, effective dates.
4. Contract amendments and scheduled changes, including licence changes (HQ-008 apply).
5. Full audit, plus meters with evidence.
6. Manual screen-reader testing.

## 7. Questions for the owner
1. **Customers area for societies.** The committee administrator sees **Customers**, which is core, and owners and residents are parties there. Should societies see it under a different name ("Owners and residents")?
2. **Plan page access.** Should every role see "Your plan and modules", or only administrators (as now, per the register)?
3. **Previewable roles.** Previews offer Committee administrator, Facility manager and Finance officer for societies, and Manager, Sales and Finance for developers. Add or rename any?
