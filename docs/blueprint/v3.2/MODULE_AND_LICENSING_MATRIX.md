# V3.2 proposal: module and licensing matrix

**Status:** PROPOSAL. It extends A1 §5 (module catalogue) and the catalogue in `packages/fixtures/src/platform/catalog.ts` (version `2026.10-1`, 27 modules).

**Approach:**
- The proposed catalogue would ship as a new catalogue version through Platform HQ's versioned configuration, built in Gate B final.
- Nothing in the current catalogue is removed.

## 1. What changes

| Change | Detail |
|---|---|
| **4 new modules** | `community_chat`, `community_hub`, `safety`, `rentals`. Catalogue goes 27 → **31** |
| **2 modules offered to more editions** | `hr` and `payroll` become add-ons for community and portfolio (today: developer only) |
| **20 new features** under existing or new modules | Listed in §3 |
| **New illustrative permissions** | Listed in §5. Same caveat as `permissions.ts`: the backend decides the final set at Gate H |
| **Existing tenants** | Unaffected. Editions are presets that pre-fill grants only at creation (D-2), so no existing tenant gains a new module automatically. Each demo tenant gets its new grants through a recorded contract amendment at the milestone that needs them (§7) |
| **Catalogue version** | Proposed `2026.11-1`, scheduled through HQ's catalogue versioning (draft → approved → scheduled), never edited in place |

## 2. The catalogue after the change

**Legend**
- ✓ = included in that edition's preset.
- add-on = sellable to that edition.
- — = not offered.

Every module stays available to the Custom edition, as today.

| Key | Module | Category | Scope | Requires | Integrates with | Developer | Community | Portfolio | Change |
|---|---|---|---|---|---|:-:|:-:|:-:|---|
| `core` | Identity, roles, people, sites, documents, approvals, notifications, audit, help, personalisation | foundation | tenant | — | — | ✓ | ✓ | ✓ | + features `core.data_export`; approval policies (F05), sessions (F17), app switch (F16) |
| `crm` | Leads, opportunities, visits | sales | tenant | core | sales, communications, public_website | ✓ | — | — | — |
| `projects` | Development projects | property | tenant | core | construction, accounting | ✓ | — | — | — |
| `inventory` | Sales inventory, holds | sales | site | projects | crm, sales | ✓ | — | — | — |
| `sales` | Quotes, bookings, transfers | sales | tenant | inventory, receivables | crm, accounting | ✓ | — | — | — |
| `construction` | Milestones, updates | property | site | projects | resident_portal | ✓ | — | — | — |
| `handover` | Clearances, handover | property | site | sales | construction, residents | ✓ | — | — | — |
| `receivables` | Invoices, payments, allocation, receipts, credits | finance | tenant | core | accounting, banking, online_payments | ✓ | ✓ | ✓ | + features `bulk_office_collection`, `reminders` |
| `dues` | Charges, billing runs | community | site | receivables, residents | accounting, communications | add-on | ✓ | ✓ | + print pack (no feature key: part of runs) |
| `residents` | Ownership, occupancy, roster | community | site | core | dues, maintenance, visitors | ✓ | ✓ | ✓ | + features `committee`, `transfer_clearance` |
| `resident_portal` | Resident app | community | site | residents | receivables, maintenance, visitors, amenities, construction, **community_hub, community_chat, rentals, safety** | ✓ | ✓ | ✓ | + feature `adoption`; Community home |
| `online_payments` | Gateway (mock until Gate H) | finance | site | receivables | resident_portal | add-on | add-on | add-on | — |
| `banking` | Bank and cash accounts, beneficiaries, reconciliation | finance | tenant | core | receivables, payables, accounting, **rentals** | ✓ | ✓ | ✓ | + feature `cashbook`; cash account kinds |
| `accounting` | Chart of accounts, journals, periods | finance | tenant | core | receivables, payables, payroll, banking | ✓ | add-on | add-on | Period lock shared with the cashbook |
| `payables` | Vendors, bills, expenses | finance | tenant | core | accounting, procurement, maintenance, **rentals, community_hub** | ✓ | add-on | add-on | — |
| `procurement` | PR, RFQ, PO | finance | tenant | payables | projects | ✓ | — | — | — |
| `hr` | Employees, attendance, advances and loans, **shifts** | people | tenant | core | payroll, **safety, community_chat** | ✓ | **add-on** | **add-on** | Offered to societies; + feature `shifts` |
| `payroll` | Payroll runs, components | people | tenant | hr | accounting, banking | ✓ | **add-on** | **add-on** | Offered to societies; + features `loans`, `bonuses` |
| `maintenance` | Requests, work orders, assets | community | site | core | residents, resident_portal, payables, dues | ✓ | ✓ | ✓ | + feature `community_issues` |
| `visitors` | Passes, gate check-in | community | site | residents | resident_portal, **safety** | ✓ | ✓ | ✓ | + feature `live_queue` |
| `parking` | Spaces, vehicles | community | site | core | residents, dues | ✓ | ✓ | ✓ | + feature `vehicle_approvals` |
| `amenities` | Amenities, bookings | community | site | residents | dues | ✓ | ✓ | ✓ | — |
| `communications` | Notices, messages, templates, delivery | channels | tenant | core | everything | ✓ | ✓ | ✓ | Reminder delivery (simulated); consent records |
| `reports` | Report centre | foundation | tenant | core | all | ✓ | ✓ | ✓ | — |
| `public_website` | Project sites | channels | tenant | projects, inventory | crm | add-on | — | — | — |
| `white_label` | Domain and theme | channels | tenant | core | — | add-on | add-on | add-on | — |
| `api_access` | API keys | channels | tenant | core | — | add-on | add-on | add-on | — |
| **`community_chat`** | **Smart group chat** | community | **site** | residents | resident_portal, communications, hr, residents (committee) | add-on | add-on | add-on | **NEW** |
| **`community_hub`** | **Polls, resources, services directory, marketplace** | community | **site** | residents | resident_portal, communications, payables, community_chat | add-on | add-on | add-on | **NEW** |
| **`safety`** | **SOS and incident response** | community | **site** | residents | hr, visitors, communications | add-on | add-on | add-on | **NEW**, catalogue status *restricted* until the safety review (D-26) |
| **`rentals`** | **Leases, rent billing, owner statements, payouts** | property | **site** | residents, receivables | banking, payables, accounting, resident_portal, communications | add-on | add-on | add-on | **NEW** |

**Why four new modules and not features of existing ones**
- **`community_chat`** has its own infrastructure cost at Gate H, plus moderation and retention duties. Some clients will not want it.
- **`safety`** must be held back from sale until the safety review. A *restricted* catalogue status lets HQ show it without granting it.
- **`rentals`** is a separate business line (letting) with its own money flows and legal duties. It must be sold on its own (Issue #2: "independent Supreme-Admin licensable module").
- **`community_hub`** groups optional engagement tools. Notices stay in `communications` so official notices remain one-way and auditable.

**Alternative:** fold chat and the hub into `communications` as features. This gives fewer catalogue lines, but HQ could no longer price or restrict them separately. Decision D-21.

## 3. Features (granted under a module)

| Feature key | Module | Default when the module is granted | Purpose | Feature |
|---|---|---|---|---|
| `resident_portal.adoption` | resident_portal | on | Portal access and invitations | F03 |
| `maintenance.community_issues` | maintenance | on | Community issues on the request entity | F04 |
| `residents.committee` | residents | on (association tenants) | Committee 360 | F05 |
| `residents.transfer_clearance` | residents | off | Society transfers with fee and clearance | F20 |
| `hr.shifts` | hr | on | Duty roster and on-duty board | F06 |
| `payroll.loans` | payroll | on | Loan ledger and deductions | F07 |
| `payroll.bonuses` | payroll | on | Bonus components | F07 |
| `rentals.owner_statements` | rentals | on | Owner statements | F09 |
| `rentals.owner_payouts` | rentals | off | Recorded owner payouts (needs a management agreement) | F09 |
| `rentals.management_fees` | rentals | on | Fee rules | F09 |
| `banking.cashbook` | banking | on | Cashbook, cash accounts, month close | F10 |
| `receivables.bulk_office_collection` | receivables | off; requires `receivables.office_collections` | Controlled bulk cash/cheque batch | F11 |
| `receivables.reminders` | receivables | on (in-app channel only) | Reminder rules; SMS/WhatsApp also need the metered `communications.sms`/`whatsapp` features | F13 |
| `community_hub.services_directory` | community_hub | on | Vetted local services | F14 |
| `community_hub.polls` | community_hub | on | Informal polls and surveys | F15 |
| `community_hub.resources` | community_hub | on | Documents published to residents | F15 |
| `community_hub.marketplace` | community_hub | **off** | Pre-moderated neighbour listings | F15 |
| `core.data_export` | core | on | Data export and privacy requests | F18 |
| `visitors.live_queue` | visitors | on | Gate asks resident | F19 |
| `parking.vehicle_approvals` | parking | on | Vehicle approval step | F19 |

Existing features are unchanged: `core.multi_entity`, `core.practice_mode`, `receivables.office_collections`, `dues.utility_meters`, `dues.late_fees`, `communications.sms`, `communications.whatsapp`.

## 4. Feature → licence, at a glance

| # | Feature | Licence needed | Separately priced? | Possible metered dimension (Supreme Admin decides; no prices proposed) |
|---|---|---|---|---|
| F01 | Group chat | `community_chat` | Yes (add-on) | Per site, or active chat members |
| F02 | SOS | `safety` | Yes (add-on), restricted | Per site |
| F03 | Login status and invitations | `resident_portal` | No | Uses existing "active portal users" |
| F04 | Community issues | `maintenance` | No | — |
| F05 | Committee and approval policies | `residents` + core | No | — |
| F06 | Staff and shifts | `hr` | Yes for societies (add-on) | Employees (existing optional dimension) |
| F07 | Payroll | `payroll` | Yes for societies (add-on) | Employees paid |
| F08 | Rentals | `rentals` | Yes (add-on) | Active leases |
| F09 | Owner payouts and fees | `rentals` features | Included in rentals | — |
| F10 | Cashbook and close | `banking` | No | — |
| F11 | Bulk collection | `receivables` feature | No | — |
| F12 | Bulk printing | `dues` / `receivables` | No | — |
| F13 | Reminders | `receivables` feature | In-app no; SMS/WhatsApp metered (existing) | Messages sent |
| F14 | Services directory | `community_hub` | Via hub add-on | — |
| F15 | Hub, polls, marketplace | `community_hub` | Yes (add-on) | Per site |
| F16 | Mode switch | core | No | — |
| F17 | Devices and sessions | core | No | — |
| F18 | Export and privacy requests | core | No (data portability should not be paywalled) | — |
| F19 | Live queue and vehicle approvals | `visitors`, `parking` | No | — |
| F20 | Transfer and clearance fees | `residents` feature | No | — |
| F21 | Credit and advances | `receivables` | No; **wallet deferred** | — |

**Rate-card components** for the new add-ons are created by the Supreme Admin in HQ (rate-card management, built in Gate B final). This proposal invents no prices (D-44).

## 5. New illustrative permissions and starter roles

**How permissions work.** As today, each permission belongs to a module (`PERMISSION_MODULE`), and a person gets it only if the tenant licenses that module.

**How the starter roles are used.** The society starters are administrator, manager, treasurer, maintenance, technician, security, and the accounts officer added in C.2. They are shown as proposals; each tenant edits its own roles.

**Legend:** A = administrator, M = manager, T = treasurer, Ac = accounts officer, Mn = maintenance, Te = technician, S = security. ✓ = granted. "own" = only their own records.

| Permission | Module | A | M | T | Ac | Mn | Te | S |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `chat.use` | community_chat | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `chat.groups.manage` | community_chat | ✓ | ✓ | | | | | |
| `chat.moderate` | community_chat | ✓ | ✓ | | | | | |
| `sos.respond` | safety | ✓ | ✓ | | | | | ✓ |
| `sos.configure` | safety | ✓ | | | | | | |
| `sos.review` | safety | ✓ | | ✓ | | | | |
| `portal_access.view` | resident_portal | ✓ | ✓ | ✓ | | | | |
| `portal_access.invite` | resident_portal | ✓ | ✓ | | | | | |
| `issues.view` | maintenance | ✓ | ✓ | | | ✓ | | |
| `issues.manage` | maintenance | ✓ | ✓ | | | ✓ | | |
| `issues.moderate` | maintenance | ✓ | ✓ | | | | | |
| `committee.view` | residents | ✓ | ✓ | ✓ | | | | |
| `committee.manage` | residents | ✓ | | | | | | |
| `approval_policy.manage` | core | ✓ | | | | | | |
| `approval.decide` | core | | | ✓ | | | | |
| `hr.manage` | hr | ✓ | ✓ | | | | | |
| `shifts.manage` | hr | ✓ | ✓ | | | | | |
| `attendance.record` | hr | ✓ | ✓ | | | | | ✓ (own post) |
| `payroll.view` / `payroll.prepare` | payroll | | | | ✓ | | | |
| `payroll.approve` / `payroll.post` | payroll | | | ✓ | | | | |
| `lease.view` / `lease.manage` / `rent.bill` | rentals | ✓ | ✓ | | ✓ | | | |
| `rent.approve` | rentals | | | ✓ | | | | |
| `owner_statement.view` | rentals | ✓ | ✓ | ✓ | ✓ | | | |
| `owner_payout.prepare` | rentals | | | | ✓ | | | |
| `owner_payout.approve` | rentals | | | ✓ | | | | |
| `rentals.configure` | rentals | ✓ | | | | | | |
| `cashbook.view` | banking | ✓ | ✓ | ✓ | ✓ | | | |
| `cash.record` | banking | | | | ✓ | | | |
| `funds_transfer.create` | banking | | | | ✓ | | | |
| `funds_transfer.approve` | banking | | | ✓ | | | | |
| `period.close` | banking | | | ✓ | | | | |
| `payment.batch.confirm` | receivables | | | ✓ | | | | |
| `reminders.manage` / `reminders.send` | receivables | ✓ | | | ✓ | | | |
| `directory.manage` | community_hub | ✓ | ✓ | | | | | |
| `polls.manage` | community_hub | ✓ | ✓ | | | | | |
| `marketplace.moderate` | community_hub | ✓ | ✓ | | | | | |
| `data_export.request` | core | ✓ | | | | | | |
| `data_export.approve` | core | | | ✓ | | | | |
| `privacy.requests.manage` | core | ✓ | | | | | | |
| `vehicles.approve` | parking | ✓ | ✓ | | | | | ✓ |
| `transfer.review` | residents | ✓ | ✓ | | | | | |
| `transfer.approve` / `clearance.issue` | residents | | | ✓ | | | | |

**Developer starters**
- **administration:** the management permissions above.
- **finance:** the money permissions.
- **Unchanged:** sales, project management, inventory and construction.

**Residents** keep `portal.use`. Their reach comes from verified party links, never from staff permissions.

**Maker-checker pairs** are deliberately split across roles:
- `funds_transfer.create` / `funds_transfer.approve`
- `owner_payout.prepare` / `owner_payout.approve`
- `payroll.prepare` / `payroll.approve`
- `data_export.request` / `data_export.approve`
- the collector / `payment.batch.confirm`

On top of the split, the server still checks that the principal who prepared a request is not the one who approves it.

## 6. Dependency checks (what HQ's checker would say)

| Selection | Result |
|---|---|
| `rentals` without `receivables` | Missing → "also enable Receivables" (tenant-wide) |
| `rentals` on site X without `residents` on site X | Site gap → "enable Residents for site X" |
| `community_chat` alone | Missing `residents` (site-scoped: same sites) |
| `payroll` for a society without `hr` | Missing `hr` |
| `safety` (catalogue status restricted) | Refused: "Available after the safety review" (HQ shows it greyed with the reason) |
| `community_hub` + `community_chat` | Integration lights up: polls and listings can link to chat |
| `rentals` + `banking` | Integration: recorded payouts appear in the cashbook |

## 7. Demo tenants (fictional) and when they would gain grants

All grant changes go through recorded contract amendments with an impact preview, as built in Gate B final.

| Tenant | Today | Proposed amendment | Milestone |
|---|---|---|---|
| Al-Noor Residency (community) | Community preset | + `banking.cashbook`, `receivables.bulk_office_collection`, `residents.committee` | S.1 |
| | | + `community_hub`, `community_chat` | D.3 |
| | | + `hr` (+ `payroll` optional) | S.2 |
| Shalimar Court (core + maintenance; residents and visitors from 1 Nov 2026) | Maintenance-only | `maintenance.community_issues` (included); `visitors.live_queue` (from its visitors grant) | D.2 |
| Riverbend Estate Managers (portfolio) | Portfolio preset | + `rentals` on 2 of 3 sites; a new fictional landlord and tenant | S.3 |
| Larkspur, Crescent Bay (developer) | Unchanged | None. Developer demos keep their scope; the register test's "outside the plan" check covers new modules | — |
| Cedar Hills (suspended) | Unchanged | Used to prove that new modules respect suspension (history reads only) | Each milestone |
| A safety demo tenant | — | Decided after the safety review | S.4 |

## 8. Navigation and wording

Each new nav item, quick-create entry, dashboard widget and tour step declares `requires: { modules, permission }`, exactly like the current shell.

| Concept | Developer | Society | Portfolio manager |
|---|---|---|---|
| Rentals area | "Leasing" | "Rentals" | "Rentals & owners" |
| Community area (back office) | "Community" | "Community" | "Community" |
| Resident Community home | "Community" | "Community" (Urdu: کمیونٹی) | "Community" |
| Resident requests (PORTAL-015) | "Requests" | "Requests" | "Requests" (renamed from "Services" to avoid confusion with Local services) |
| Cash | "Cash & bank" | "Cashbook" | "Cash & bank" |
| Committee | — | "Committee" | "Owners' committees" (per site) |
