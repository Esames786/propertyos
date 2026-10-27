# Gate B final: security corrections, owner decisions and the rest of Gate B

**Status: built; STOPPED FOR OWNER REVIEW.**
- Gate C has not been started.
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched.
- **Not done, as instructed:** no production Laravel migrations, no real payment services, no merge.
- **Data:** fictional throughout. PropertyOS is a codename. Every price, threshold and count is illustrative.

Results of all checks: [`test-results.md`](test-results.md). Requirement-by-requirement map:
[`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md). Manual screen-reader check:
[`NVDA_CHECKLIST.md`](NVDA_CHECKLIST.md) (**not yet performed**; see §6).

## 1. How to try it

| Where | Who | What to look at |
|---|---|---|
| http://localhost:5173/backoffice/sign-in | **Zain Abbasi**, *Crescent Bay Developers (Demo)* | Two sites, different licences. Search `CB-P-01` (Plaza shops are never found); open `/backoffice/inv/unit-360-workspace?record=unt_cb_p_0101`; pick **Crescent Bay Plaza** in the header project switcher and watch **Projects** leave the menu; **My access** (account menu or Ctrl+K) |
| same | **Haris Mirza**, treasurer, *Cedar Hills Co-operative (Demo)*, suspended | The suspended banner; **Invoices** (financial history, read-only); any other area answers "This workspace is suspended" |
| same | **Nadia Rahman** (Larkspur), then sign out and choose **Zain Abbasi** | Tenant switching: a lead created at Larkspur is not found at Crescent Bay, in lists, search or by address; switch back and it is there |
| same | **Saima Akram** / **Adnan Malik** (Shalimar Court) | Honest maintenance home (planned work listed as planned, with its gate); "People & Contacts"; Adnan's plan shows residents and visitors **scheduled from 1 Nov 2026** |
| http://localhost:5175/hq | **Hamza Qureshi** (Supreme Admin) | **Approval policy** → *Prepare a new version*; **Rate cards**; **Module catalogue**; **Requests and signup**; Tenant 360 → **Subscription** → *Amend contract*; **Usage** → *Evidence*; **Audit log** |
| same, More → **Ayesha Siddiqui** | Commercial approver | Approve or return what Hamza prepared (she cannot change it; Hamza cannot approve his own) |

## 2. Part 1: security corrections

### 2.1 Fail-closed mock transport
- Every tenant endpoint now **declares** its module, the permission it needs (or that any member may call it because results are filtered per permission) and its **suspension class**. The type system requires the declaration. A test enumerates every handler and checks each declaration; only four visitor endpoints are allowed: the workspace-setup simulation (3) and demo reset.
- The transport decides **before any handler runs**:
  - no identity → **401** `unauthenticated`;
  - identity without effective access, or with another organisation's → **403** `no_effective_access`;
  - otherwise the declared module, the permission's own module, the permission and the tenant's lifecycle for the suspension class (`decideEndpoint`, the same layers as `decide`).
- **Proof that a refusal reads and changes nothing.** The security tests replace every handler body with a spy and call every endpoint four ways: signed out, without access, from an unlicensed plan, and without the permission. No spy is ever called. Refused writes leave the demo store without even a partition.
- Handlers no longer import fixture arrays. Each request gets its own tenant's dataset (`ctx.data`), so another organisation's records are not in the data a handler sees.

### 2.2 Site-level entitlements
- `SITE_SCOPED_MODULES`: inventory, construction, handover, dues, residents, resident portal, online payments, maintenance, visitors, parking and amenities. A record of one of these modules is refused when its site is unlicensed (`site_not_licensed`) **or unknown** (`site_context_missing`); a missing site is never treated as licensed.
- **Crescent Bay Developers (Demo)**, a developer on trial with two sites:

  | | Crescent Bay Towers | Crescent Bay Plaza |
  |---|---|---|
  | Inventory, construction, handover | licensed | — |
  | Maintenance | — | licensed |
  | CRM, projects, sales, receivables, communications, reports | whole organisation | whole organisation |

  The fixture also has one flat imported before it was assigned to a project, so it has no site.
- **What is checked:**
  - **Reads:** unit lists and unit detail.
  - **Writes:** hold and release.
  - **Search:** never returns Plaza shops or the unassigned flat.
  - **Dashboard:** inventory figures and project cards cover licensed sites only.
  - **Lead matching:** a Plaza lead is visible (CRM covers the company) but is never matched to Plaza inventory.
  - **Navigation:** with Plaza chosen in the header, inventory areas leave the menu.
  - **Direct URLs:** an address that names a record (`?record=…`) is checked by the server as a record before the page renders (`GET /access/record`). Another organisation's id is simply "not found".
- **Navigation follows the site.** Choosing a project in the header stores its site, and every menu item, quick action, address and tour step is decided for that site.

### 2.3 Resident and billing-account authorisation
- A resident's data scope is now their **party links**. Each link records the flat, billing account, site and legal entity, whether it is **verified**, and its effective dates.
- A record is reached only when a **verified link in force on the record's own date** matches it. A financial record (one with a billing account) must also name its site and legal entity, and both must match.
- The demo resident (Usman Tariq) has three links:
  - his current flat (verified);
  - a plot transferred on 1 April 2026 (liability ended);
  - a claimed flat nobody has verified.

  Only the first one opens the portal. Every portal instalment is checked against the liability for its due date.
- **Tests cover:** unverified, ended or not-yet-started links; other billing account, site, legal entity or flat; the same party id in another organisation (refused even with the portal licensed); online payments licensed per site.
- **Staff.** A financial record whose unit, billing account, project, site and legal entity disagree is refused for everyone (`invoiceRecord`).

### 2.4 Suspended tenant
- **Cedar Hills Co-operative (Demo)** is suspended since 30 September. Its treasurer (Haris Mirza) has 72 dues invoices for July to September.
- **History stays readable:**
  - FIN-002 **Invoices** (read-only; built for this, so the register marks it partial);
  - invoice search;
  - the record check for invoice addresses;
  - My access.
- **Everything operational is refused** as `tenant_suspended`: dashboard, notifications actions, practice, quick create, and every other area.
- **Residents of a suspended tenant** may still settle issued instalments when the suspension policy allows it (D-20); service requests are paused.
- A banner says so on every page.

### 2.5 Tenant switching
- **Session demo changes are partitioned by tenant.** Handlers only receive their own partition. The same applies to practice records and notification read-state.
- **Query cache:** keys always include the identity. On an identity change, every cached answer and pending mutation of another identity is dropped. A UI test proves no render ever shows an answer fetched for someone else.
- **More → "View the demo as"** offers colleagues of the same organisation only. Another organisation is a different sign-in.
- **End-to-end test:** a lead created at Larkspur, then sign out and in as Crescent Bay. The lead is absent from lists, search and its address. Switch back and it is there again.

## 3. Part 2: the owner's product decisions

- **Contextual Party labels.** The Party model is one; only the words change:

  | Kind of organisation | Label |
  |---|---|
  | Developer | "Customers & Buyers" |
  | Society with a resident roster | "Owners & Residents" |
  | Property manager | "People & Properties" |
  | Maintenance-only | "People & Contacts" |

  Used in the menu, More, the plan home and the HQ preview. A scheduled module changes the label from its date: Shalimar becomes "Owners & Residents" on 1 November.
- **Your plan and modules** remains for administrators only. **My access** (GLOBAL-014) is for everyone. It shows the areas the person can use, the sites each covers, their project scope and what their role lets them do there; nothing commercial.
- **Tenant-defined role templates.** Starter sets:
  - **Developer:** administration, sales, project management, inventory, finance, construction.
  - **Society:** administrator, manager, treasurer, maintenance, technician, security.

  Each workspace owns its roles. Shalimar replaced the starter "Manager" with its own **Facility manager**. The demo identities take their permissions from their role, and **Preview As Client** lists the tenant's own roles with those permissions. There is no allow-list. Portal (resident) roles are refused by the preview; they belong to the PWA gate.

## 4. Part 3: the rest of Gate B

### 4.1 Versioned commercial configuration (one workflow for four settings)

| Setting | Address | Holds |
|---|---|---|
| Commercial approval policy (HQ-026) | `/hq/policies` | limits (discount, below rate card, free days, onboarding reduction, term, first-year minimum), **who may approve**, **exceptions** per edition with an end date |
| Rate cards (HQ-010) | `/hq/rate-cards` | prices, bands, floors, trial length |
| Module catalogue (HQ-006/007) | `/hq/catalogue` | scope, requirements, editions; dependency list (requires / required by / works with) |
| Signup policy (HQ-027) | `/hq/requests?tab=signup` | how each edition's workspaces start; trial length; largest self-service workspace; e-mail verification |

- **Workflow:**
  - **Supreme Admin** (`platform.config.manage`, held by nobody else) prepares a version: edits, effective date, reason. They then submit, withdraw, or cancel a scheduled one.
  - **A different person** holding an approver role named **in the policy in force** approves or returns it with a comment. Principal ids are compared.
  - A version applies from its date. Older versions stay valid for earlier dates.
- **The server re-validates every version**, for example:
  - limits within range;
  - support can never be an approver;
  - catalogue: no cycles, no removed modules, no new tenant-wide-on-site requirement;
  - rate card: no removed lines, rising bands, floor ≤ price.

  It lists problems field by field.
- **No threshold is hard-coded.** The seeds are version 1 ("illustrative defaults"). The builder, quote, simulator, contract activation, amendments and every dependency check read the versions in force for the contract date. A test proves a December contract follows a December policy while a November one does not.

### 4.2 Workspace requests
- Each request shows what the signup policy in force says should happen.
- **Actions:** mark contacted; **approve**, which opens a **prefilled tenant draft** that continues in the creation wizard; decline (a reason is required); continue setup.
- Transitions out of order are refused.
- The backoffice's *Set up your workspace* now ends by stating the policy outcome. In this prototype that is the seeded version, because the two apps keep separate demo sessions.

### 4.3 Contract amendments, scheduled changes and grant changes
- **Amend contract** (HQ-011) starts from the version in force. Change modules and their sites, prices, discounts or terms, and the date.
- **The impact is worked out by the server:**
  - price before and after, and the difference;
  - missing requirements, with one press to add them;
  - added, removed and re-sited modules;
  - **who gains or loses which area, by the tenant's own roles**;
  - which records stay, read-only.
- **If the policy flags it**, a second person approves; then it is **scheduled** (or applies at once if dated today).
- **Tenant 360 → Subscription → Contract history** lists every version: date, author, approver, monthly price and **what changed field by field**. A scheduled or pending change can be withdrawn.
- **Seeded history:**
  - Larkspur version 1 (March) was replaced by version 2 (April, online payments for Larkspur Heights).
  - Shalimar has an approved version 2 scheduled for 1 November (residents and gate passes, no price change). Its grants carry that start date, the workspace grants them from that date, and **Preview As Client "as on" 1 Nov 2026** shows it.

### 4.4 Usage metering evidence and billing (HQ-014/015)
- **Usage tab:** meters, monthly snapshots (counted, declared or corrected with the reason) and this month's **billing calculation**. It uses the same pricing engine and versions on the counted quantities; it is not an invoice (platform billing is Gate G).
- **Evidence drawer:**
  - the definition version;
  - counted and **excluded flat codes with reasons** (no site, office, guard room, merged);
  - registered / active / occupied / eligible side by side;
  - **no personal data**.
- **Riverbend's October count** was disputed and corrected (232 → 228, two flats merged). Crescent Bay's unassigned flat is excluded for having no site.

### 4.5 Complete commercial audit trail (HQ-028)
- Every change to tenants, contracts, grants, approvals, configuration, requests, usage and previews is recorded with the person (principal id), time and, for commercial changes, **before and after**.
- `/hq/audit` filters by kind of change, tenant and person. There is no endpoint that edits or removes an entry.

## 5. UX
- **Kept:** Limestone & Evergreen; English/Urdu (RTL); keyboard paths; responsive layouts (axe and overflow checks at 1440 and 390 in both languages for every new screen).
- **Prototype tools:** the design system lab is no longer in clients' menus, search or More. **Preferences → Guided tours → "Show the design system lab…"** brings it back for reviewers; its addresses always work.
- **Maintenance-only home:** quick actions open only screens that work today (invoices if allowed, My access, the plan for administrators, help, preferences). Planned maintenance work (requests, new request, technician board, preventive maintenance) is listed as **"Planned · Gate D/G"**, never as buttons.
- **Connected workspaces:** Tenant 360 ↔ amendment ↔ preview ↔ audit; request → tenant draft; plan home ↔ My access.

## 6. Honest notes
- **NVDA was not run.** I cannot operate a screen reader. Automated accessibility checks pass (see test results); [`NVDA_CHECKLIST.md`](NVDA_CHECKLIST.md) lists the 22 flows to verify by hand in English and Urdu.
- **The two apps keep separate demo sessions**, because they run on different origins. A change made in HQ (a new policy, an amendment) is visible in HQ, its preview and its audit. The client workspace reads the seeded directory, which already contains the seeded scheduled change.
- **FIN-002 Invoices is partial.** It was built read-only for the suspension requirement; creation, collection and the other filters remain Gate C.
- **Metering is fixture data** of what the Gate G job would record. The billing calculation is labelled non-authoritative.
- **Changed persona labels.** Nadia Rahman now holds the **Administration** role (was "Developer manager"), and Larkspur's finance officer is **Finance**, because their permissions come from the tenant's role templates.

## 7. Evidence
- **Screenshots:** 128 in `screenshots/` (33 views, English and Urdu, desktop 1440 and phone 390).
- **Videos** (`video/`):

  | Video | Shows |
  |---|---|
  | `bo-two-sites-licensing-desktop-en` | Two sites in one tenant |
  | `bo-tenant-switching-no-leakage-desktop-en` | Tenant switching without leakage |
  | `bo-suspended-history-phone-ur` | Suspended tenant, phone, Urdu |
  | `hq-policy-configuration-workflow-desktop-en` | The commercial-policy configuration workflow, with maker-checker and audit |
  | `hq-amendment-and-history-desktop-en` | Contract amendment, its history and a scheduled change in the preview |
