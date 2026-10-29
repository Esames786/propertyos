# V3.2 proposal: product scope expansion (Nizam delta)

**Status:** PROPOSAL for owner and reviewer approval. Nothing here is built, and nothing here authorises implementation.

**What it answers.** GitHub Issue #2 and the owner's V3.2 brief: which community-management capabilities PropertyOS adds, where each one lives in the V3.1 modular architecture, and in which frontend-only milestone it would be built.

**The package**

| File | What it holds |
|---|---|
| `PRODUCT_SCOPE_EXPANSION.md` (this file) | Gap analysis and the 21 feature specifications |
| [`MODULE_AND_LICENSING_MATRIX.md`](MODULE_AND_LICENSING_MATRIX.md) | Catalogue changes, editions, dependencies, permissions |
| [`ERD_PROPOSED_CHANGES.md`](ERD_PROPOSED_CHANGES.md) | Logical entities and invariants. Not migrations |
| [`SCREEN_REGISTER_DELTA.csv`](SCREEN_REGISTER_DELTA.csv) | Row-level changes against the committed C.2 register `e2ccd89` (the live register is untouched) |
| [`SCREEN_COUNT_RECONCILIATION.md`](SCREEN_COUNT_RECONCILIATION.md) | Revision 4: baseline integrity, delta operations, counts by gate and milestone, validation of the whole register, findings |
| [`FRONTEND_ONLY_EXECUTION_PLAN.md`](FRONTEND_ONLY_EXECUTION_PLAN.md) | Milestones, acceptance tests, evidence, stop points |
| [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md) | Decisions D-21 to D-49 with recommendations. Five are ready to ratify; none is approved yet |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed in revisions 2 to 4, and what is still open |
| [`../../design/reference/nizam/NIZAM_FEATURES_AND_GAPS.md`](../../design/reference/nizam/NIZAM_FEATURES_AND_GAPS.md) | What the Nizam benchmark showed (text only) |

**Revision 2** (GPT review, Issue #3) corrects the finance source of truth, the screen counting, the entity model and several privacy rules.

**Revision 3** (GPT re-review of `3f018d0`) makes official notices a complete D.2 journey that never depends on the optional `community_hub`. It also states the limits of offline chat revocation, extends the privacy threshold to differencing across filters and time, and marks the SOS pages as parked potential scope. See [`CHANGELOG.md`](CHANGELOG.md).

**Revision 4** (final documentation reconciliation, after GPT's re-review of `eba5cec` and the C.2 closure `e2ccd89`):
- The delta is rebased on the committed C.2 register.
- PORTAL-042's guard is corrected to `resident_portal` + `portal.use`, and the same rule (rule R) is applied to every resident-facing row.
- Rows that overlap what C.2 built are reconciled.
- Settlement evidence follows the C.2 closure ruling.
- See [`SCREEN_COUNT_RECONCILIATION.md`](SCREEN_COUNT_RECONCILIATION.md) and [`CHANGELOG.md`](CHANGELOG.md).

**Baseline**
- **Register.** The committed Gate C.2 register at the closure commit `e2ccd89`: **396 rows, 337 distinct screens**. Gate C.2 is closed and approved (Issue #4, 2026-10-29).
- **Counts.** They are verified, but they remain register counts of proposed scope, not built screens. Delta rows are adopted only when their milestone is authorised (D-43). The live register is not changed by this package.
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
   - **An approved instruction is not money moving.** Settled cash changes only through a confirmed payment, a posted cash voucher or a settlement confirmation.
   - **No settlement without evidence** (revision 4, the C.2 closure ruling):
     - a bank leg needs a matched statement line (in the prototype, a line from a sample statement imported for the verified account, as in C.2);
     - a partial match needs a second person's exception;
     - a cash leg needs a witnessed deposit slip.
   - An uncleared cheque settles nothing.
   - There is one set of source events; the cashbook is a view, not a second ledger.
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
| F02 | SOS and emergency management | P1, safety-critical | `safety` | **NEW module, restricted** | Add-on | 3 (parked) | S.4, PARKED until a separate safety design |
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
| F15 | Community hub, polls and marketplace (official notices stay outside the hub) | P1 | `community_hub` + `resident_portal` | **NEW module** | Add-on; marketplace off by default. Notices need no add-on | 3 | D.3 (notices D.2) |
| F16 | Resident/management mode switching | P0 | core | Existing | Included | 0 (state of GLOBAL-008) | D.1 |
| F17 | Device and session management | P0 | core | Existing | Included | 0 | D.1 |
| F18 | Backup, data export, privacy requests | P0 | core | Existing, new feature | Included | 1 | D.1 |
| F19 | Visitor live queue and vehicle approvals | P1 | `visitors`, `parking` | Existing, new features | Included | 0 (states) | D.2 |
| F20 | Property transfer and clearance fees | P2 | `residents` + `dues` | Existing | Included | 0 | S.1 |
| F21 | Resident credit balances; future wallet | P2 | `receivables` | Existing | Included; **wallet deferred** | 0 | S.1 |
| | **Total** | | | 4 new modules | | **28 new (3 parked)** | |

**Effect on the register (revision 4, verified on the committed C.2 register `e2ccd89`)**
- **Distinct screens:** 337 → **365**, which is 337 plus 28 new screens.
  - **Revision 3:** Community notices (PORTAL-023) stays its own canonical page and is not folded into Community home.
  - **SOS:** 3 of the 28 (the SOS pages) are **parked potential scope, not authorised work**. They stay unavailable until the safety design is approved. Without them, active scope is **362**.
- **Rows:** 396 → **455**. 31 tab, drawer, overlay and detail-state rows do not count as screens.
- **Delta operations:** 112.
  - 28 ADD, 31 ADD-STATE, 53 MODIFY, 0 SUPERSEDE.
  - Revision 3 replayed on `e2ccd89` gives the expected 108. Revision 4 adds 4 MODIFY rows that reconcile C.2 overlaps (BILL-012, BANK-004, BILL-016, BILL-017) and change no count.
- **Counting rule (revision 2).** Tabs, drawers and overlays without their own page route are **states of a parent screen** (A5 §2). Four overlays that revision 1 counted as screens are now states:
  - SOS-004 → SOS-001;
  - PORTAL-033 → PORTAL-001;
  - GLOBAL-015 → GLOBAL-008;
  - PORTAL-040 → PORTAL-015.

  The existing register still counts some older global overlays as screens (GLOBAL-013, the GUIDE tours). That inconsistency is flagged for the owner (D-45) and left unchanged.
- **Changed rows:** 53 existing rows change. Most of them move earlier (re-gated), or are opened to the community edition. Eight C.2 screens record what S.1 adds to them. None is superseded.
- **Already planned, now scheduled earlier:** 31 screens move from Gates E and G into the new milestones, because societies need them sooner:
  - HR ×9, payroll ×7, approvals ×5, banking ×3, transfers ×2;
  - the finance overview, vehicle registry, quick broadcast, documents and the user workspace (×1 each).

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
  - **Official notices (revision 3).** The office publishes a notice, residents get a notification, and the notice opens on its own page. The same verified links decide who receives each notice. This works from D.2 with the included modules only, whether or not the society later licenses the community hub or chat.
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

  Residents enter through `resident_portal` + `portal.use`, then need `community_chat` for their site (rule R, revision 4).
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
  - `chat_groups`, `chat_memberships` (`visible_from` = join date, `ended_at`, read position);
  - smart groups use the shared core `audience_rules` (revision 3; was `chat_audience_rules`), which notices and polls also use, so none of them depends on another add-on's licence;
  - `chat_messages`;
  - the shared `content_reports` and `user_blocks`.

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
  - **Revocation (revision 3 wording).** When a membership ends (move-out, role change or term end):
    - **At once, on the server:**
      - reads, posts and sync for the group are refused;
      - deliveries queued for that member are dropped;
      - pending notifications are withdrawn;
      - links and attachments stop resolving for them.
    - **When the device next connects:**
      - messages the person wrote while offline are rejected, never delivered;
      - the app removes the group's downloaded messages and attachments from the device.
    - **What cannot be promised:** content already downloaded to a device that is offline or unreachable cannot be erased at the moment membership ends. The product never claims immediate remote deletion. The resident is told that the conversation "will be removed from this device the next time it connects". Content a person has already read, copied or captured cannot be recalled.
    - **Possible mitigation for D-25:** the app hides cached group content when its last membership check is older than a tenant-set limit. This hides the content but does not erase it, and no default limit is proposed.
  - Direct messages between residents are **off by default** (D-25).
  - Moderation only through the report workflow; moderators see the reported message and its immediate context, never private conversations.
  - Report and block are always available.
  - **Retention** is a legally configurable tenant setting. No statutory period is presumed. It has deletion exceptions (legal hold, open reports) and user notice. Chat stays unavailable until a tenant sets it.
  - Phone numbers are never shown in chat.
  - A demo label marks fixture conversations.
- **Tests:**
  - **Membership vectors:** a tenant-payer is in the block group but not the owners' committee group; after move-out the person loses access; a new joiner cannot read earlier messages.
  - **Revocation E2E:**
    - after move-out, the server refuses the group at once;
    - a device that was offline keeps its cache only until it reconnects, and then the cache is removed;
    - a message written offline is rejected on reconnect;
    - the UI wording never promises immediate deletion.
  - **Leaks:** a cross-tenant or cross-site leak test.
  - **Moderation:** the reported → hidden flow.
  - **Accessibility and layout:** axe EN/UR; 320 px reflow.
- **Milestone:** D.3. **Status:** PLANNED.

### F02. SOS and emergency management (safety-critical)
- **Home:** NEW add-on module `safety` (site scope).
  - Requires `residents`.
  - Integrates with `hr` (duty roster), `visitors` and `communications`.
- **Gating (revision 2):**
  - **PARKED potential scope, not authorised work.** SOS stays unavailable until safety approval. No UI of any kind, including global alert buttons and overlays, and no contracts or fixtures, until a **separate, owner-approved safety design** exists (D-26). The three SOS pages are counted only as parked scope and in no D or S milestone.
  - The `safety` catalogue entry stays *restricted*.
  - Everything below is a placeholder to frame that design, not a specification.
  - That design must cover:
    - recipients and escalation;
    - acknowledgement and timeouts;
    - false alarms;
    - offline and failure behaviour;
    - accessibility for people under stress;
    - privacy;
    - liability wording.
- **Personas and permissions:**
  - resident: `resident_portal` + `portal.use`, then `safety` for their site (rule R);
  - guard: `sos.respond`;
  - manager: `sos.respond`, `sos.configure`;
  - committee or safety officer: `sos.review`.
- **Screens:**
  - three parked pages: SOS-001 safety console, SOS-002 Incident 360, SOS-003 safety settings;
  - states of those pages: SOS-005 history and drills, SOS-004 staff alert overlay;
  - a state of the resident home: PORTAL-033 resident SOS.
- **Connections:**
  - an incident → its unit and site;
  - responders → the duty roster (F06);
  - emergency contacts → the person (with consent);
  - the closure note → the incident's audit trail.
- **ERD (parked):**
  - `safety_settings` (versioned), `sos_incidents`, `sos_incident_events` (append-only);
  - responders are a view;
  - emergency contacts reuse `party_relationships`.

  See ERD §2.2.
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
    - always: "This is not an emergency service", followed by the local emergency numbers.

    Those numbers are **verified and region-specific at implementation time**. None are assumed in this document.
  - The control is reachable within two actions from every resident screen.
  - It works at 200 % text and with a screen reader, using an assertive announcement.
- **Onboarding:** a mandatory explanation on first use, plus a staff drill mode (SOS-005).
- **Privacy and safety:**
  - Unit-level location only. No GPS tracking.
  - Incident timelines cannot be edited.
  - Access is limited to responders and reviewers.
  - A false alarm is never penalised automatically.
  - The prototype never shows "help is on the way".
  - Failure states tell the person to call the verified local emergency numbers.
  - Nothing implies live dispatch.
- **Tests:** written after the safety review. At minimum:
  - activation needs two steps;
  - the escalation timer;
  - the failure state shows the verified local emergency numbers;
  - axe on the overlays;
  - no-leak tests.
- **Milestone:** S.4, only after the separate safety design is approved and the owner authorises S.4. **Status:** PLANNED, PARKED.

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
  - `portal_invitations` (new);
  - portal activity is a date-level view over the V2.1 identity sessions (central, extended for F17).
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
  - residents raise and affirm (`resident_portal` + `portal.use`, then `maintenance.community_issues` for their site: rule R);
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
  - a new table `request_affirmations`;
  - comments use the shared `record_comments` (public or staff-internal).
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
  - **Small-audience threshold (revision 2).** A count is shown only when both the count and the eligible audience meet configured minimums (D-47). Otherwise the issue just shows "Reported". This stops one floor's two flats from being re-identified.
  - **Differencing (revision 3).** A single-cell threshold is not enough. Someone could compare two counts that each pass, and the difference could still point to one household. So resident-visible counts also follow these rules (D-47):
    - **Fixed groupings only.** Residents see the site, or a block that qualifies. They get no free filters or date ranges.
    - **Complement check.** A grouping is hidden if "total minus grouping", or any other difference between two shown counts, falls below the threshold.
    - **Scheduled refresh.** Counts refresh on a schedule, not on each affirmation, so watching one count change cannot reveal when a particular neighbour responded. A resident sees their own affirmation at once.
    - **Same rules everywhere.** The same count shown in two places (the issues board, Community home) uses the same grouping and refresh.
  - Comments are moderated, with staff-internal notes kept separate.
  - A private flat repair never becomes public without its reporter's consent.
- **Tests:**
  - affirmation counting and withdrawal;
  - merge keeps counts;
  - identity hidden from residents;
  - **differencing vectors:** site minus block, two adjacent groupings, consecutive snapshots around one affirmation, and affirm–withdraw toggling;
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
  - new: `committees`, `committee_offices`, `committee_terms` (effective-dated), `committee_resolutions` (with meeting date and minutes document);
  - formalised from V2.1's central approvals and delegation domain:
    - `approval_policies` and `approval_policy_rules` (versioned);
    - `approval_requests`, `approval_decisions`, `approval_delegations`.
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
  - Delegation is time-bound and audited. A delegate never approves their own request.
  - **Draft policies (revision 2).** A draft never governs its own approval. It is approved under the version in force, by someone other than its creator. It cannot make its creator an approver of the creator's own requests.
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
  - new: `shift_templates`, `shift_assignments`;
  - formalised from V2.1 HR: `attendance_records`, `leave_requests`;
  - extended: V2.1 employees gain resident-visibility and consent columns (no separate profile table).
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
  - a posted run is an obligation; a disbursement is an instruction; only a settlement confirmation on a matched statement line affects settled cash (F10; D-48).
- **ERD:**
  - **No new tables.**
  - V2.1 advances gain kind = loan and an instalment plan.
  - V2.1 salary components gain bonus and loan-recovery types.
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
- **Issuing entity (revision 2).** The issuing legal entity is set by the management agreement, never assumed (D-33). Both models are prototyped as labelled fictional alternatives:
  - **Agent model.** The manager's entity issues rent invoices as agent. Rent goes into a **client-money account**, with an owner sub-ledger on every movement.
  - **Principal model.** The owner is set up as a client legal entity with its own numbering and verified account. That entity issues the invoices, and the tenant pays the owner directly.
- **Never commingled.** No owner money enters the manager's operating account, except the agreed fee through an approved instruction plus settlement. No owner money ever reaches the SaaS company.
- **ERD:**
  - new: `leases`, `lease_parties`, `rent_schedules` (snapshots), `security_deposits`, `management_agreements` (F09);
  - extended:
    - `billing_accounts.kind = lease`;
    - `customer_invoices.source_type = lease_schedule`;
    - `unit_liabilities.basis`;
    - `legal_entities.kind = client_owner`;
    - `bank_accounts.purpose = client_money | deposit_holding`.
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
  - **Deposits** are liabilities to the tenant. They are held in a client-money or deposit-holding account of the right entity, never as income of the manager or the SaaS company. A refund is an approved instruction plus a settlement.
  - Rent tax withholding is configurable and adviser-confirmed (D-33).
- **Tests:**
  - rent vectors (proration, escalation);
  - idempotent posting;
  - the separation of rent and dues accounts;
  - landlord scope;
  - entity isolation in both the agent and principal models;
  - one owner's money never settles another owner's payable.
- **Milestone:** S.3. **Status:** PLANNED.

### F09. Owner payouts and management fees
- **Home:** `rentals`, with the features `rentals.owner_statements`, `rentals.owner_payouts` and `rentals.management_fees`.
- **Personas and permissions:**
  - accounts: `owner_statement.view`, `owner_payout.prepare`;
  - a second person: `owner_payout.approve`;
  - administrator: `rentals.configure`.
- **Screens:**
  - RNT-005 owner statements;
  - RNT-006 owner payout instructions and settlement;
  - RNT-007 rental settings (agreements and issuing model, fees, deposits).
- **Instruction ≠ settlement (revision 2):**
  - An approved payout is an **instruction**. It does not reduce cash or the owner's payable.
  - Only a **settlement confirmation** does that, on a matched statement line of the paying client-money account (C.2 matching; in the prototype a sample statement imported for the verified account). No control settles without that evidence (D-48, revision 4).
  - Unsettled instructions show as "Pending payout".
- **Connections:**
  - **Statement lines** derive from:
    - rent collected (payments on lease invoices);
    - the management fee (per agreement);
    - approved owner expenses (payables);
    - **settled** payouts.
  - **A settled payout** appears in the cashbook (F10); an instruction never does.
- **ERD:**
  - new: `management_agreements` (model, written authority, client-money account or client entity), `owner_payouts` (instruction states);
  - shared: `settlement_confirmations`;
  - the owner statement is a **view**, stored as a document when issued.
- **Mock contract:**
  - `GET /rentals/owner-statements`
  - `POST /rentals/owner-statements/:id/issue`
  - `POST /rentals/payouts`
  - `POST /rentals/payouts/:id/{approve,reject}`
  - `POST /settlements` (subject = payout; evidence = a statement line)
  - Payout states: draft → awaiting_approval → approved_instruction → settled | failed; or rejected.
  - **"Approved instruction" is never labelled "sent" or "paid out".**
- **Compliance:**
  - Collecting rent on an owner's behalf requires a management agreement with written authority (extends D-15).
  - Client money is kept in client accounts and tracked per owner.
  - Legal review covers client-money and trust-account obligations, and the issuing model, before Gate H (D-33).
- **Tests:**
  - statement arithmetic vectors;
  - instruction ≤ payable;
  - an instruction without settlement changes neither cash nor the payable;
  - a settled payout changes both exactly once;
  - maker ≠ checker;
  - a fee needs an agreement.
- **Milestone:** S.3. **Status:** PLANNED.

### F10. Cashbook, transfers and month closing
- **Home:** `banking`, new feature `banking.cashbook`.
  - Cash and petty cash become **account kinds**.
  - Month close uses **one period lock per legal entity**, shared with `accounting` (ACC-009) when that module is granted.
- **Personas and permissions:**
  - accounts: `cashbook.view`, `cash_voucher.prepare`, `funds_transfer.create`;
  - treasurer: `cash_voucher.approve`, `funds_transfer.approve`, `period.close`;
  - settlement evidence is matched with C.2's `bank.reconcile` (the accounts officer), never by the instruction's preparer;
  - a partial match needs a second person: `payment_exception.approve` for incoming money (C.2), and the new `settlement_exception.approve` for outgoing legs (revision 4);
  - reopening a month goes through an approval policy (F05).
- **Screens:**
  - new: BANK-007 cashbook, with states BANK-008 close-month review and BANK-009 cash voucher;
  - reused and scheduled earlier:
    - BANK-001 (cash accounts tab);
    - BANK-002 (cashbook tab);
    - BANK-006 (deposits and transfers: instruction, in transit, settled);
    - FIN-001 (society finance overview).
- **Source of truth (revision 2).** There is one set of source events and no second ledger. **Settled cash changes only through:**
  - **confirmed payments** (C.2 verification, or confirmed office cash);
  - **posted cash vouchers**;
  - **settlement confirmations** for transfers, deposits, owner payouts, payroll and refunds.

  The **cashbook is a derived view** over these. It has no stored rows of its own.
- **Cash vouchers** are the only way to record cash that no other module owns:
  - other income;
  - bank charges;
  - small expenses, **only when `payables` is not granted**.

  Each voucher is prepared, approved by someone else (approval policy), posted (then immutable) and corrected only by a reversal voucher.
- **Instructions vs settlement.** A transfer or cash deposit is first an approved **instruction**. Each leg is settled only by evidence:
  - a matched statement line, exactly as C.2 matches proofs:
    - the line comes from a statement imported for the verified account;
    - a full match on the account in force settles directly;
    - a partial match settles only through a second person's exception;
    - one line settles one subject once;
  - a witnessed deposit slip for the cash leaving custody.

  There is no free "simulated confirmation" (D-48, revision 4).

  Money between legs shows as "cash in transit".
- **Behaviour by add-on:**

  | Add-ons granted | What changes |
  |---|---|
  | `banking` only | Vouchers cover expenses |
  | + `payables` | Expenses come from payables (settled by evidence); expense vouchers are disabled |
  | + `accounting` | The same source events feed journals; the period lock is the same (`fiscal_periods`, moved to the finance core) |

- **Idempotency.** Each source event counts once, keyed by (source type, source id, posting version). Each settlement leg is confirmed once. One bank transaction confirms at most one settlement leg.
- **Closing checks:**
  - unreconciled lines (BANK-004);
  - proofs waiting (FIN-008), including C.2's `awaiting_bank_evidence` and `exception_pending`;
  - unposted runs (BILL-008);
  - cash in transit;
  - unsettled instructions;
  - a witnessed cash count.
- **ERD:**
  - new: `cash_vouchers`, `settlement_confirmations`, `cash_counts`;
  - formalised: `funds_transfers`;
  - extended: `bank_accounts` (kind, purpose), `fiscal_periods` (finance core), V2.1 expense/income categories;
  - views: the cashbook, cash in transit, the close checklist.
- **Mock contract:**
  - `GET /cashbook?account=&period=` (derived)
  - `POST /cash-vouchers`
  - `POST /cash-vouchers/:id/{submit,approve,post,reverse}`
  - `POST /funds-transfers`
  - `POST /funds-transfers/:id/{approve,reject}`
  - `POST /settlements`
  - `POST /periods/:id/{close,reopen-request}`
  - Period states: open → closing → closed → reopened (approved).
- **Resident and mobile:** none directly. The optional "Society accounts" tab shows committee-published aggregate summaries (F15).
- **Controls:**
  - Opening + settled in − settled out = closing per account.
  - Closed months refuse new postings; corrections are reversal vouchers in an open month.
  - Transfers stay within one legal entity (I-19).
  - Cash counts are witnessed.
  - Nothing settles without evidence. Demo statements are labelled as samples with fictional data, as in C.2.
- **Tests:**
  - cashbook = the sum of its sources (no double counting);
  - an instruction without settlement changes nothing;
  - a voucher needs a different approver, and reverses cleanly;
  - expense vouchers are disabled when `payables` is granted;
  - the period lock;
  - a reopen needs approval;
  - a cross-entity transfer is refused;
  - settlement idempotency.
- **Milestone:** S.1. **Status:** PLANNED.

### F11. Bulk payment collection (controlled)
- **Home:** `receivables`, new feature `receivables.bulk_office_collection`.
  - Requires `receivables.office_collections`, and the site's payment-method rules must allow cash or cheque (BILL-012, built in C.2).
- **Personas and permissions:**
  - collector (accounts officer): `payment.receive` with the feature `receivables.office_collections`, the committed C.2 permission (revision 4; the register text said `payment.receive.office`);
  - a second person (treasurer): `payment.batch.confirm`.
- **Screens:** new FIN-013 bulk office collection (FIN-014 batch review); FIN-007 stays for single payments.
  - **C.2 today (revision 4):** FIN-007 records single office cash within the site's maximum, with a receipt at once (PARTIAL).
  - S.1 adds cheques to FIN-007 and to the batch, and decides through D-46 whether single cash also needs a second-person count.
  - Each batch cash line stays within the site's maximum (a per-site setting; 50,000 is fixture data only).
- **Method-specific states (revision 2):**
  - **Cash lines.**
    - The counted total must equal the sum of the cash lines.
    - A second person confirms.
    - Confirmed cash is recognised **per site policy** (D-46: on confirmation, or only when the deposit settles). Only then are the payment, allocation (this payer's lines only, C.2 rules) and **final receipt** created.
    - A wrong line is corrected only by an approved reversal.
  - **Cheque lines.**
    - Confirmation records **"cheque received"** and an acknowledgement ("not a receipt of payment").
    - The cheque stays **pending**. It settles no invoice and yields **no final receipt** until it is **cleared**, by a matched statement line (C.2 matching: full match, or a partial match only through a second person's exception).
    - **Returned:** nothing settles, the payer is notified, and the history is kept. A bank charge applies only under a configured, lawful policy, off by default.
    - **Reversal after clearing:** the payment, allocations and receipt are reversed (the receipt is marked reversed, never deleted), and the invoice lines reopen.
- **Connections:**
  - batch lines → billing account → that payer's invoice lines;
  - cheques → `cheque_instruments` → deposit (F10) → clearance;
  - a cash deposit instruction (F10) links confirmed cash to the bank.
- **ERD:** new `office_collection_batches`, `office_collection_lines`, `cheque_instruments`. Clearance uses `settlement_confirmations`.
- **Mock contract:**
  - `POST /office-collections`
  - `POST /office-collections/:id/{submit,confirm,return}`
  - `POST /cheques/:id/{deposit,clear,return}`
  - `POST /payments/:id/reverse`
  - Batch states: draft → submitted → confirmed | returned.
  - Cheque states: received → deposited → cleared | returned; or cancelled.
- **A4 §5.3 alignment.** A4 lets office cheques produce a payment immediately and allocate "when cleared (configurable)". Revision 2 makes it strict: **no payment until cleared**.
  - **Re-checked on `e2ccd89` (revision 4):** C.2 builds no office cheques (BILL-012 shows them as later), so nothing conflicts.
  - C.2's immediate receipt for single office cash is the one open point. It goes to D-46.
- **Controls:**
  - Nothing shows as Paid before confirmation (cash) or clearance (cheque).
  - Each line settles only its payer's lines.
  - Confirmer ≠ collector.
- **Tests:**
  - total mismatch is refused;
  - confirmer ≠ collector;
  - per-payer allocation;
  - an uncleared cheque settles nothing and has no receipt;
  - a returned cheque keeps lines open;
  - a reversal after clearing reopens lines and marks the receipt reversed;
  - cash disabled → refused (C.2 behaviour kept).
- **Milestone:** S.1. **Status:** PLANNED.

### F12. Bulk maintenance bill printing
- **Home:** `dues` and `receivables`. Included.
- **Screens:**
  - BILL-018, the print pack for a posted run (a drawer of BILL-008);
  - COL-008, printing dues notices (a drawer of COL-005).
  - No new screens.
- **Connections:** a print pack → the run's posted invoices; dues notices → each liable payer's outstanding lines.
- **ERD:** the shared `generated_file_jobs` (kind invoice_pack or dues_notices; source; page count; file document). This one table also covers data exports (F18).
- **Mock contract:** `POST /generated-files` (generated in the browser), with states requested → ready → expired.
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
- **ERD:**
  - new `reminder_policies` (versioned);
  - extended: `reminder_events` (policy, channel, consent result, skip reason), plus consent per channel and purpose on the existing `party_contacts` and `notification_preferences`. No separate consent table.
- **Mock contract:**
  - `GET/POST /reminders/policies`
  - `POST /reminders/preview`
  - `GET /reminders/history`
  - Delivery states: queued → would-send (demo) | skipped (reason).
- **Controls:**
  - Reminders go only to the liable payer.
  - They are skipped if paid, or while a proof is in any pending state. That includes C.2's `awaiting_bank_evidence` and `exception_pending` (revision 4). A proof that needs information gets the information request, not a dues reminder.
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
- **ERD:**
  - providers are `parties` with the role service_provider;
  - new: `service_categories`, `directory_listings` (vetting, consent, listing dates), `listing_recommendations` (counts);
  - reports use the shared `content_reports`.
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

  The resident **Community home** (PORTAL-036) belongs to `resident_portal` and shows only licensed tabs.
- **Official notices are not part of the hub (revision 3).** Official notices remain one-way, auditable and available **without** `community_hub` or `community_chat`. The complete journey is delivered in **D.2**:

  | Step | Screen | Licence and permission |
  |---|---|---|
  | 1. The office composes, previews the audience, publishes or schedules, and may ask for acknowledgement | RES-005 notices and announcements (or NOT-003 quick broadcast with "also post as notice") | `residents` + `communications` (both included). Opening needs `residents.view` (unchanged); publishing needs `notices.publish` (`communications`) |
  | 2. Each resident in the audience gets a notification. SMS/WhatsApp copies are simulated and need consent | PORTAL-042 notifications panel (a state of the resident home); simulated message carries the same link | `resident_portal` + `portal.use`, with the recipient's verified link, site and audience re-checked on read and open (revision 4; the notification service itself stays `core`); `communications.sms` / `whatsapp` only for those channels |
  | 3. The resident opens the notice, and acknowledges it if asked | PORTAL-043 notice detail, `/customer/portal/community-notices/:id` | `resident_portal` + `portal.use` |
  | 4. The resident can find every current notice later | PORTAL-023 Community notices, `/customer/portal/community-notices` (canonical; route unchanged) | `resident_portal` + `portal.use` |
  | 5. The office sees delivered, read and acknowledged counts, and which units have not acknowledged | RES-005 (staff only) | `residents.view` |

  - **Who sees a notice.** The audience is resolved from verified links (owner, occupant or liable payer; site, block, floor or unit) and checked again whenever a resident opens it. A moved-out resident gets "not available to you".
  - **Changes.** Edits create a new version. Withdrawing leaves a dated tombstone. Nothing is deleted.
  - **D.3 Community home.** It may show a "Latest notices" summary that opens these same routes. It never owns, copies or relocates notices.
  - **Without the hub.** Removing `community_hub` hides only the hub tabs. The **Notices** item in the resident navigation declares `requires: { modules: ['resident_portal'], permission: 'portal.use' }`.
  - **Permissions.** No hub permission (`polls.manage`, `directory.manage`, `marketplace.moderate`) ever applies to notices.
  - **Owner decision.** The alternative design, a minimal Community shell in D.2, is recorded in D-49.
- **Personas and permissions:**
  - manager: `polls.manage`, `directory.manage` (revision 4: the undefined `hub.manage` is removed);
  - moderator: `marketplace.moderate`;
  - residents read, vote and post listings.
- **Screens:**
  - new: CMTY-002 polls and surveys (CMTY-004 detail), CMTY-003 marketplace moderation, PORTAL-036 Community home (PORTAL-038 listing, PORTAL-039 vote);
  - linked, not folded (revision 3): PORTAL-023 Community notices stays canonical in D.2; Community home shows a summary that links to it;
  - reused: DOC-001 (publish to residents).
- **Connections:**
  - **Poll audiences** use the shared core `audience_rules`, the same rules as smart groups (F01) and notices. So polls do not need `community_chat`.
  - **Resources** are documents marked "published to residents".
  - **Society accounts** shows `published_financial_summaries` that the committee approves (aggregate only).
- **ERD:**
  - new: `polls`, `poll_options`, `poll_responses` (anonymous mode separates voter tokens), `marketplace_listings`;
  - reports use the shared `content_reports`;
  - published financial summaries and resources are `documents` (aggregate snapshot only).
  - Poll results below the privacy threshold (D-47) show "Not enough responses to show".
  - **Revision 3:** results are published only after the poll closes, so there is no running tally to compare over time. They are shown only for groupings that pass D-47, including the difference between any two groupings shown.
  - **Notices** reuse A2's `announcements` (EXTENDED) and `notifications` (EXTENDED), with no new table (ERD §2.13).
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
  - results visibility timing (after close only);
  - differencing vectors across groupings;
  - listing moderation;
  - hidden tabs when unlicensed;
  - **notices still reachable with `community_hub` removed** (PORTAL-023/043 and the nav item);
  - no debt or contact leaks.
- **Milestone:** D.3 for the hub; marketplace is optional (D-31). Official notices: **D.2**. **Status:** PLANNED.

### F16. Resident/management mode switching
- **Home:** core identity. One global sign-in per person (D-17), now with both a staff membership and a verified resident link. Not a licence.
- **Screens:**
  - GLOBAL-015, the app switcher: a **state** of GLOBAL-008 (account menu) in the back office, because the header overlay has no route of its own;
  - in the resident app, the same switch sits in Profile (PORTAL-024).
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
- **ERD:** the V2.1 identity **sessions** (central), extended with device label, platform, approximate last seen and revocation. No new table.
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
  - **No scope expansion (revision 2).** The export is limited to the tenant's granted modules ∩ the **requester's own** effective permissions and data scopes.
    - This is re-checked at generation and again at download.
    - Approval can only **narrow** the scope, never widen it, even when the approver has wider rights.
  - A purpose is required. Contact data is included only within its consent purpose.
  - Each export is audited (ADM-021).
  - A deletion request is checked against retention rules: financial records are kept and anonymised where the law allows.
- **ERD:** the shared `generated_file_jobs` (kind data_export, with an approval request) and the new `privacy_requests`.
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
  - scope limited by grants and the requester's own access;
  - an approver with wider rights cannot widen the export;
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
  - PORTAL-040, the "Visitor at the gate" prompt: a **state** of Requests (PORTAL-015), like the existing visitor tab PORTAL-019;
  - PARK-005 approvals tab (PARK-007 drawer);
  - PORTAL-026 lets residents submit a vehicle for approval.
- **Connections:**
  - a gate request → unit → current occupants → the decision → a visitor event (check-in);
  - a vehicle → unit and person → approval → parking allocation.
- **ERD:**
  - no new tables;
  - `visitor_passes` gain origin = gate_request and the states waiting, approved, denied, expired;
  - `vehicles` gain status and approval columns.
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
  - **the payer change goes through C.2's approval queue** (BILL-017, revision 4): an approved transfer raises one ordinary payer change, effective from the transfer date, never a second liability path;
  - certificates take the issuing legal entity's numbering pattern (BILL-016);
  - **history is never rewritten** (I-5).
- **ERD:**
  - The transfer fee is a charge category with versioned rates (existing `charge_categories` / `charge_rate_versions`, plus a bylaw reference).
  - New: `clearance_certificates`, numbered with the issuing legal entity's BILL-016 pattern.
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
  - The existing unapplied credit (FIN-011, C.2: paying 6,000 against a 5,200 balance leaves 800 in credit).
  - **Advance payments:** paying ahead through the same transfer-and-verify flow, applied when future bills post if the site's auto-apply policy allows.
  - Since revision 4, an advance payment is verified under the C.2 settlement rules (a statement line; a full match, or an approved exception).
- **Screens:**
  - FIN-011 renamed "Credit balances and advance payments";
  - PORTAL-004 adds "paid in advance" to the credit line that C.2 already shows on the home total, the receipt and the history (revision 4: credit display is not new).
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
| One set of source events; the cashbook and owner statements are views, not ledgers | F09, F10, F11 | Sum checks against source records |
| **Instruction ≠ settlement:** settled cash changes only through confirmed payments, posted vouchers or settlement confirmations | F07, F09, F10, F11, F21 | Instruction-without-settlement tests; settlement idempotency |
| An uncleared cheque settles nothing; returned and reversed cheques keep history | F11 | Cheque vectors |
| Small counts never re-identify people, either alone or by comparing filters and time snapshots (privacy threshold with differencing rules) | F04, F15 | Small-floor vectors; differencing vectors (site − block, adjacent groupings, consecutive snapshots, affirm–withdraw toggling) |
| Official notices work with the included modules only; optional add-ons never gate them | Notices (RES-005, NOT-003, PORTAL-023/042/043) | The notice journey E2E with a grant set without `community_hub` and `community_chat`; deep links unchanged |
| Revocation is immediate on the server; a device's downloaded copy goes only when it next connects | F01 | Revocation E2E with an offline device; wording tests (no promise of immediate remote deletion) |
| Approval never expands scope or allows self-approval | F05, F18 | Self-approval and export-scope vectors |
| Simulated is labelled simulated | F01, F02, F03, F13, F19 | Visible demo labels; tests assert the text |
| Nothing is "Paid", "Sent" or "Dispatched" without evidence | F02, F09, F11, F21 | Wording tests (extends the 1.5R "never Paid" test) |
| Access is decided by the full intersection; menus are not security | all | Access vectors per new module; "not in your plan" pages (GLOBAL-012) |
| **Rule R (revision 4):** resident screens are entered through `resident_portal` + `portal.use`, for the resident's verified link and site; a service module is then checked for the same site and flat | F01, F04, F08, F15, F17, F19, notices | Per resident screen: `resident_portal` revoked, service module revoked, another site, moved out |
| **No settlement without evidence** (revision 4, the C.2 closure ruling) | F07, F09, F10, F11, F21 | Settlement vectors reuse C.2's matching (wrong account, used line, partial match → exception) |
| Moderation, report and block | F01, F04, F14, F15 | Report → hide flows |
| Audit of sensitive actions | F02, F05, F16, F17, F18 | Audit entries asserted in tests |

## 6. Architectural conflicts and risks

| # | Conflict or risk | Effect | Proposed handling |
|---|---|---|---|
| R-20 | The delta could drift from the live register | Wrong counts at adoption | **Resolved in revision 4:** the delta is rebased on the committed, approved C.2 register `e2ccd89` (396/337 → 455/365) and verified by an independent program (`SCREEN_COUNT_RECONCILIATION.md`). Any later change to the live register means regenerating and re-verifying before adoption (D-43) |
| R-21 | Gate D grows from 33 to 49 distinct screens | One huge gate | Split into D.1–D.3, each individually authorised, with a checkpoint after each (D-24) |
| R-22 | HR and payroll are register-scheduled for Gate E (developer) | Societies would wait for the whole ERP | Build the shared HR/payroll screens edition-aware in S.2; Gate E adds developer specifics only |
| R-23 | Issue #2 lists the finance extensions as P0, but its sequence places them after Gate D | Ordering ambiguity | Recommend S.1 right after D.1, because it extends the C.2 engine while it is fresh (D-23) |
| R-24 | A cashbook can become a second ledger, or record money that never moved | Mismatched totals; false balances | The cashbook is a **derived view** over settled source events. Other cash goes only through approved, reversible vouchers. Instructions need settlement evidence. One shared period lock (revision 2) |
| R-25 | Chat duplicates notices | Unofficial "announcements" | Official notices only via RES-005/NOT-003; chat shows link cards |
| R-26 | Community issues duplicate maintenance | Two ticket systems | One request entity with `kind` |
| R-27 | Real-time chat, SOS and live queues imply infrastructure | Readers may think it is live | Every live-looking state is labelled simulated. Infrastructure is Gate H |
| R-28 | SOS liability and the risk of false reassurance | Safety | Parked: no UI, overlay or global control until a separate, owner-approved safety design. Numbers are verified and region-specific at implementation. No "help is coming" |
| R-29 | Rentals implies holding client money; tax withholding on rent | Regulatory | Recorded-only payouts; management agreements; legal and tax review (D-33) |
| R-30 | A wallet could be e-money | Regulatory | Deferred; only credit and advances (D-37) |
| R-31 | Data export is a mass personal-data channel | Privacy | Scope by grants and permissions; maker-checker; expiry; audit |
| R-32 | Mode switching could leak privilege | Security | App-scoped sessions; cache clearing; tests from the CP2 tenant-switch suite |
| R-33 | Polls mistaken for binding votes | Governance | "Informal" label; formal ballots deferred (D-30) |
| R-34 | Marketplace abuse or fraud | Trust and safety | Off by default; pre-moderation; no in-app payments (D-31) |
| R-35 | Volume: 28 new screens (3 parked) plus 31 earlier ones before Gate E | Schedule | Bounded slices, each individually authorised; reference experiences first; stop at every checkpoint |
| R-36 | A new chat centre button competes with "Pay" for the phone bottom bar | UX | Chat takes the centre only when licensed and chosen by the tenant (D-25) |
| R-37 | A4 §5.3 lets office cheques produce a payment immediately ("configurable") | Contradicts "uncleared cheque settles nothing" | Revision 2 makes it strict. **Re-checked on `e2ccd89`:** C.2 has no office cheques, so nothing conflicts; C.2's immediate receipt for single office cash is decided in S.1 (D-46). The A4 wording is aligned at register sync |
| R-38 | Counts in tiny audiences re-identify people, including by differencing two filters or two snapshots | Privacy | Configurable minimum count and audience size; fixed groupings; complement check; scheduled refresh; poll results after close only (D-47) |
| R-39 | The existing register counts some global overlays (GLOBAL-013, GUIDE tours) as screens; V3.2 does not | Inconsistent totals | Flagged for the owner (D-45); the live register is not changed here |
| R-40 | The logical model (38 new + 8 formalised tables) could be read as an approved schema | Premature backend design | Labelled conceptual; separate architecture review before Gate H; no migrations |
| R-41 | Official notices folded into Community home (revision 2), a D.3 page built around optional hub tabs | Residents would get notices only from D.3, and their availability could be read as tied to the hub licence | Revision 3: PORTAL-023 stays canonical in D.2; Community home only links to it; nav, routes and permissions name no hub key (D-49) |
| R-42 | A chat revocation promise that a disconnected device cannot keep | False assurance to residents and committees | Server-side revocation at once; device copy removed on next connection; wording never promises immediate remote deletion (D-25) |
| R-43 | *(Revision 4)* A resident screen guarded by a service module (`core`, `community_chat`, …) + `portal.use` skips the `resident_portal` entitlement, because the transport checks only the declared module | A resident could reach a screen after `resident_portal` is withdrawn | Rule R on all resident rows (PORTAL-031 to -042); negative tests per screen; HQ warns when a resident-facing add-on lacks `resident_portal` on the same site |
| R-44 | *(Revision 4)* A free "Simulated bank confirmation" control (revision 2's D-48) would settle without the bank evidence that the C.2 closure requires | A demo that contradicts the approved C.2 money rules | D-48 revised: evidence is a statement line from a sample statement imported for the verified account, matched by C.2's rules. A demo helper may only generate such a file |
| R-45 | *(Revision 4)* V3.2 rows restating what C.2 built (office cash, credit, statement import, payer changes, numbering) | Duplicate screens or rules | Reconciled: each row extends the C.2 screen (`SCREEN_COUNT_RECONCILIATION.md` F-3); four C.2 rows gain MODIFY rows; counts unchanged |

## 7. What is explicitly not authorised by this document

- Implementing any new module, screen or contract.
- Starting Gate D.
- Changing the live register.
- Marking anything built.
- Laravel code, migrations, live messaging, SMS, WhatsApp or push, payments, banking, payouts or emergency dispatch.
- Merging to `main`.

The owner and GPT review this proposal first.
