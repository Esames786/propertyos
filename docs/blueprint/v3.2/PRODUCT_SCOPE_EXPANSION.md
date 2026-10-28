# V3.2 proposal: product scope expansion (Nizam delta)

**Status:** PROPOSAL for owner and reviewer approval. Nothing here is built, and nothing here authorises implementation.

**What it answers.** GitHub Issue #2 and the owner's V3.2 brief: which community-management capabilities PropertyOS adds, where each one lives in the V3.1 modular architecture, and in which frontend-only milestone it would be built.

**The package**

| File | What it holds |
|---|---|
| `PRODUCT_SCOPE_EXPANSION.md` (this file) | Gap analysis and the 21 feature specifications |
| [`MODULE_AND_LICENSING_MATRIX.md`](MODULE_AND_LICENSING_MATRIX.md) | Catalogue changes, editions, dependencies, permissions |
| [`ERD_PROPOSED_CHANGES.md`](ERD_PROPOSED_CHANGES.md) | Logical entities and invariants. Not migrations |
| [`SCREEN_REGISTER_DELTA.csv`](SCREEN_REGISTER_DELTA.csv) | Row-level changes against the live register (the live register is untouched) |
| [`FRONTEND_ONLY_EXECUTION_PLAN.md`](FRONTEND_ONLY_EXECUTION_PLAN.md) | Milestones, acceptance tests, evidence, stop points |
| [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md) | Decisions D-21 to D-44 with recommendations |
| [`../../design/reference/nizam/NIZAM_FEATURES_AND_GAPS.md`](../../design/reference/nizam/NIZAM_FEATURES_AND_GAPS.md) | What the Nizam benchmark showed (text only) |

**Baseline**
- **Register.** The live register as Gate C.2 left it: 396 rows, 337 distinct screens (67 built, 30 partial, 240 planned). The last committed register (Gate C.1) had 335 distinct screens; the owner's brief quotes that number. The delta was checked against both bases.
- **Architecture.**
  - The 27-module catalogue (`2026.10-1`).
  - The access intersection (tenant, module, site, feature, permission, record scope, workflow state).
  - The A2 logical ERD.
  - The society billing and collections engine built in Gates C.1 and C.2.

## 1. Rules this proposal follows

1. **Frontend first.**
   - **What gets built:** React/TypeScript screens, typed mock contracts, simulated state, fictional fixtures and frontend tests.
   - **What does not:**
     - Laravel code or migrations;
     - real messaging, SMS, WhatsApp or push;
     - real payments, banking or payouts;
     - emergency dispatch.
2. **Modules, not one-offs.** Every capability sits behind a module or a feature grant that the Supreme Admin can license per tenant and per site. Access is still the intersection described in A1 §4.
3. **Reuse before adding.** These are extended, not duplicated:
   - the shared invoice engine and allocation;
   - the maintenance request;
   - the approvals family (APR);
   - documents;
   - the HR and payroll modules;
   - banking.

   A capability becomes a new screen only when no existing screen, tab or drawer can carry it.
4. **Privacy by default.**
   - **Debt, login activity and contact details** of one resident are never shown to another.
   - **Staff contact data** reaches residents only with recorded consent.
   - **Counts, not identities:** "affected" counts, poll results and recommendations show numbers only.
5. **Money boundaries hold.**
   - Society money is the association's.
   - Owner rent is the owner's.
   - Nothing settles to the SaaS company.
   - "Recorded" never becomes "paid" or "sent" without the C.2 evidence rules.
6. **Safety first for SOS.**
   - No SOS screen is built before a written safety design is approved.
   - The prototype never implies that help is coming.
7. **Honest status.** Every new or moved screen is `PLANNED`. The register's built/partial counts do not change because of this proposal.

## 2. Summary: the 21 features

**Column keys**
- **Priority** is from Issue #2.
- **Milestone** is the proposed frontend gate (see the execution plan).
- **Add-on** means separately licensed by the Supreme Admin.

| # | Feature | Priority | Home | New or existing | Licensing | New distinct screens | Milestone |
|---|---|---|---|---|---|---:|---|
| F01 | Smart community group chat | P1 | `community_chat` | **NEW module** | Add-on | 3 | D.3 |
| F02 | SOS and emergency management | P1, safety-critical | `safety` | **NEW module** | Add-on | 5 | S.4 (after safety review) |
| F03 | Resident login status and invitations | P0 | `resident_portal` | Existing, new feature | Included | 2 | D.1 |
| F04 | Community complaints and discussions | P0 | `maintenance` | Existing, new feature | Included | 2 | D.2 |
| F05 | Committee management and approval policies | P0 | `residents` + core APR | Existing | Included | 1 | S.1 |
| F06 | Society staff, shifts and attendance | P1 | `hr` | Existing, newly offered to societies | Add-on for societies | 1 | S.2 |
| F07 | Optional society payroll | P2 | `payroll` | Existing, newly offered to societies | Add-on for societies | 0 | S.2 (optional) |
| F08 | Rentals and lease management | P2 | `rentals` | **NEW module** | Add-on | 5 | S.3 |
| F09 | Owner payouts and management fees | P2 | `rentals` | Part of F08 | Feature of `rentals` | 3 | S.3 |
| F10 | Cashbook, transfers and month closing | P0 | `banking` (+ `accounting` if granted) | Existing, new feature | Included with banking | 1 | S.1 |
| F11 | Bulk payment collection | P0 | `receivables` | Existing, new feature | Included (needs office collections) | 1 | S.1 |
| F12 | Bulk maintenance bill printing | P0 | `dues`, `receivables` | Existing | Included | 0 | S.1 |
| F13 | Resident payment reminders | P0 | `receivables` + `communications` | Existing, new feature | Included; SMS/WhatsApp metered | 1 | S.1 |
| F14 | Services directory | P1 | `community_hub` | **NEW module** | Add-on (feature) | 1 | D.3 |
| F15 | Community hub, polls and marketplace | P1 | `community_hub` + `resident_portal` | **NEW module** | Add-on; marketplace off by default | 3 (+1 merged) | D.3 |
| F16 | Resident/management mode switching | P0 | core | Existing | Included | 1 | D.1 |
| F17 | Device and session management | P0 | core | Existing | Included | 0 | D.1 |
| F18 | Backup, data export, privacy requests | P0 | core | Existing, new feature | Included | 1 | D.1 |
| F19 | Visitor live queue and vehicle approvals | P1 | `visitors`, `parking` | Existing, new features | Included | 1 | D.2 |
| F20 | Property transfer and clearance fees | P2 | `residents` + `dues` | Existing | Included | 0 | S.1 |
| F21 | Resident credit balances; future wallet | P2 | `receivables` | Existing | Included; **wallet deferred** | 0 | S.1 |
| | **Total** | | | 4 new modules | | **32 new; 1 merged** | |

**Effect on the register**
- **Distinct screens:** 337 → **368**. That is 32 new screens, with Community notices folding into the new Community home.
- **Rows:** 396 → **453**. The 32 new screens add 25 tab/drawer rows that do not count as screens.
- **Changed rows:** 48 existing rows change. Most of them move earlier (re-gated), or are opened to the community edition.
- **Already planned, now scheduled earlier:** 31 screens move from Gates E and G into the new milestones, because societies need them sooner: HR ×9, payroll ×7, approvals ×5, banking ×3, finance overview, transfers ×2, vehicle registry, quick broadcast, documents, and the user workspace.

**Already covered; nothing new added**
- the residents directory;
- monthly billing;
- dues and aging;
- payment proof verification;
- additional collections (assessments, BILL-007);
- work orders;
- vendors and suppliers;
- notices;
- roles and permissions;
- language and text size;
- the tenant's plan page.

**Proposed for rejection or deferral**
- Resident-visible defaulter lists: **rejected**.
- Public resident "standing" badges: rejected. A private, opt-in "your account is up to date" is allowed.
- Interest circles: deferred. Nizam has not built them either.
- Formal elections and AGM ballots: deferred until bylaw and legal review.
- A funded wallet (top-up, withdrawal, peer transfer): deferred until financial and legal review.
- Live support chat with the SaaS team: out of scope here; it belongs to Platform HQ support.
- A calendar: covered by the amenity and visit calendars.

## 3. How the features connect to today's workflows

- **Society (Al-Noor Residency, community edition).**
  - Monthly billing (C.1) and collections (C.2) gain:
    - print packs;
    - reminders;
    - a controlled bulk cash batch;
    - a cashbook with month close.

    All of these read the same invoices, payments and receipts. None of them creates a second ledger.
  - **Requests.** Community issues sit beside flat repairs as one kind of request.
  - **Committee.** The committee's offices map to the roles that already approve billing runs.
  - **Chat and community.** These use the verified party links that C.2 uses for bills. So a tenant-payer of A-102 is in the right block group, and is never in the owners-only committee group.
- **Maintenance-only client (Shalimar Court: core + maintenance, with residents and visitors from 1 Nov 2026).**
  - Gets community issues and the live gate queue as soon as those grants start.
  - It keeps never reaching CRM, sales or finance areas it does not license.
- **Portfolio manager (Riverbend, portfolio edition).**
  - Licenses `rentals` to collect rent for owners across three sites.
  - Owner statements and payouts are recorded per owner, under a management agreement.
  - Rent invoices use their own billing account kind (`lease`). Society dues stay on the `dues` account.
- **Developer (Larkspur, Crescent Bay).**
  - When a handed-over tower becomes a managed building, the same society features apply per site.
  - Developer-only areas (CRM, sales, construction) are unchanged.
- **Resident app.**
  - One home shows:
    - bills (and rent, if the person is also a tenant under a lease);
    - requests;
    - visitors;
    - community.

    Each part appears only when licensed.
  - **People with both roles.** A person who is also staff switches apps without losing either scope.

## 4. Feature specifications

**What each section covers**
- home module and licence;
- personas and permissions;
- screens (from the delta);
- record connections;
- ERD additions;
- mock state and action contract;
- resident and mobile experience;
- onboarding and tour;
- privacy, security and safety controls;
- tests;
- milestone and status.

**Shared rules**
- **Permission keys** are illustrative, like today's catalogue (`packages/contracts/src/permissions.ts`); the backend decides the final set at Gate H.
- **Mobile and Urdu:** every screen meets the existing bar:
  - EN/UR with RTL;
  - 1440 / 768 / 390 px and 320 px reflow;
  - text at 200 %;
  - keyboard paths;
  - axe with no violations;
  - the manual screen-reader checklist kept open.

### F01. Smart community group chat
- **Home:** NEW add-on module `community_chat` (site scope).
  - Requires `residents`.
  - Integrates with `resident_portal`, `communications` (notification preferences), `hr` (staff-role groups) and `residents.committee`.
- **Why a module:**
  - It has its own running cost (real-time delivery at Gate H).
  - It carries moderation and retention obligations.
  - Some tenants will not want it.
- **Personas and permissions:**
  - residents and staff: `chat.use`;
  - building manager: `chat.groups.manage`;
  - a moderator (manager or committee secretary): `chat.moderate`.

  Residents use the portal (`portal.use` + module).
- **Screens:**
  - CHAT-001 inbox and conversations, with states CHAT-002 (phone route) and CHAT-004 (report);
  - CHAT-003 groups and moderation;
  - PORTAL-031 resident chat (PORTAL-032 is its phone route).
- **Connections:**
  - **Smart groups** are rules over facts that already exist:
    - site, building and floor (from `units` and current `occupancies` and ownerships);
    - the staff role (`tenant_users` roles);
    - committee terms (F05).
  - **Messages** may link to a notice (RES-005), a community issue (MNT-003) or a unit. A linked record is shown only if the reader may open it.
- **ERD:**
  - `chat_audience_rules`, `chat_groups`, `chat_memberships` (`visible_from` = join date);
  - `chat_messages`, `chat_message_reads`, `chat_reports`, `chat_blocks`.

  See ERD §2.1.
- **Mock contract:**
  - `GET /chat/groups`
  - `GET /chat/groups/:id/messages?before=`
  - `POST /chat/groups/:id/messages` (stays in the browser's demo store)
  - `POST /chat/messages/:id/report`
  - `GET /chat/rules/:id/preview` (who is in a group and why)
  - Message states: sent (demo), removed (tombstone), reported, hidden.
- **Resident and mobile:**
  - A full-screen conversation on phones, and a split view on desktop.
  - Urdu messages are right-aligned, with mixed-script (bidi) isolation for names and flat codes.
  - Chat takes the raised centre slot of the bottom bar **only if** the tenant licenses it. Otherwise Pay stays central, keeping today's primary action.
  - Unread badges carry a text count for screen readers.
- **Onboarding:**
  - `CHAT-TOUR-001` (staff) and `PORTAL-CHAT-TOUR-001` (resident) explain smart groups and what others can see.
  - Spotlight tours, not a modal carousel.
- **Privacy and safety:**
  - No automatic history: new members see messages from their join date.
  - Moving out or ending a term removes membership on its end date.
  - Direct messages between residents are **off by default** (D-25).
  - Moderators see only reported messages, never private conversations.
  - Report and block are always available.
  - Retention is set per tenant.
  - Phone numbers are never shown in chat.
  - A demo label marks fixture conversations.
- **Tests:**
  - **Membership vectors:** a tenant-payer is in the block group but not the owners' committee group; after move-out the person loses access; a new joiner cannot read earlier messages.
  - **Leaks:** a cross-tenant or cross-site leak test.
  - **Moderation:** the reported → hidden flow.
  - **Accessibility and layout:** axe EN/UR; 320 px reflow.
- **Milestone:** D.3. **Status:** PLANNED.

### F02. SOS and emergency management (safety-critical)
- **Home:** NEW add-on module `safety` (site scope).
  - Requires `residents`.
  - Integrates with `hr` (duty roster), `visitors` and `communications`.
- **Gating:**
  - **Blocked** until a written safety design is approved (D-26).
  - That design must cover:
    - recipients and escalation;
    - acknowledgement and timeouts;
    - false alarms;
    - offline and failure behaviour;
    - accessibility for people under stress;
    - privacy;
    - liability wording.
- **Personas and permissions:**
  - resident: `portal.use` + module;
  - guard: `sos.respond`;
  - manager: `sos.respond`, `sos.configure`;
  - committee or safety officer: `sos.review`.
- **Screens:**
  - SOS-001 safety console (SOS-005 history and drills);
  - SOS-002 Incident 360;
  - SOS-003 safety settings;
  - SOS-004 staff alert overlay;
  - PORTAL-033 resident SOS.
- **Connections:**
  - an incident → its unit and site;
  - responders → the duty roster (F06);
  - emergency contacts → the person (with consent);
  - the closure note → the incident's audit trail.
- **ERD:** `safety_settings` (versioned), `safety_responders`, `sos_incidents`, `sos_incident_events` (append-only), `emergency_contacts`. See ERD §2.2.
- **Mock contract:**
  - `POST /safety/incidents`
  - `POST /safety/incidents/:id/{acknowledge,respond,escalate,note,resolve,false-alarm,cancel}`
  - States: raised → acknowledged → responding → resolved | false_alarm | cancelled.
  - All events are simulated by a visible demo control.
- **Resident and mobile:**
  - A large, high-contrast control with two-step activation (press and hold, or confirm) to avoid accidental alerts.
  - After sending, the screen shows:
    - who was notified (simulated);
    - acknowledgement state;
    - always: "This is not an emergency service. Call 15 (police) or 1122 (rescue) if you are in danger."

    The numbers are configurable per region.
  - The control is reachable within two actions from every resident screen.
  - It works at 200 % text and with a screen reader, using an assertive announcement.
- **Onboarding:** a mandatory explanation on first use, plus a staff drill mode (SOS-005).
- **Privacy and safety:**
  - Unit-level location only. No GPS tracking.
  - Incident timelines cannot be edited.
  - Access is limited to responders and reviewers.
  - A false alarm is never penalised automatically.
  - The prototype never shows "help is on the way".
  - Failure states tell the person to call the national number.
- **Tests:** written after the safety review. At minimum:
  - activation needs two steps;
  - the escalation timer;
  - the failure state shows the national numbers;
  - axe on the overlays;
  - no-leak tests.
- **Milestone:** S.4, only after the safety review. **Status:** PLANNED, blocked.

### F03. Resident login status and invitations
- **Home:** `resident_portal`, new feature `resident_portal.adoption`. Included; no separate licence.
- **Personas and permissions:**
  - manager or administrator: `portal_access.view`, `portal_access.invite`;
  - treasurer: view only;
  - residents accept an invitation token.
- **Screens:**
  - RES-007 portal access and invitations (RES-009 invite drawer);
  - SITE-009 Unit 360 portal tab;
  - AUTH-007 accept invitation, which leads to PORTAL-030 (welcome and text size).
- **Connections:**
  - an invitation → a person with a verified owner, occupant or payer link → a unit;
  - acceptance creates the verified `party_user_link` that C.2's resident access already relies on.
- **ERD:**
  - `portal_invitations`;
  - `portal_activity_summaries` (date-level, derived);
  - central `global_user_sessions` (F17).
  - Status is a derived view: invited / active (30 days) / inactive / never signed in / vacant.
- **Mock contract:**
  - `GET /portal-access?status=`
  - `POST /portal-invitations`
  - `POST /portal-invitations/:id/{resend,revoke}`
  - `GET/POST /invitations/:token(/accept)`
  - Invitation states: created → sent (simulated) → opened → accepted | expired | revoked.
- **Resident and mobile:**
  - The invitation lands on a short, bilingual accept page.
  - It shows the society and flat being joined, and offers language, then the text-size step built in C.2.
  - Printed invitation codes are an option for residents without smartphones.
- **Onboarding:** the building manager tour gains a "Get residents on the app" step.
- **Privacy and security:**
  - Only staff with permission see status.
  - Activity is a date ("last active 3 Nov"), never a log or IP address.
  - Residents never see others' status.
  - Contact consent is checked per channel before a (simulated) message.
  - Resends are rate-limited.
  - Tokens are single-use and expire.
- **Tests:**
  - status derivation vectors;
  - consent refusal;
  - resend limit;
  - expired token;
  - no-leak (a resident cannot open RES-007);
  - axe EN/UR.
- **Milestone:** D.1. **Status:** PLANNED.

### F04. Community complaints and discussions
- **Home:** `maintenance`, new feature `maintenance.community_issues`. Included.
  - One request entity with a `kind` field (unit repair | community issue).
  - No second ticket system.
- **Personas and permissions:**
  - residents raise and affirm (`portal.use`);
  - manager: `issues.view`, `issues.manage`;
  - moderator: `issues.moderate`;
  - technician: work orders (`workorder.update`), as today.
- **Screens:**
  - MNT-012 community issues board (MNT-013 merge drawer);
  - MNT-002/003 reused (filter by kind; Request 360 gains Affected, Discussion and Merged tabs);
  - PORTAL-034 resident issues (PORTAL-035 raise drawer).
- **Connections:**
  - an issue → common area (site area, building or asset) → work orders → vendor bill (if `payables`);
  - duplicates merge into one issue, keeping their affirmations.
- **ERD:**
  - new columns on `maintenance_requests`: `kind`, `visibility`, `area_ref`, `merged_into_id`, `public_summary`;
  - new tables `request_affirmations` and `request_comments` (public or staff-internal).
- **Mock contract:**
  - `GET /issues?status=`
  - `POST /issues/:id/{assign,merge,resolve,hide}`
  - `POST /portal/issues`
  - `POST /portal/issues/:id/{affirm,withdraw,comment}`
  - States: new → triaged → in_progress → resolved | merged | hidden.
- **Resident and mobile:**
  - "Open near me" sorts issues by the resident's building.
  - A large "This affects me too" toggle, which can be withdrawn.
  - A photo is optional, and there is an alternative-text prompt for it.
  - Status changes notify followers.
- **Onboarding:** a resident tour step in Services → Community issues; a manager tour of triage and merge.
- **Privacy:**
  - Residents see counts, never who else is affected.
  - Comments are moderated, with staff-internal notes kept separate.
  - A private flat repair never becomes public without its reporter's consent.
- **Tests:**
  - affirmation counting and withdrawal;
  - merge keeps counts;
  - identity hidden from residents;
  - moderation;
  - the repair/issue separation;
  - axe EN/UR.
- **Milestone:** D.2. **Status:** PLANNED.

### F05. Committee management and approval policies
- **Home:**
  - `residents` gets the new feature `residents.committee` (roster, offices, meetings, decisions).
  - Core APR gets **versioned approval policies**, used by expenses, work orders, vendor bills, funds transfers, payouts, refunds and month reopening.
  - Both are included.
- **Personas and permissions:**
  - secretary or manager: `committee.manage`;
  - members: `committee.view`;
  - treasurer and president: `approval.decide`;
  - administrator: `approval_policy.manage`, with maker-checker.
- **Screens:**
  - RES-008 Committee 360;
  - APR-001…005 reused and scheduled earlier (S.1, because funds transfers, payouts and month reopening need them);
  - APR-004 becomes "Approval policies (versioned thresholds)", following the pattern of HQ's commercial policy (HQ-026).
- **Connections:**
  - Committee offices link to tenant roles, so the treasurer office *is* the role that already approves billing runs (C.1).
  - Approval requests link to their subject (expense, payout…) and to the policy version that required them.
  - Minutes are documents.
- **ERD:**
  - `committees`, `committee_offices`, `committee_terms` (effective-dated), `committee_meetings`, `committee_decisions`;
  - `approval_policies` and `approval_policy_rules` (versioned);
  - `approval_requests` and `approval_decisions`.
- **Mock contract:**
  - `GET /committee`
  - `POST /committee/{terms,meetings,decisions}`
  - `GET/POST /approval-policies/versions` (+ approve)
  - `GET /approvals?mine=`
  - `POST /approvals/:id/{approve,reject}`
- **Resident and mobile:**
  - The Committee tab on Community home shows names and offices.
  - Contact details appear only with each member's consent.
  - Published decisions appear only if the committee publishes them.
- **Onboarding:** a "set up your committee" checklist item on the site checklist (SITE-008).
- **Security:**
  - No hardcoded thresholds: every amount is configured and versioned.
  - A requester never approves their own request (checked by principal).
  - Delegation is time-bound and audited.
  - Billing-run and beneficiary maker-checker stay exactly as C.1/C.2 built them.
- **Tests:**
  - effective-dated terms;
  - policy version selection by date;
  - maker ≠ checker;
  - delegation expiry;
  - axe.
- **Milestone:** S.1. **Status:** PLANNED.

### F06. Society staff, shifts and attendance
- **Home:**
  - The existing `hr` module, now **also offered to community and portfolio editions as an add-on** (today it is developer-only).
  - A new feature, `hr.shifts`.
  - No separate "society staff" module.
- **Personas and permissions:**
  - manager: `hr.view`, `hr.manage`, `shifts.manage`;
  - guard supervisor: `attendance.record`;
  - staff can see their own roster.
- **Screens:**
  - HR-001…006 and HR-009, re-gated: the society slice moves to S.2, developer specifics stay in E;
  - new HR-010 shifts and duty roster (HR-011 "on duty now").
- **Connections:**
  - an employee → shifts → attendance → leave;
  - the on-duty roster → safety responders (F02) and the resident "Staff on duty" tab (F15).
- **ERD:**
  - new: `shift_templates`, `shift_assignments`, `attendance_records`, `leave_requests`, `staff_public_profiles` (consented);
  - extended: the V2.1 HR entities.
- **Mock contract:**
  - `GET /hr/roster?week=`
  - `POST /hr/roster/assignments`
  - `POST /hr/attendance`
  - Attendance states: planned / present / late / absent / on leave.
- **Resident and mobile:**
  - Residents see role and on-duty state only, plus name and photo if the staff member consents.
  - Staff phone numbers are never shown to residents.
- **Onboarding:** an HR tour for community tenants that skips developer-only steps.
- **Privacy:**
  - Staff personal data is visible only to HR roles.
  - Attendance is visible to managers and the person.
- **Tests:**
  - overnight shifts;
  - no double booking;
  - consent gates the public profile;
  - edition gating (a community tenant without the add-on gets the "not in your plan" page).
- **Milestone:** S.2. **Status:** PLANNED.

### F07. Optional society payroll
- **Home:**
  - The existing `payroll` module (requires `hr`), offered to societies as an add-on.
  - Loans become a ledger beside advances (HR-007/008 renamed).
  - Bonuses and loan deductions are pay components (PAY-004).
- **Personas and permissions:**
  - accounts officer: `payroll.prepare`;
  - treasurer: `payroll.approve` (maker ≠ checker);
  - posting: `payroll.post`.
- **Screens:**
  - PAY-001…007 and HR-007/008, re-gated to S.2 (optional).
  - No new screens.
- **Connections:**
  - payroll run → items → components (bonus, loan instalment, advance recovery);
  - payout recorded → cashbook movement (F10).
- **ERD:**
  - `employee_loans`, `loan_repayments`, `pay_components`;
  - extended: the V2.1 payroll entities.
- **Mock contract:**
  - `POST /payroll/runs`
  - `POST /payroll/runs/:id/{calculate,approve,post}`
  - States: draft → calculated → approved → posted (recorded); "completed with errors" is shown per item.
- **Resident and mobile:** none. Staff payslips are a later decision.
- **Privacy and compliance:**
  - Salaries are visible only to payroll roles.
  - Statutory deductions are **placeholders, labelled as such**, until a tax and labour adviser confirms them.
  - No bank disbursement.
- **Tests:**
  - a loan instalment reduces the balance;
  - net-pay vectors;
  - maker ≠ checker;
  - nothing is labelled "paid".
- **Milestone:** S.2 (optional slice). **Status:** PLANNED.

### F08. Rentals and lease management
- **Home:**
  - NEW add-on module `rentals` (site scope).
  - Requires `residents` and `receivables`.
  - Integrates with `banking`, `payables`, `accounting`, `resident_portal` and `communications`.
- **Personas and permissions:**
  - property manager: `lease.view`, `lease.manage`, `rent.bill`;
  - finance: `rent.approve`;
  - landlord (portal): own leases;
  - tenant (portal): own rent bills.
- **Screens:**
  - RNT-001 leases;
  - RNT-002 Lease 360 (RNT-008 renew/terminate, RNT-009 deposit refund);
  - RNT-003 new lease wizard;
  - RNT-004 rent roll and billing;
  - PORTAL-037 landlord view;
  - PORTAL-004 shows rent as a separate account.
- **Connections:**
  - lease → unit → landlord and tenant parties;
  - rent schedule → rent invoices through the **shared invoice engine** (`source_type = lease_schedule`), on a billing account of kind `lease`;
  - payments, allocations, receipts and statements are reused from C.2.

  Rent liability is separate from society-dues liability, so A-102's tenant can owe rent to the landlord while the owner still owes maintenance, or the reverse.
- **ERD:**
  - `leases` and `lease_parties`;
  - `rent_schedules` (snapshots);
  - `security_deposits`;
  - `management_agreements` (F09);
  - new enum values: `billing_accounts.kind = lease` and `customer_invoices.source_type = lease_schedule`.
- **Mock contract:**
  - `GET /rentals/leases`
  - `POST /rentals/leases`
  - `POST /rentals/leases/:id/{activate,renew,terminate}`
  - `POST /rentals/rent-roll/:period/{preview,approve,post}` (idempotent)
  - Lease states: draft → active → renewal_due → renewed | terminated | expired.
- **Resident and mobile:**
  - Tenants see "Rent" next to "Society bills" with separate balances.
  - Landlords see properties, rent status and statements.
- **Onboarding:** a rentals tour for portfolio managers; an empty state that leads to the wizard.
- **Privacy and compliance:**
  - A landlord sees the tenant's name and rent status for that unit only.
  - Deposits are liabilities, never income.
  - Rent tax withholding is configurable and adviser-confirmed (D-33).
- **Tests:**
  - rent vectors (proration, escalation);
  - idempotent posting;
  - the separation of rent and dues accounts;
  - landlord scope;
  - entity isolation.
- **Milestone:** S.3. **Status:** PLANNED.

### F09. Owner payouts and management fees
- **Home:** `rentals`, with the features `rentals.owner_statements`, `rentals.owner_payouts` and `rentals.management_fees`.
- **Personas and permissions:**
  - accounts: `owner_statement.view`, `owner_payout.prepare`;
  - a second person: `owner_payout.approve`;
  - administrator: `rentals.configure`.
- **Screens:** RNT-005 owner statements, RNT-006 owner payouts (recorded), RNT-007 rental settings (fees, deposits, agreements).
- **Connections:**
  - **Statement lines** derive from:
    - rent collected (payments on lease invoices);
    - management fee (per agreement);
    - approved owner expenses (payables);
    - payouts.
  - **A recorded payout** produces a cashbook movement (F10).
- **ERD:** `management_agreements` (written authority), `owner_statements`, `owner_payouts`.
- **Mock contract:**
  - `GET /rentals/owner-statements`
  - `POST /rentals/owner-statements/:id/issue`
  - `POST /rentals/payouts`
  - `POST /rentals/payouts/:id/{approve,reject,record}`
  - Payout states: draft → awaiting_approval → recorded | rejected. **Never "sent" or "paid out".**
- **Compliance:**
  - Collecting rent on an owner's behalf requires a management agreement with written authority (extends D-15).
  - Client money must be tracked per owner.
  - Legal review covers trust-account obligations before Gate H (D-33).
- **Tests:**
  - statement arithmetic vectors;
  - payout ≤ payable;
  - maker ≠ checker;
  - a fee needs an agreement.
- **Milestone:** S.3. **Status:** PLANNED.

### F10. Cashbook, transfers and month closing
- **Home:** `banking`, new feature `banking.cashbook`.
  - Cash and petty cash become **account kinds**.
  - Month close uses **one period lock per legal entity**, shared with `accounting` (ACC-009) when that module is granted.
- **Personas and permissions:**
  - accounts: `cashbook.view`, `cash.record`;
  - treasurer: `period.close`, and approval of transfers (`funds_transfer.approve`);
  - reopening a month goes through an approval policy (F05).
- **Screens:**
  - new BANK-007 cashbook (BANK-008 close-month review, BANK-009 record movement);
  - reused and scheduled earlier: BANK-001 (cash accounts tab), BANK-002 (cashbook tab), BANK-006 (deposits and transfers), FIN-001 (society finance overview).
- **Connections:**
  - The cashbook is a **projection**: payments, expenses, supplier payments, payroll, owner payouts and transfers each create one movement.
  - Manual movements exist only for "other income/expense" when `payables` is not granted.
  - Closing checks:
    - unreconciled lines (BANK-004);
    - proofs waiting (FIN-008);
    - unposted runs (BILL-008);
    - a cash count.
- **ERD:**
  - `cash_movements` (projection plus manual);
  - `funds_transfers`;
  - `cash_counts`;
  - `fiscal_periods`, moved to the finance core (shared);
  - the derived `period_close_checks`.
- **Mock contract:**
  - `GET /cashbook?account=&period=`
  - `POST /cashbook/movements`
  - `POST /funds-transfers`
  - `POST /funds-transfers/:id/{approve,record}`
  - `POST /periods/:id/{close,reopen-request}`
  - Period states: open → closing → closed → reopened (approved).
- **Resident and mobile:** none directly. The optional "Society accounts" tab shows committee-published aggregate summaries (F15).
- **Controls:**
  - Opening + in − out = closing per account.
  - Closed months refuse new movements; corrections are reversals in an open month.
  - Transfers stay within one legal entity (I-19).
  - Cash counts are witnessed.
- **Tests:**
  - cashbook vectors;
  - the period lock;
  - a reopen needs approval;
  - a cross-entity transfer is refused;
  - the cashbook equals source records (no double counting).
- **Milestone:** S.1. **Status:** PLANNED.

### F11. Bulk payment collection (controlled)
- **Home:** `receivables`, new feature `receivables.bulk_office_collection`.
  - Requires `receivables.office_collections`, and the site's payment-method rules must allow cash or cheque (BILL-012, built in C.2).
- **Personas and permissions:**
  - collector (accounts officer or manager): `payment.receive.office`;
  - a second person (treasurer): `payment.batch.confirm`.
- **Screens:** new FIN-013 bulk office collection (FIN-014 batch review); FIN-007 stays for single payments.
- **Connections:**
  - batch lines → billing account → that payer's invoice lines (the C.2 allocation rules: oldest first, this payer only);
  - confirmation creates payments and receipts;
  - a later cash deposit (F10) links the batch to the bank.
- **ERD:** `office_collection_batches`, `office_collection_lines`.
- **Mock contract:**
  - `POST /office-collections`
  - `POST /office-collections/:id/{submit,confirm,return}`
  - States: draft → submitted → confirmed | returned.
- **Controls:**
  - The counted total must equal the sum of the lines.
  - Nothing shows as Paid before confirmation.
  - Each line settles only its payer's lines.
  - Cheques record their number and show as "cheque received", not paid, until cleared (status-only in the prototype).
- **Tests:**
  - total mismatch is refused;
  - confirmer ≠ collector;
  - per-payer allocation;
  - no Paid before confirmation;
  - cash disabled → refused (C.2 behaviour kept).
- **Milestone:** S.1. **Status:** PLANNED.

### F12. Bulk maintenance bill printing
- **Home:** `dues` and `receivables`. Included.
- **Screens:**
  - BILL-018, the print pack for a posted run (a drawer of BILL-008);
  - COL-008, printing dues notices (a drawer of COL-005).
  - No new screens.
- **Connections:** a print pack → the run's posted invoices; dues notices → each liable payer's outstanding lines.
- **ERD:** `document_batches` (kind, source, page count, generated file reference).
- **Mock contract:** `POST /document-batches` (generated in the browser), with states requested → ready.
- **UX:**
  - Print styles for A4 and A5.
  - Urdu shaping and RTL in the PDF.
  - The PDF text can be read by assistive technology, with a tagged structure where the tooling allows.
- **Controls:**
  - Each notice is addressed to the liable payer only.
  - A shared account prints per payer.
- **Tests:**
  - page count = posted invoices;
  - per-payer notices;
  - Urdu print snapshot.
- **Milestone:** S.1. **Status:** PLANNED.

### F13. Resident payment reminders
- **Home:** `receivables`, new feature `receivables.reminders`.
  - Delivery uses `communications`. SMS and WhatsApp are the existing metered features, simulated in the prototype.
- **Personas and permissions:** accounts: `reminders.manage`, `reminders.send`.
- **Screens:** new COL-007 reminder rules and history; COL-009 send-reminder drawer on COL-005 and BILL-002.
- **Connections:** reminder policy version → reminder events (the existing `reminder_events`) → templates (NOT-004) → consent records.
- **ERD:** `reminder_policies` (versioned), `contact_consents`, and new columns on `reminder_events` (policy, channel, consent result).
- **Mock contract:**
  - `GET/POST /reminders/policies`
  - `POST /reminders/preview`
  - `GET /reminders/history`
  - Delivery states: queued → would-send (demo) | skipped (reason).
- **Controls:**
  - Reminders go only to the liable payer.
  - They are skipped if paid, or if a proof is waiting for verification.
  - Quiet hours apply, with a monthly cap and consent per channel.
  - Wording is respectful, with no threats; late-fee mentions appear only when late fees are enabled (D-11).
- **Tests:**
  - skip rules;
  - quiet hours;
  - the cap;
  - consent;
  - shared-account payer targeting.
- **Milestone:** S.1. **Status:** PLANNED.

### F14. Services directory
- **Home:** NEW add-on module `community_hub`, feature `community_hub.services_directory`.
- **Personas and permissions:** manager: `directory.manage`; residents view and recommend.
- **Screens:** new CMTY-001 local services directory; resident tab "Local services" in PORTAL-036.
- **Connections:** a provider may link to a supplier (`payables`) when the society also uses them, but the two are separate records.
- **ERD:** `service_categories`, `service_providers` (with consent and vetting), `service_recommendations` (counts), `provider_reports`.
- **Mock contract:**
  - `GET /community/services`
  - `POST /community/services/:id/{vet,suspend}`
  - `POST /portal/services/:id/{recommend,report}`
- **Controls:**
  - Only vetted providers are listed.
  - The provider's consent to show contact details is recorded.
  - Recommendations are counts only: no free-text reviews in this phase.
  - A disclaimer says the society does not guarantee the work.
- **Tests:** an unvetted provider is hidden; consent gates contact details; a report suspends the listing.
- **Milestone:** D.3. **Status:** PLANNED.

### F15. Community hub, polls and marketplace
- **Home:** `community_hub` with three features:
  - `community_hub.polls`;
  - `community_hub.resources` (reuses documents);
  - `community_hub.marketplace` (**off by default**).

  The resident **Community home** (PORTAL-036) belongs to `resident_portal` and shows only licensed tabs. Announcements stay in `communications` (RES-005, NOT-003), so official notices remain one-way and auditable.
- **Personas and permissions:**
  - manager: `polls.manage`, `hub.manage`;
  - moderator: `marketplace.moderate`;
  - residents read, vote and post listings.
- **Screens:**
  - new: CMTY-002 polls and surveys (CMTY-004 detail), CMTY-003 marketplace moderation, PORTAL-036 Community home (PORTAL-038 listing, PORTAL-039 vote);
  - folded in: PORTAL-023 Community notices becomes its Notices tab;
  - reused: DOC-001 (publish to residents), RES-005, NOT-003.
- **Connections:**
  - **Poll audiences** reuse the smart-group rules (F01).
  - **Resources** are documents marked "published to residents".
  - **Society accounts** shows `published_financial_summaries` that the committee approves (aggregate only).
- **ERD:**
  - `polls`, `poll_options`, `poll_responses` (anonymous mode separates voter tokens);
  - `marketplace_listings`, `listing_reports`;
  - `published_financial_summaries`.
- **Mock contract:**
  - `GET/POST /community/polls`
  - `POST /community/polls/:id/{open,close,publish}`
  - `POST /portal/polls/:id/respond`
  - `GET/POST /community/listings`
  - `POST /community/listings/:id/{approve,remove}`
- **Resident and mobile:**
  - Tabs scroll horizontally on phones. Each tab has its own empty state that explains it.
  - Polls show "Informal poll — not a formal vote under the bylaws".
  - Marketplace contact goes through in-app messages only (chat if licensed), never phone numbers.
- **Controls:**
  - One response per eligible flat or person (set per poll).
  - Anonymous polls never reveal voters to staff.
  - Marketplace listings are pre-moderated, follow a prohibited-items list, expire, and involve no in-app payment.
- **Tests:**
  - one-response rule;
  - anonymity;
  - results visibility timing;
  - listing moderation;
  - hidden tabs when unlicensed;
  - no debt or contact leaks.
- **Milestone:** D.3. Marketplace is optional (D-31). **Status:** PLANNED.

### F16. Resident/management mode switching
- **Home:** core identity. One global sign-in per person (D-17), now with both a staff membership and a verified resident link. Not a licence.
- **Screens:** new GLOBAL-015, the app switcher (header in the back office; Profile in the resident app via PORTAL-024).
- **Connections:** the same `global_user` → a `tenant_user` with staff roles **and** `party_user_links`. Each app keeps its own session scope.
- **ERD:** no new tables. The session gains `active_app`.
- **Mock contract:** `POST /session/switch-app` returns an app-scoped session; the query cache is cleared per app.
- **Security:**
  - No staff data in the resident app, and no resident-only view in the back office.
  - Every switch is audited.
  - A suspended staff role does not affect resident access, and the reverse holds too.
- **Tests:**
  - no data leaks across the switch (cache, search, recent records — the CP2 tenant-switch tests applied to apps);
  - a person with one role does not see the switcher.
- **Milestone:** D.1. **Status:** PLANNED.

### F17. Device and session management
- **Home:** core. Included.
- **Screens:**
  - GLOBAL-016 (staff profile tab) and PORTAL-041 (resident profile tab);
  - ADM-003 user workspace gains a Sessions tab, so an admin can revoke a staff member's sessions.
  - No new distinct screens.
- **ERD:** central `global_user_sessions` (device label, platform, last seen, revoked).
- **Mock contract:**
  - `GET /me/sessions`
  - `POST /me/sessions/:id/revoke`
  - `POST /me/sessions/revoke-others`
  - `POST /users/:id/sessions/revoke` (admin)
- **Controls:**
  - Last-seen time is approximate.
  - IP addresses are hashed or shown only as an approximate location, at most.
  - Admin revocation is audited and visible to the user.
- **Tests:** revoke one session; revoke all others; admin revoke is audited.
- **Milestone:** D.1. **Status:** PLANNED.

### F18. Backup, data export and privacy requests
- **Home:** core, new feature `core.data_export`. Included.
- **Personas and permissions:**
  - administrator: `data_export.request`;
  - a second administrator or the committee: `data_export.approve`;
  - privacy officer: `privacy.requests.manage`;
  - residents request access to, or deletion of, their own data in Profile.
- **Screens:** new ADM-024, data export and privacy requests.
- **Connections:**
  - Datasets are limited to the tenant's granted modules and the requester's permissions.
  - Each export is audited (ADM-021).
  - A deletion request is checked against retention rules: financial records are kept and anonymised where the law allows.
- **ERD:** `data_export_jobs`, `privacy_requests`.
- **Mock contract:**
  - `POST /data-exports`
  - `POST /data-exports/:id/{approve,reject}`
  - `GET /privacy-requests`
  - `POST /privacy-requests/:id/decide`
  - Export states: requested → approved → generating (simulated) → ready → expired | rejected.
- **Controls:**
  - Maker ≠ checker.
  - A personal-data warning appears.
  - Download links expire.
  - The file is a fictional demo file.
  - Exports never cross legal entities without explicit selection.
- **Tests:**
  - scope limited by grants;
  - approval required;
  - expiry;
  - retention rule outcomes.
- **Milestone:** D.1. **Status:** PLANNED.

### F19. Visitor live queue and vehicle approvals
- **Home:** `visitors` (new feature `visitors.live_queue`) and `parking` (new feature `parking.vehicle_approvals`). Included.
- **Personas and permissions:**
  - guard: `visitors.manage`;
  - occupants approve or deny;
  - manager: `vehicles.approve`.
- **Screens:**
  - VIS-007 live gate queue (a tab of VIS-004);
  - new PORTAL-040, "Visitor at the gate" overlay;
  - PARK-005 approvals tab (PARK-007 drawer);
  - PORTAL-026 lets residents submit a vehicle for approval.
- **Connections:**
  - a gate request → unit → current occupants → the decision → a visitor event (check-in);
  - a vehicle → unit and person → approval → parking allocation.
- **ERD:**
  - new `visitor_gate_requests`;
  - new columns on `vehicles` for status and approval.
- **Mock contract:**
  - `POST /gate-requests`
  - `POST /portal/gate-requests/:id/{approve,deny}`
  - A simulated refresh every 15 s ("Updated 10:42 · refreshes every 15 s").
  - Vehicle states: pending → approved | rejected | retired.
- **Controls:**
  - Only current occupants are asked; an owner who does not live there is not.
  - Requests expire.
  - Visitor photos only with consent.
  - Live-looking screens say they are simulated, with no claim of a real security service.
- **Tests:**
  - occupant targeting;
  - expiry;
  - plate uniqueness among approved vehicles;
  - axe on the overlay.
- **Milestone:** D.2. **Status:** PLANNED.

### F20. Property transfer and clearance fees
- **Home:** `residents` (OWN-003/004, now also offered to societies) and `dues` (a one-time "transfer fee" category). Included.
- **Personas and permissions:**
  - manager: `transfer.review`;
  - treasurer: `transfer.approve`, `clearance.issue`.
- **Screens:**
  - OWN-003/004 re-gated: society transfers move to S.1, developer sales transfers stay in Gate E;
  - OWN-006 clearance certificate (a drawer).
- **Connections:**
  - transfer request → dues check (the unit's liable balance) → fee invoice through the shared engine (`source_type = transfer_fee`) → clearance certificate → new ownership period;
  - **history is never rewritten** (I-5).
- **ERD:** `transfer_fee_policies` (versioned, with a bylaw reference), `clearance_certificates` (numbered per legal entity).
- **Mock contract:**
  - `POST /transfers`
  - `POST /transfers/:id/{check-dues,invoice-fee,issue-clearance,approve}`
- **Controls:**
  - The fee is configured with a bylaw reference, not hardcoded.
  - A clearance certificate needs a zero liable balance, or an approved waiver.
  - Legal review covers fee lawfulness (D-42).
- **Tests:**
  - clearance refused with a balance;
  - the fee invoice is idempotent;
  - history is unchanged after the transfer.
- **Milestone:** S.1. **Status:** PLANNED.

### F21. Resident credit balances and possible future wallet
- **Home:** `receivables`. Included.
  - The existing unapplied credit (FIN-011, C.2: paying 6,000 against a 5,200 balance leaves 800 in credit) and **advance payments** (paying ahead through the same transfer-and-verify flow, applied when future bills post if the site's auto-apply policy allows).
- **Screens:**
  - FIN-011 renamed "Credit balances and advance payments";
  - PORTAL-004 gains a credit/paid-in-advance card.
  - **No wallet screens.**
- **ERD:** no new money tables. A site policy `credit_auto_apply` (A4 already anticipates it).
- **Controls:**
  - **Excluded:**
    - wallet top-up;
    - withdrawal;
    - transfer to another resident;
    - a "wallet balance" that implies stored value.

    Any of these could be e-money and needs financial and legal review (D-37).
  - Refunds of credit stay a Gate E approval flow.
- **Tests:**
  - credit shown equals payment minus allocations;
  - auto-apply only when the policy is on;
  - no wallet wording anywhere.
- **Milestone:** S.1. **Status:** PLANNED.

## 5. Cross-cutting privacy, security and safety controls

| Control | Applies to | How the prototype proves it |
|---|---|---|
| No resident sees another resident's debt, login status, contact details or identity behind an aggregate | F01, F03, F04, F13, F15 | No-leak vectors and E2E with two residents of one shared account (A-201/A-202) |
| Membership and visibility follow verified, effective-dated facts | F01, F05, F15, F19 | Membership vectors: move-in, move-out, term end, tenant vs owner |
| Consent before contact, per channel and purpose | F03, F06, F13, F14 | Consent refusal tests |
| Maker ≠ checker on money and data | F05, F07, F09, F10, F11, F18 | Principal checks in the mock server (CP1 pattern) |
| One ledger; the cashbook and statements are projections | F09, F10, F11 | Sum checks against source records |
| Simulated is labelled simulated | F01, F02, F03, F13, F19 | Visible demo labels; tests assert the text |
| Nothing is "Paid", "Sent" or "Dispatched" without evidence | F02, F09, F11, F21 | Wording tests (extends the 1.5R "never Paid" test) |
| Access is decided by the full intersection; menus are not security | all | Access vectors per new module; "not in your plan" pages (GLOBAL-012) |
| Moderation, report and block | F01, F04, F14, F15 | Report → hide flows |
| Audit of sensitive actions | F02, F05, F16, F17, F18 | Audit entries asserted in tests |

## 6. Architectural conflicts and risks

| # | Conflict or risk | Effect | Proposed handling |
|---|---|---|---|
| R-20 | The register baseline is moving (C.2 is uncommitted; 337 distinct vs the 335 committed) | The delta could drift | The delta is validated against both. It is rebased when C.2 is committed, before adoption (D-43) |
| R-21 | Gate D grows from 33 to about 50 distinct screens | One huge gate | Split into D.1–D.3 with a checkpoint after each (D-24) |
| R-22 | HR and payroll are register-scheduled for Gate E (developer) | Societies would wait for the whole ERP | Build the shared HR/payroll screens edition-aware in S.2; Gate E adds developer specifics only |
| R-23 | Issue #2 lists the finance extensions as P0, but its sequence places them after Gate D | Ordering ambiguity | Recommend S.1 right after D.1, because it extends the C.2 engine while it is fresh (D-23) |
| R-24 | A cashbook can become a second ledger | Mismatched totals | The cashbook is a projection; manual entries only without `payables`; one shared period lock |
| R-25 | Chat duplicates notices | Unofficial "announcements" | Official notices only via RES-005/NOT-003; chat shows link cards |
| R-26 | Community issues duplicate maintenance | Two ticket systems | One request entity with `kind` |
| R-27 | Real-time chat, SOS and live queues imply infrastructure | Readers may think it is live | Every live-looking state is labelled simulated. Infrastructure is Gate H |
| R-28 | SOS liability and the risk of false reassurance | Safety | Blocked behind a safety review; national numbers always shown; no "help is coming" |
| R-29 | Rentals implies holding client money; tax withholding on rent | Regulatory | Recorded-only payouts; management agreements; legal and tax review (D-33) |
| R-30 | A wallet could be e-money | Regulatory | Deferred; only credit and advances (D-37) |
| R-31 | Data export is a mass personal-data channel | Privacy | Scope by grants and permissions; maker-checker; expiry; audit |
| R-32 | Mode switching could leak privilege | Security | App-scoped sessions; cache clearing; tests from the CP2 tenant-switch suite |
| R-33 | Polls mistaken for binding votes | Governance | "Informal" label; formal ballots deferred (D-30) |
| R-34 | Marketplace abuse or fraud | Trust and safety | Off by default; pre-moderation; no in-app payments (D-31) |
| R-35 | Volume: 32 new screens plus 31 earlier ones before Gate E | Schedule | Bounded slices; reference experiences first in each slice; stop at every checkpoint |
| R-36 | A new chat centre button competes with "Pay" for the phone bottom bar | UX | Chat takes the centre only when licensed and chosen by the tenant (D-25) |

## 7. What is explicitly not authorised by this document

- Implementing any new module, screen or contract.
- Starting Gate D.
- Changing the live register.
- Marking anything built.
- Laravel code, migrations, live messaging, SMS, WhatsApp or push, payments, banking, payouts or emergency dispatch.
- Merging to `main`.

The owner and GPT review this proposal first.
