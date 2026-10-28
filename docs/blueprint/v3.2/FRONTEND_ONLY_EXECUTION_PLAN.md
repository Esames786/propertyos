# V3.2 proposal: frontend-only execution plan (revision 3)

**Status:** PROPOSAL. It does **not** authorise any milestone.
- **Each milestone is individually authorised by the owner**, and stops for review when it ends.
- Gate C.2 is finished first.

**The owner's directive (Issue #2).** Complete, interactive, high-fidelity prototypes come before any production work:
- EN/UR with right-to-left layout;
- desktop, tablet and mobile;
- shared design tokens;
- role-aware navigation;
- typed mock state and contracts;
- E2E and accessibility evidence.

"Production work" means Laravel, real migrations, live payment/SMS/WhatsApp/chat integrations, and actual financial flows. A typed mock transport is allowed. It is not backend authorisation.

**Counts are provisional.**
- The official baseline is the committed C.1 register: **394 rows, 335 distinct screens**.
- C.2 is now committed (`d5e599d`) and awaits review. The delta is regenerated on its register after that review (D-43).

## 1. Sequence

| Step | Milestone | What it delivers | Distinct screens (provisional) |
|---|---|---|---:|
| 0 | **Gate C.2** (committed as `d5e599d`; awaiting review) | Resident payments, verification and reconciliation, receipts, first-run text size | (as authorised) |
| 1 | **V3.2 review** (this package) | Owner and GPT approve, or amend, scope, decisions, model and sequence. The delta is regenerated on committed C.2 | 0 |
| 2 | **D.1 Identity, personalisation and onboarding** | The mandatory personalisation hub in all three apps; invitations and portal access; profile, household and devices; app switch; data export and privacy requests | 15 |
| 3 | **S.1 Society finance and governance essentials** | Print packs; reminders; controlled bulk collection (cash vs cheque); cashbook view and cash vouchers; deposits and transfers (instruction → settlement); month close; credit and advances; society transfers with fee and clearance; committee 360; approval policies | 15 |
| 4 | **D.2 Resident operations** | Maintenance and community issues; visitors with the live gate queue; vehicle approvals; **official notices end to end** (compose → resident notification → notice detail), independent of `community_hub`, and quick broadcast; online gateway mock | 26 |
| 5 | **D.3 Community engagement** | Community home (links to notices, does not own them); smart group chat (mock); polls and resources; services directory; marketplace (optional) | 8 |
| 6 | **S.2 Society staff and optional payroll** | HR for societies, duty roster and attendance; optional payroll (obligation → instruction → settlement) | 17 |
| 7 | **S.3 Rentals** | Leases (agent or principal model), rent roll, owner statements, payout instructions and settlement, landlord view | 8 |
| 8 | **Safety design** (documents only, separately approved) | A written SOS safety design | 0 |
| 9 | **S.4 SOS prototype** (only after step 8 **and** a separate authorisation) | Safety console, incident 360, settings (overlays are states). **Parked potential scope, not authorised work** | 3 (parked) |
| 10 | **Gate E** | Developer ERP | 117 |
| 11 | **Gate F** | Public sites (unchanged) | 18 |
| 12 | **Gate G** | Remaining completeness and real-device QA | 47 |
| 13 | **Gate H** | Production Laravel, tenant DBs and integrations, only after the whole agreed frontend **and** the logical model are approved | — |

**Why D.1 → S.1 → D.2 → D.3** (the alternative is in D-23; GPT's review recommends this order)
- **D.1 first.** The accessibility hub is a mandatory owner decision, and invitations make a society actually use the resident app.
- **S.1 second.**
  - It extends the C.1/C.2 billing and collections engine while that engine is fresh, and it holds most of the P0 finance items.
  - The approval policies it introduces are needed later by D.2, S.2 and S.3.
- **D.2 and D.3 next.** These are the resident-operations and engagement layers.
- **Business add-ons afterwards.** S.2 and S.3 are sold separately, so they follow.

**Distinct screens by gate (provisional, on the C.1 baseline)**

| Gate | Distinct screens | How it changed |
|---|---:|---|
| D | **49** | Was 33. +12 new; +4 brought forward (ADM-003, PARK-005, NOT-003, DOC-001). Revision 3: PORTAL-023 stays canonical (revision 2 had folded it, giving 48) |
| S (new) | **43** = 40 active + 3 parked | 16 new (13 active, 3 parked SOS) + 27 brought forward from Gate E. The SOS pages are **parked potential scope, not authorised work** |
| E | **117** | Was 145; 28 moved to D and S |
| G | **47** | Was 50 |
| F | 18 | Unchanged |
| Built, B, C and mixed | 89 | Unchanged on C.1. C.2 (`d5e599d`) adds BILL-016/017 (+2) once it is reviewed |
| **Total** | **363** (360 active + 3 parked) | Was 335 (C.1). Informational: 337 → 365 on the C.2 commit `d5e599d`, pending review |

## 2. Definition of done (every milestone)

1. **Screens.** Every screen in scope is interactive with mock data.
   - No route counts as complete while it shows a placeholder.
   - Register status is honest: BUILT, PARTIAL or PLANNED, with evidence.
   - The milestone's delta rows are adopted into the live register **only when that milestone is authorised**.
2. **Languages and layout.** EN and UR at 1440, 768 and 390 px:
   - 320 px reflow;
   - text at 200 %;
   - Urdu font and mixed-script (bidi) isolation;
   - personalisation settings applied everywhere (from D.1 onwards).
3. **Access.**
   - Every nav item, widget, quick-create entry and tour step declares `requires: { modules, permission }`.
   - Every mock handler declares its module, permission and suspension class.
   - "Not in your plan" pages are used for unlicensed modules.
4. **Money and privacy rules** (revision 2):
   - instruction ≠ settlement;
   - an uncleared cheque settles nothing;
   - the cashbook = its sources;
   - no self-approval;
   - exports never widen scope;
   - small-audience thresholds, including differencing across groupings and time snapshots (revision 3);
   - official notices never gated by an optional add-on (revision 3);
   - no-leak vectors;
   - wording tests ("Simulated bank confirmation", "Approved instruction — not sent", "Cheque received — not a receipt of payment", "never Paid").
5. **Automated checks.**
   - typecheck, lint, i18n parity;
   - unit tests and golden vectors;
   - E2E with retries off, green on two consecutive full runs;
   - axe with 0 violations in EN/UR;
   - Firefox and WebKit smoke.
6. **Tours.** Spotlight tours, replayable.
7. **Evidence.**
   - screenshots;
   - videos;
   - `FUNCTION_MATRIX.md`, `test-results.md`, `MANUAL_VERIFICATION.md`.

   NVDA, VoiceOver and real-device checks stay open until a person does them. No WCAG claim is made.
8. **Stop.** Push to the agreed feature branch only. Stop for owner review. Do not merge to `main`.

## 3. Milestones

### D.1 Identity, personalisation and onboarding (15 distinct)

- **Existing Gate D screens (11):**
  - GLOBAL-008 profile;
  - GLOBAL-010 appearance and accessibility;
  - HQ-024;
  - PORTAL-030 welcome;
  - PORTAL-024 profile;
  - PORTAL-025 household;
  - RES-004;
  - PORTAL-002/003;
  - AUTH-006;
  - ADM-022.
- **New (3):** RES-007 portal access and invitations, AUTH-007 accept invitation, ADM-024 data export and privacy requests.
- **Brought forward:** ADM-003 (sessions tab).
- **States:**
  - GLOBAL-015 app switcher (of GLOBAL-008);
  - GLOBAL-016 and PORTAL-041 devices;
  - SITE-009 Unit 360 portal tab;
  - RES-009 invite drawer.
- **Reference experiences:**
  1. The personalisation hub in all three apps:
     - theme, including dark and high contrast;
     - palettes, density, reduced motion;
     - reading mode and Urdu font.

     It builds on C.2's text size. The tenant theme never overrides personal settings.
  2. Invite → accept → language → text size → home.
  3. The manager's portal access dashboard, where every KPI opens filtered people.
- **Acceptance checks:**
  - residents can never open RES-007;
  - status derivation vectors;
  - an expired or used token is refused;
  - consent is checked before every simulated message;
  - resends are rate-limited;
  - no leak across an app switch (cache, search, recent records);
  - session revocation works for self and admin, and is audited;
  - the export never exceeds the requester's own access, and an approver cannot widen it;
  - approver ≠ requester, and files expire;
  - a deletion request keeps financial records (anonymised);
  - personalisation persists per user and per tenant.

### S.1 Society finance and governance essentials (15 distinct)

- **New (4):** BANK-007 cashbook (derived view), FIN-013 bulk office collection, COL-007 reminder rules and history, RES-008 Committee 360.
- **Brought forward (11):**
  - BANK-001, BANK-002;
  - BANK-006 deposits and transfers;
  - FIN-001;
  - OWN-003/004;
  - APR-001…005.
- **States:**
  - BILL-018 print pack;
  - COL-008 dues notices, COL-009 send reminder;
  - FIN-014 batch review;
  - BANK-008 close month, BANK-009 cash voucher;
  - OWN-006 clearance certificate.
- **Reference experiences:**
  1. **Instruction → settlement.**
     - A cash deposit is approved, its cash leg is settled on a witnessed deposit slip (cash in transit), and its bank leg on a matched bank line, or a visibly labelled "Simulated bank confirmation".
     - The cashbook moves only at each settlement.
  2. **Bulk collection, cash vs cheque.**
     - Saba collects 4 cash lines and 1 cheque; Ayesha confirms.
     - The cash creates payments and receipts per the site policy (D-46).
     - The cheque stays "Cheque received — not a receipt of payment" until cleared.
     - One cheque is returned: nothing settles and lines stay open.
     - One cleared cheque is reversed: the payment, allocation and receipt are reversed and lines reopen.
  3. **Month close.**
     - Checklist: unreconciled lines, proofs waiting, unposted runs, cash in transit, unsettled instructions, witnessed cash count.
     - Then close; a refused late posting; a reopen through an approval policy.
  4. **Transfer:** dues check refusal → fee invoice → payment → clearance certificate.
- **Golden vectors.** These come from the committed C.2 fixture; policy amounts are labelled illustrative.
  - The print pack count = posted invoices of the run.
  - Notices go one per liable payer.
  - Cashbook = Σ settled sources, with no stored cashbook rows.
  - An instruction without settlement changes nothing.
  - A voucher needs approval by someone else and reverses cleanly.
  - Expense vouchers are disabled when `payables` is granted.
  - Cheques:
    - received → returned settles nothing;
    - received → cleared settles once;
    - cleared → reversed reopens lines.
  - Reminder skip rules.
  - The policy version is chosen by date. A draft policy cannot approve itself or its creator's requests.
  - Clearance needs a zero balance or a waiver.
  - Credit = payment − allocations.
- **Not included:**
  - real bank movement, cheque clearing or refunds;
  - a wallet;
  - late fees (D-11).

### D.2 Resident operations (26 distinct)

- **Existing Gate D screens (22):**
  - MNT-001…008;
  - VIS-001…006;
  - RES-001, RES-005;
  - PORTAL-018, -021, -022, -023, -026;
  - BILL-011.
- **New (2):** MNT-012 community issues board, PORTAL-034 resident issues.
- **Brought forward:** PARK-005, NOT-003.
- **States:**
  - MNT-013 merge;
  - PORTAL-035 raise issue;
  - VIS-007 live queue;
  - PORTAL-040 visitor at the gate (of PORTAL-015);
  - PARK-007 vehicle approval;
  - **PORTAL-042 resident notifications panel** (of PORTAL-001);
  - **PORTAL-043 notice detail** (of PORTAL-023, route `/customer/portal/community-notices/:id`).
- **Reference experience (revision 3): the official notice journey.**
  1. Compose in RES-005, preview the audience, and publish (or use quick broadcast in NOT-003 with "also post as notice").
  2. Each resident in the audience gets a notification (PORTAL-042), plus a simulated SMS/WhatsApp copy where consent exists.
  3. The resident opens the notice (PORTAL-043) and acknowledges it if asked.
  4. The office sees delivered, read and acknowledged counts.

  This runs on the included modules only: `residents`, `communications` (which owns `notices.publish`), `resident_portal` and `core` notifications. Al-Noor has no `community_hub` or `community_chat` grant until its D.3 amendment, so D.2 demonstrates the journey without the add-ons.
- **Tenants:** Al-Noor; Shalimar Court (maintenance-only, grants from 1 Nov); Cedar Hills (suspended: history read-only).
- **Acceptance checks:**
  - affirmations and merges;
  - **small-audience threshold** (D-47) on counts, **with differencing vectors**:
    - site minus block;
    - adjacent groupings;
    - consecutive snapshots around one affirmation;
    - affirm–withdraw toggling;
  - **the notice journey E2E with a grant set that has neither `community_hub` nor `community_chat`**;
  - `/customer/portal/community-notices` and `/:id` open from the notification, the home card and a simulated SMS link;
  - **audience vectors:**
    - an owner, an occupant and a tenant-payer of one flat;
    - the block and floor audiences;
    - a moved-out resident gets "not available to you";
  - edit creates a new version;
  - withdraw leaves a tombstone and withdraws notifications;
  - publishing needs `notices.publish`, while `residents.view` alone can only read;
  - Cedar Hills residents can read but staff cannot publish;
  - identities hidden from residents;
  - only occupants are asked at the gate;
  - expiry;
  - plate uniqueness;
  - notices stay one-way;
  - the online gateway mock is never Paid without a verified mock event;
  - suspension is respected.

### D.3 Community engagement (8 distinct)

- **New (7):**
  - PORTAL-036 Community home;
  - CHAT-001, CHAT-003, PORTAL-031;
  - CMTY-001 directory;
  - CMTY-002 polls;
  - CMTY-003 marketplace moderation (only if D-31 says build it).
- **Brought forward:** DOC-001.
- **Notices on Community home (revision 3).** PORTAL-036 shows a "Latest notices" summary that links to PORTAL-023/043.
  - Notices stay canonical in D.2; nothing is folded in.
  - Removing `community_hub` never hides notices.
- **Acceptance checks:**
  - membership vectors;
  - `visible_from`;
  - **revocation on move-out:**
    - the server refuses reads, posts and sync at once;
    - deliveries queued for the member are dropped;
    - notifications are withdrawn;
    - a device that was offline keeps its downloaded copy only until it reconnects, and then the copy is removed;
    - messages written offline are rejected on reconnect;
    - no wording promises immediate remote deletion;
  - **with `community_hub` removed from the grant set:**
    - Community home hides only the hub tabs;
    - the Notices nav item and PORTAL-023/043 still work;
  - resident direct messages off by default;
  - moderation only via reports;
  - chat is unavailable until the tenant sets retention;
  - polls: uniqueness, anonymity, thresholds, results only after close, and differencing across groupings;
  - unvetted providers are hidden;
  - consent gates contact details;
  - marketplace pre-moderation (if built);
  - no debt, login or contact leak.

### S.2 Society staff and optional payroll (17 distinct)

- **New (1):** HR-010 shifts and duty roster.
- **Brought forward:** HR-001…009 (edition-aware); PAY-001…007 as the optional sub-slice S.2b, authorised separately.
- **Acceptance checks:**
  - shifts (including overnight);
  - consent for the resident-visible staff profile;
  - "not in your plan" without the add-on;
  - net pay and loans (V2.1 advances, kind = loan);
  - statutory placeholders are labelled;
  - **a payroll run is an obligation, disbursement is an instruction, and only a settlement moves cash**;
  - maker ≠ checker.

### S.3 Rentals (8 distinct)

- **New:**
  - RNT-001 leases;
  - RNT-002 Lease 360;
  - RNT-003 new lease wizard;
  - RNT-004 rent roll;
  - RNT-005 owner statements;
  - RNT-006 payout instructions and settlement;
  - RNT-007 settings (agreements, issuing model);
  - PORTAL-037 landlord view.
- **Tenant:** Riverbend (portfolio), with `rentals` on two of three sites.
  - Fictional: two owners, one tenant per lease.
  - One agreement uses the **agent** model and one the **principal** model, both labelled as alternatives pending D-33.
- **Acceptance checks:**
  - rent vectors and idempotent posting;
  - rent and dues liabilities never mix;
  - **client money stays in client accounts with an owner sub-ledger, and one owner's money never settles another's**;
  - deposits are liabilities;
  - **an approved payout instruction changes neither cash nor the payable; only a settlement does, once**;
  - maker ≠ checker;
  - nothing reaches the SaaS company.

### Safety design, then S.4 (parked)

- **Parked potential scope, not authorised work.** SOS remains unavailable until safety approval. Its 3 pages are counted separately and belong to no D or S milestone.
- **No SOS UI of any kind** (pages, overlays, global buttons, fixtures or contracts) until a separate safety design is approved **and** the owner authorises S.4.
- **The design covers:**
  - responders and escalation;
  - acknowledgement and timeouts;
  - false alarms;
  - offline and failure behaviour;
  - accessibility under stress;
  - privacy;
  - wording and liability;
  - drills;
  - retention;
  - **verified, region-specific emergency numbers**.
- **S.4 scope (if authorised):**
  - pages SOS-001, -002, -003;
  - states SOS-004, SOS-005 and PORTAL-033.

## 4. Test assets (added when each milestone is authorised)

| Asset | Milestone | Checks |
|---|---|---|
| `portal-access.vectors.json`; cross-app no-leak E2E | D.1 | Status, consent, resend; app switch |
| `export-scope.vectors.json` | D.1 | Requester scope, approver cannot widen |
| `finance-ops.vectors.json` | S.1 | Cashbook = sources; vouchers; instruction vs settlement; cheques (returned, reversed); period lock; clearance |
| `approvals.vectors.json` | S.1 | Version by date; no self-approval; drafts cannot approve themselves; delegation |
| `issues.vectors.json`; `privacy-differencing.vectors.json` | D.2 | Affirmations, merge, thresholds; site − block, adjacent groupings, consecutive snapshots, affirm–withdraw toggling |
| `notices.vectors.json`; notice journey E2E | D.2 | Audience (owner, occupant, tenant-payer, block, floor, moved out); versions and withdrawal; grant set without `community_hub`/`community_chat`; deep links |
| `chat-membership.vectors.json`; revocation E2E | D.3 | Join, leave, visibility; server revocation at once; offline device cache removed on reconnect; offline-written messages rejected |
| `polls.vectors.json` | D.3 | Uniqueness, anonymity, thresholds, results after close, differencing across groupings |
| `hr-roster.vectors.json`, `payroll.vectors.json` | S.2 | Shifts; net pay; obligation → settlement |
| `rentals.vectors.json` | S.3 | Rent; agent and principal models; client-money separation; payout settlement |
| Wording tests | all | "Simulated bank confirmation", "Approved instruction — not sent", "Cheque received — not a receipt of payment", "never Paid" |

## 5. Registers, documents and branches

- **The live register is not changed** until C.2 is complete and V3.2 is reviewed.
- After that, each milestone's delta rows are adopted only when that milestone is authorised (D-43).
- Existing Gate D rows keep the label `D` until their slice starts.
- Each milestone gets `docs/status/<milestone>/`.
- This proposal lives on `docs/nizam-v3.2-scope-review` until it is approved.

## 6. Recorded for Gate H (not built)

- Real-time messaging, moderation tooling and retention jobs.
- SMS, WhatsApp and push providers, with consent and opt-out handling.
- SOS delivery with redundancy, monitoring and on-call, plus legal sign-off.
- Bank feeds and payment providers.
- Payout and disbursement rails, only with legal authority for client money.
- Payroll statutory rules; rent tax withholding.
- Export generation and secure storage.
- The physical schema, after the logical model's architecture review.
