# V3.2 proposal: frontend-only execution plan

**Status:** PROPOSAL for approval. It does **not** authorise starting any milestone. Each milestone starts only on the owner's explicit go-ahead and stops for review when it ends.

**The owner's directive (Issue #2).** Complete, interactive, high-fidelity prototypes come before any production work:
- EN/UR with right-to-left layout;
- desktop, tablet and mobile;
- shared design tokens;
- role-aware navigation;
- typed mock state and contracts;
- E2E and accessibility evidence.

"Production work" means Laravel, real migrations, live payment/SMS/WhatsApp/chat integrations, and actual financial flows. A typed mock transport is allowed. It is not backend authorisation.

## 1. Sequence

| Step | Milestone | What it delivers | Distinct screens |
|---|---|---|---:|
| 0 | **Gate C.2** (in progress, primary session) | Resident payments, verification and reconciliation, receipts, first-run text size. Then commit, push and stop | (as authorised) |
| 1 | **V3.2 review** (this package) | Owner and GPT approve, or amend, scope, modules, register delta and sequence. The register delta is rebased on the committed C.2 register | 0 |
| 2 | **D.1 Identity, personalisation and onboarding** | The mandatory personalisation hub in all three apps; resident invitation and portal access; profile, household and devices; app switch; data export and privacy requests | 16 |
| 3 | **S.1 Society finance and governance essentials** | Print packs; reminders; controlled bulk cash; cashbook, deposits and transfers; month close; credit and advances; society transfers with fee and clearance; committee 360; versioned approval policies | 15 |
| 4 | **D.2 Resident operations** | Maintenance and community issues; visitors with the live gate queue; vehicles with approvals; notices and quick broadcast; online gateway mock | 26 |
| 5 | **D.3 Community engagement** | Community home; smart group chat (mock); polls and resources; services directory; marketplace (optional) | 8 |
| 6 | **S.2 Society staff and optional payroll** | HR for societies, duty roster and attendance; optional payroll with loans and bonuses | 17 |
| 7 | **S.3 Rentals** | Leases, rent roll, owner statements, recorded payouts, landlord view | 8 |
| 8 | **Safety review** (documents only) | A written SOS safety design, approved by the owner and a safety adviser | 0 |
| 9 | **S.4 SOS prototype** (only after step 8) | Safety console, incident 360, settings, alert overlays | 5 |
| 10 | **Gate E** | Developer ERP. 117 distinct screens remain after 28 shared screens moved earlier | 117 |
| 11 | **Gate F** | Public sites (unchanged) | 18 |
| 12 | **Gate G** | Remaining completeness and real-device QA. 47 screens remain after 3 moved earlier | 47 |
| 13 | **Gate H** | Production Laravel, tenant DBs and integrations, only after the whole agreed frontend is approved | — |

**Why D.1 → S.1 → D.2 → D.3** (the alternative is in D-23)
- **D.1 first.** The accessibility hub is a mandatory owner decision. Invitations and login status are what make a society actually use the resident app.
- **S.1 second.**
  - It extends the C.1/C.2 billing and collections engine while that engine is fresh, and it holds most of Issue #2's P0 finance items.
  - The approval policies it introduces are needed later by D.2 (work-order spend), S.2 (payroll) and S.3 (payouts).
- **D.2 and D.3 next.** These are the resident-operations and engagement layers.
- **Business add-ons afterwards.** S.2 and S.3 are sold separately, so they follow.

**Distinct screens by gate (after the delta)**

| Gate | Distinct screens | How it changed |
|---|---:|---|
| D | **50** | Was 33. −1 PORTAL-023 folds into PORTAL-036; +14 new; +4 brought forward (ADM-003, PARK-005, NOT-003, DOC-001) |
| S (new) | **45** | 18 new + 27 brought forward from Gate E |
| E | **117** | Was 145. 28 moved to D and S. Gate E adds developer specifics on the shared HR, payroll, banking, approvals and transfer screens |
| G | **47** | Was 50 |
| F | 18 | Unchanged |
| Built, B, C and mixed | 91 | Unchanged |
| **Total** | **368** | Was 337 |

## 2. Definition of done (every milestone)

This is the same bar as Gates B and C, raised where Issue #2 asks.

1. **Screens.** Every screen in the milestone scope is interactive with mock data.
   - No route counts as complete while it shows a placeholder.
   - Register status is honest: BUILT, PARTIAL or PLANNED, with evidence.
2. **Languages and layout.** EN and UR at 1440, 768 and 390 px:
   - 320 px reflow;
   - text at 200 %;
   - Urdu font and mixed-script (bidi) isolation for names, flat codes and amounts;
   - the personalisation hub settings (from D.1 onwards) applied everywhere.
3. **Access.**
   - Every new nav item, widget, quick-create entry and tour step declares `requires: { modules, permission }`.
   - Every mock handler declares its module, permission and suspension class (the CP2 rule).
   - "Not in your plan" pages are used for unlicensed modules.
4. **Privacy tests.**
   - No-leak vectors for the milestone's data.
   - Wording tests for "simulated", "recorded" and "never Paid".
   - Consent checks.
5. **Automated checks.**
   - typecheck, lint, i18n parity;
   - unit tests and golden vectors;
   - E2E with retries off, green on two consecutive full runs;
   - axe with 0 violations on every screen and overlay in EN/UR;
   - Firefox and WebKit smoke.
6. **Tours.** Spotlight tours for new areas (not modal carousels), replayable from the tour library.
7. **Evidence.**
   - screenshots (EN/UR, three widths);
   - videos of the storyline;
   - `FUNCTION_MATRIX.md`, `test-results.md`, `MANUAL_VERIFICATION.md`.

   NVDA, VoiceOver and real-device checks stay listed as open until a person performs them. No WCAG conformance is claimed.
8. **Stop.** Push to the feature branch only, then stop for owner review. Do not merge to `main`.

## 3. Milestones

### D.1 Identity, personalisation and onboarding (16 distinct)

- **Existing Gate D screens (11):**
  - GLOBAL-008 profile;
  - GLOBAL-010 appearance and accessibility (back office);
  - HQ-024 (HQ);
  - PORTAL-030 welcome and setup;
  - PORTAL-024 profile;
  - PORTAL-025 household;
  - RES-004 household members;
  - PORTAL-002/003 my properties and Property 360;
  - AUTH-006 customer portal login;
  - ADM-022 tenant theme policy.
- **New (4):**
  - RES-007 portal access and invitations;
  - AUTH-007 accept invitation;
  - GLOBAL-015 app switcher;
  - ADM-024 data export and privacy requests.
- **Brought forward:** ADM-003 user workspace (sessions tab).
- **States:**
  - SITE-009 Unit 360 portal tab;
  - RES-009 invite drawer;
  - GLOBAL-016 and PORTAL-041 devices.
- **Reference experiences (polish these first, at all widths):**
  1. The personalisation hub, built on the C.2 text-size work:
     - theme, including dark and high contrast;
     - palettes, density, reduced motion;
     - reading mode and Urdu font.

     It is applied by design tokens in all three apps, and the tenant theme never overrides personal settings.
  2. Invite → accept → language → text size → home, for a fictional Al-Noor resident who has never signed in.
  3. The manager's portal access dashboard. Every KPI opens filtered people.
- **Storyline:**
  1. Imran (manager) sees invited, active, inactive, never-signed-in and vacant counts for Al-Noor's 80 flats.
  2. He invites the never-signed-in owners of Block B, sending a simulated WhatsApp to those who consented, and printed codes for the others.
  3. A resident accepts.
  4. Ayesha (treasurer, and also a fictional resident of a B-block flat) switches between apps without any leak.
  5. The administrator requests an export; Ayesha approves it; the file expires.
- **Acceptance checks:**
  - residents can never open RES-007;
  - status is derived correctly (vectors);
  - an expired or used token is refused;
  - consent is checked before each simulated message;
  - resends are rate-limited;
  - nothing leaks across an app switch (cache, search, recent records);
  - revoking a session works for self and admin, and is audited;
  - export scope ≤ grants ∩ permissions, maker ≠ checker, and the file expires;
  - a deletion request keeps financial records (anonymised);
  - the personalisation settings persist per user and per tenant and apply in all apps;
  - the tenant theme cannot disable high contrast or text size.
- **Not included:** real OTP, SMS, WhatsApp or email; real file generation beyond a fictional demo file.

### S.1 Society finance and governance essentials (15 distinct)

- **New (4):**
  - BANK-007 cashbook;
  - FIN-013 bulk office collection;
  - COL-007 reminder rules and history;
  - RES-008 Committee 360.
- **Brought forward (11):**
  - BANK-001 bank and cash accounts;
  - BANK-002 Account 360;
  - BANK-006 deposits and transfers;
  - FIN-001 society finance overview;
  - OWN-003/004 society transfers;
  - APR-001…005 approvals and policies.
- **States:** BILL-018 print pack, COL-008 dues notices, COL-009 send reminder, FIN-014 batch review, BANK-008 close month, BANK-009 record movement, OWN-006 clearance certificate.
- **Extended:**
  - FIN-011 credit and advances;
  - COL-005;
  - BILL-003 (transfer fee category);
  - BILL-008 (print action);
  - FIN-007;
  - PORTAL-004 (credit card).
- **Reference experiences:**
  1. Month close for November:
     - the checklist (unreconciled lines, proofs waiting, unposted runs, cash count);
     - close by the treasurer;
     - a refused late entry;
     - a reopen through an approval policy.
  2. The bulk cash batch: collector Saba, confirmer Ayesha, receipts issued only on confirmation.
  3. A transfer: dues check refuses → fee invoice → payment → clearance certificate.
- **Golden vectors.** These are fixture values derived from the committed C.2 fixture, labelled illustrative where they are policy amounts:
  - The print pack for the posted November run has as many invoices as the run (79).
  - Dues notices go one per liable payer; the shared account prints per payer.
  - A bulk batch whose counted total ≠ the sum of its lines is refused. A confirmed batch allocates oldest first, this payer only.
  - Cashbook: opening + in − out = closing per account, and in = confirmed payments (no double count with the bank feed).
  - Reminder skip rules: paid, a proof pending, quiet hours, the monthly cap, no consent.
  - An approval policy version is chosen by date. Maker ≠ checker. Delegation expires.
  - A clearance certificate is refused with a balance > 0, and issued at 0 or with an approved waiver.
  - Advance payment: credit shows as payment − allocations, and auto-applies only when the site policy is on.
- **Not included:**
  - real bank movement, cheque clearing, or refunds of credit (Gate E);
  - a wallet;
  - late fees (still off, D-11).

### D.2 Resident operations (26 distinct)

- **Existing Gate D screens (21):**
  - MNT-001…008 maintenance;
  - VIS-001…006 visitors;
  - RES-001 resident dashboard;
  - RES-005 notices;
  - PORTAL-018 maintenance workspace;
  - PORTAL-021 parking;
  - PORTAL-022 amenities;
  - PORTAL-026 vehicles;
  - BILL-011 online gateway mock.
- **New (3):**
  - MNT-012 community issues board;
  - PORTAL-034 resident issues;
  - PORTAL-040 visitor at the gate.
- **Brought forward:** PARK-005 vehicle registry (approvals), NOT-003 quick broadcast.
- **States:** MNT-013 merge, PORTAL-035 raise issue, VIS-007 live queue, PARK-007 vehicle approval.
- **Reference experiences:**
  1. A resident raises a flat repair and a community issue, and affirms another resident's issue. The resident sees counts only.
  2. The guard asks the occupant from the live queue (simulated refresh) and the occupant approves on the phone.
  3. The manager triages, merges duplicates and converts an issue to a work order.
- **Tenants:**
  - Al-Noor (full community).
  - Shalimar Court, to prove the maintenance-only client gets issues and the gate queue from its 1 Nov grants, and still never reaches CRM, sales or finance.
- **Acceptance checks:**
  - affirmation counting and withdrawal, and merges keep counts;
  - residents never see who else is affected;
  - only occupants are asked at the gate (an owner who does not live there is not);
  - gate requests expire;
  - a vehicle plate is unique among approved vehicles;
  - official notices stay one-way (no replies in notices);
  - the online gateway mock never marks Paid without a verified mock event (I-10/I-11);
  - a suspended tenant (Cedar) can read history but cannot change anything.

### D.3 Community engagement (8 distinct)

- **New (7):**
  - PORTAL-036 Community home;
  - CHAT-001 inbox;
  - CHAT-003 groups and moderation;
  - PORTAL-031 resident chat;
  - CMTY-001 services directory;
  - CMTY-002 polls;
  - CMTY-003 marketplace moderation (only if D-31 says build it).
- **Brought forward:** DOC-001 documents (publish to residents).
- **Folded in:** PORTAL-023 notices becomes a tab of PORTAL-036.
- **States:** CHAT-002, CHAT-004, PORTAL-032, CMTY-004, PORTAL-038, PORTAL-039.
- **Reference experiences:**
  1. The resident Community home on a phone, with only licensed tabs and an explanatory empty state per tab.
  2. Smart groups: the manager previews "who is in Block B and why"; a tenant-payer joins their block group, not the owners' committee group, and sees no earlier history.
  3. An informal poll, one response per flat, anonymous: results appear after it closes.
- **Acceptance checks:**
  - membership vectors (join, move-out, term end, tenant vs owner);
  - `visible_from` hides earlier messages;
  - direct messages follow D-25;
  - moderators reach messages only through reports;
  - every conversation is labelled demo, and nothing is sent outside the browser;
  - poll uniqueness and anonymity;
  - unvetted providers are hidden and consent gates contact details;
  - marketplace pre-moderation (if built);
  - no debt, login or contact leak in any tab;
  - Chat takes the phone centre slot only under the D-25 rule.

### S.2 Society staff and optional payroll (17 distinct)

- **New (1):** HR-010 shifts and duty roster.
- **Brought forward:**
  - HR-001…009, edition-aware;
  - PAY-001…007, as an optional sub-slice S.2b. Its start is decided separately.
- **States:** HR-011 on duty now.
- **Reference experiences:**
  1. The weekly roster for guards and gardeners (overnight shifts, swaps), published to residents as role-only "on duty".
  2. Attendance and leave, with roster responders feeding safety settings later (S.4).
  3. S.2b only: a payroll run with a bonus and a loan instalment, prepared by Saba, approved by Ayesha, posted as recorded.
- **Acceptance checks:**
  - no double booking, and overnight shifts count correctly;
  - a staff member's public profile needs consent;
  - a community tenant without the add-on sees the "not in your plan" page;
  - net-pay and loan vectors;
  - statutory placeholders are labelled;
  - nothing is labelled "paid";
  - maker ≠ checker.

### S.3 Rentals (8 distinct)

- **New:**
  - RNT-001 leases;
  - RNT-002 Lease 360;
  - RNT-003 new lease wizard;
  - RNT-004 rent roll and billing;
  - RNT-005 owner statements;
  - RNT-006 owner payouts (recorded);
  - RNT-007 rental settings;
  - PORTAL-037 landlord view.
- **States:** RNT-008 renew/terminate, RNT-009 deposit refund.
- **Tenant:** Riverbend Estate Managers (portfolio), with `rentals` on two of its three sites.
  - Fictional: one landlord who owns two flats, one tenant, and one management agreement with written authority.
- **Reference experiences:**
  1. Create a lease in the wizard and preview the payer effect: rent liability is separate from dues.
  2. Post the month's rent roll (idempotently); the tenant pays through the C.2 flow; the owner statement updates.
  3. Prepare and approve a payout, shown as **"Recorded, not sent"**.
- **Acceptance checks:**
  - rent vectors (proration, escalation);
  - idempotent posting;
  - rent and dues liabilities do not mix (I-30);
  - the landlord sees only their units;
  - owner statement arithmetic;
  - payout ≤ payable;
  - maker ≠ checker;
  - entity isolation;
  - fees need an agreement;
  - the deposit is a liability.
- **Not included:** real payouts, tax withholding calculations beyond labelled placeholders (D-33), or deposit refund payments.

### Safety review (documents only), then S.4 SOS prototype (5 distinct)

- **The review document must cover:**
  - responders by shift and escalation;
  - acknowledgement and timeouts;
  - false alarms and cancellation;
  - offline and failure behaviour (always "call 15 / 1122");
  - accessibility under stress;
  - privacy (unit-level only, no GPS);
  - wording and liability;
  - drills;
  - data retention.

  The owner, and a safety adviser if the owner chooses, approve it (D-26).
- **S.4 scope:**
  - SOS-001 safety console (SOS-005 history and drills);
  - SOS-002 Incident 360;
  - SOS-003 safety settings;
  - SOS-004 staff alert overlay;
  - PORTAL-033 resident SOS.
- **Acceptance checks:** defined by the review. At least:
  - two-step activation;
  - the escalation timer;
  - the failure state shows the national numbers;
  - an append-only timeline;
  - no "help is coming" wording;
  - axe on the overlays, including assertive announcements.

## 4. Test assets to add (when each milestone starts)

| Asset | Milestone | Checks |
|---|---|---|
| `portal-access.vectors.json` | D.1 | Status derivation, consent, resend limits |
| Cross-app no-leak E2E | D.1 | App switch (extends the CP2 tenant-switch tests) |
| `finance-ops.vectors.json` | S.1 | Cashbook, period lock, batch, reminders, clearance |
| `approvals.vectors.json` | S.1 | Policy version by date, maker ≠ checker, delegation |
| `issues.vectors.json` | D.2 | Affirmations, merge, privacy |
| `gate-queue.spec.ts` | D.2 | Occupant targeting, expiry |
| `chat-membership.vectors.json` | D.3 | Join, leave, visibility, tenant vs owner |
| `polls.vectors.json` | D.3 | Uniqueness, anonymity |
| `hr-roster.vectors.json`, `payroll.vectors.json` | S.2 | Shifts, net pay, loans |
| `rentals.vectors.json` | S.3 | Rent, idempotency, statements, payouts, separation |
| Wording tests | all | "Simulated", "Recorded, not sent", "never Paid", "not an emergency service" |

## 5. Registers, docs and branches

- **Register delta adoption.** The delta is applied to the live register **per milestone**: only that milestone's rows, at its start (the D-19 pattern). This keeps the register honest and avoids 95 placeholder rows appearing at once (D-43).
- **Gate labels for existing Gate D screens.** In the delta, existing Gate D screens keep the label `D` unless they change. Their slice (D.1 or D.2) is set by §3 above, when that slice starts.
- **Status documents.** Each milestone gets `docs/status/<milestone>/`, following the C.2 layout.
- **Branches.**
  - Milestones are implemented on the agreed feature branch, after the owner says so, and pushed there.
  - This proposal lives on `docs/nizam-v3.2-scope-review` until it is approved.

## 6. What Gate H will need later (recorded now, not built)

- Real-time messaging infrastructure, moderation tooling and retention jobs (chat).
- SMS, WhatsApp and push providers, with consent and opt-out handling.
- SOS: a delivery path with redundancy, monitoring, an on-call model and legal sign-off.
- Payment providers (already planned) and bank feeds; payout rails, only with legal authority for client money.
- Payroll statutory rules from an adviser; rent tax withholding rules.
- Export generation, secure storage, expiring links, and a privacy-request workflow with legal retention schedules.
