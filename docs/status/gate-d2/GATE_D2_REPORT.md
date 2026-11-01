# Gate D.2: Society Maintenance & Resident Operations (Al-Noor Residency)

**Status: built, frontend only, and stopped for review.**
- **Branch:** `feature/gate-d2-resident-ops`, from `integration/d1-s1` at `5b93544` (Gates D.1 and S.1 together).
- **Authorisation and sources:** the owner's Gate D.2 authorisation (Issue #7); V3.2 at `0e57604` (`docs/blueprint/v3.2/*`): execution plan §D.2, the module and licensing matrix §5.2 and §7, owner decisions D-28 and D-47, and the D.2 register delta (17 rows).
- **Not done, as instructed:**
  - no Laravel or production migrations;
  - no real SMS, WhatsApp, payment gateway, camera or QR scanner (each is simulated and labelled);
  - no chat, community hub, SOS, Gate D.3 or S.2;
  - no merge into `main`, no change to the main working directory, nothing deployed to the preview server.
- **How it runs:** in the browser against the typed, fail-closed mock API. **Data:** fictional throughout (`(Demo)` names, example plates and numbers).
- **Not claimed:** WCAG conformance. Automated accessibility checks pass; manual screen-reader and device checks are open in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

Further detail:
- Results of every check: [`test-results.md`](test-results.md).
- Requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md).

## 1. How to try it

`npm run dev` starts the office app (5173), the resident app (5174) and Platform HQ (5175). Both apps share the society demo in one browser. In the office app: `/backoffice/get-started` → **Explore the society demo**; in the resident app, sign in as **Kamran Siddiqui (A-101)**.

| Where | Who | What to look at |
|---|---|---|
| Resident app → **Requests → Report a repair** | **Kamran Siddiqui**, A-101 | A repair with room, urgency, a described photo and how to reach him; the steps it goes through; who is coming and when. |
| Office → **Operations** (`/backoffice/mnt/maintenance-dashboard`) | **Naveed Anjum**, maintenance supervisor | The dashboard figures open their lists. Open the new request: **Triage** sets the priority and the response times; **Assign** suggests the plumber; start, then **Mark as fixed** with a note and a photo. |
| Resident app → bell → **Is it fixed?** | Kamran | Confirm with a rating (closes it) or **Not fixed** (back to the same technician). Home shows the repair under **Needs your attention**. |
| Office → **SLA dashboard**, **Resident confirmation**, **Technician board** | Naveed; **Waqas Ali**, electrician | Clocks met or breached; confirmations; the electrician sees only his own jobs. |
| Resident app → **Requests → Visitors → Invite a guest** | Kamran | A pass with a window, a plate and a 6-digit code. |
| Office → **Visitors & gate → Gate** | the security guard | Check a code (a wrong or used code is refused), check out; a walk-in without a pass: **Ask the resident**; the **Live queue** shows the answer. |
| Resident app (phone) | Kamran | The gate's question arrives as a prompt: approve, deny or ask for a call. Also answerable from **Visitors**. |
| Office → **Notices** | **Imran Qureshi**, building manager | Compose with an audience preview (site, blocks, floors or flats × owners, occupants, payers), ask for acknowledgement, publish or schedule; delivery, read and acknowledgement counts and the flats that have not acknowledged. |
| Resident app → bell → notice | Kamran | Read and **Acknowledge**; Home lists notices that still need it. |
| Office → **Vehicles**, **Residents**, a flat's **Flat 360 → Services** | Imran | Approve a vehicle into a free slot after the server's checks; decide amenity bookings; record that an occupant moved out (the payer does not change). |
| Office → **Sites & flats → Al-Noor → Online payments** | **Rabia Hashmi**, committee secretary | The sandbox gateway: settings and signed test events. An accepted event never pays a bill. |
| Resident app → **Community issues**, **Parking**, **Vehicles**, **Amenities** | Kamran | Shared-place problems ("this affects me too", counts only past the privacy threshold), his slots, his vehicles, bookings. |

## 2. What D.2 adds

### 2.1 Model (`packages/contracts/src/operations.ts`; mock API `packages/fixtures/src/operations/`)

- **One request model for repairs and community issues (D-28):** a request has a kind, a category, a place (flat and room, or a shared area), the resident's urgency, photos with descriptions, contact and entry preferences. States: submitted → triaged → assigned → in progress (→ on hold) → completed → closed by the resident (or reopened, or closed by the office); merged and hidden for issues.
- **Response and fix times by priority (P1–P4)**, with on-track, at-risk, met and breached states; work orders per visit; a technician sees and moves only his own.
- **Community issues:** affirmations ("this affects me too") from households in the audience; counts shown to residents only under D-47 (at least 3 households and an audience of at least 5, fixed groupings, complement check, scheduled snapshots); staff see the live count and who.
- **Visitors:** passes (window, plate, single or multiple entry, code), gate check-in and check-out, walk-in requests answered by an occupant of the flat (5 minutes, then expired), the live queue (refreshes every 15 s, simulated), refusals (wrong code, outside the window, already used, cancelled).
- **Vehicles and parking:** a resident registers a vehicle; approval needs the plate to be unique among approved vehicles, the owner still linked to the flat and a free slot within the flat's allowance; reject with a reason; retire.
- **Notices:** versions, an audience resolved from the live facts on every read, recipients fixed at publication, per-recipient delivery, read and acknowledgement, withdrawal as a tombstone, scheduled publication (the simulated scheduler publishes a due notice on the next read); quick broadcasts with simulated SMS and WhatsApp copies.
- **Amenities:** instant or office-approved bookings; taken slots shown without names.
- **Moves:** an effective-dated move-out of an occupant; liability and app invitations never follow it.
- **Online payments (BILL-011):** sandbox settings and signed test events: accepted (waiting for the bank), refused (bad signature, duplicate, gateway off). Nothing is ever marked paid from here (C.2 ruling: settlement needs a matched statement line).
- **Rule R on every resident endpoint:** resident portal licensed, a verified link in force at the site, the person still holding a role on the flat today, and the service module (and feature) licensed for that site.

### 2.2 Screens (26 distinct, plus states)

| Screen | Address | Register status |
|---|---|---|
| MNT-001 Maintenance dashboard | `/backoffice/mnt/maintenance-dashboard` | BUILT |
| MNT-002 Maintenance list | `/backoffice/mnt/maintenance-list` | BUILT |
| MNT-003 Request 360 | `/backoffice/mnt/maintenance-360-workspace?record=` | BUILT |
| MNT-004 New request | `/backoffice/mnt/new-request` | BUILT |
| MNT-005 Assign work order | `/backoffice/mnt/assign-work-order` (opens the assign drawer) | BUILT |
| MNT-006 Technician board | `/backoffice/mnt/technician-board` | BUILT |
| MNT-007 SLA dashboard | `/backoffice/mnt/sla-dashboard` | BUILT |
| MNT-008 Resident confirmation | `/backoffice/mnt/resident-confirmation` | BUILT |
| MNT-012 Community issues board (new) | `/backoffice/mnt/issues` | BUILT, with state MNT-013 merge drawer |
| VIS-001 Visitor dashboard | `/backoffice/vis/visitor-dashboard` | BUILT |
| VIS-002 Visitor passes | `/backoffice/vis/visitor-passes` | BUILT |
| VIS-003 Pass detail | `/backoffice/vis/pass-detail?record=` | BUILT |
| VIS-004 Gate check-in | `/backoffice/vis/gate-check-in` | BUILT, with state VIS-007 live queue |
| VIS-005 Visitor history | `/backoffice/vis/visitor-history` | BUILT |
| VIS-006 Scan QR (simulated) | `/backoffice/vis/scan-qr` | BUILT |
| RES-001 Resident dashboard | `/backoffice/res/resident-dashboard` | BUILT |
| RES-005 Notices and announcements | `/backoffice/res/community-announcements` | BUILT |
| NOT-003 Send message | `/backoffice/not/send-message` | BUILT |
| PARK-005 Vehicle registry | `/backoffice/park/vehicle-registry` | BUILT, with state PARK-007 approval drawer |
| BILL-011 Online gateway settings (sandbox) | Site 360 → **Online payments** tab | BUILT (sandbox scope) |
| PORTAL-018 Repairs | `/customer/portal/maintenance-workspace` | BUILT |
| PORTAL-021 Parking | `/customer/portal/parking` | BUILT |
| PORTAL-022 Amenities | `/customer/portal/amenities` | BUILT |
| PORTAL-023 Community notices | `/customer/portal/community-notices` | BUILT, with states PORTAL-042 bell and PORTAL-043 notice detail (**PARTIAL**: no attachments yet) |
| PORTAL-026 Vehicles | `/customer/portal/vehicles` | BUILT |
| PORTAL-034 Community issues (new) | `/customer/portal/issues` | BUILT, with state PORTAL-035 raise drawer |

Also: PORTAL-015 (services home) gains the society's Visitors tab and PORTAL-040 (the visitor at the gate: prompt and Visitors tab); Flat 360 gains a **Services** tab (requests, visitors, vehicles and slots, moves) and **Record a move-out**; the resident's Home gains **Needs your attention**.

## 3. The reference experiences

1. **Repair to resident confirmation.** Kamran reports a kitchen leak with a described photo → Naveed triages (P3: answer within a day, fix within five) → assigns Bilal (plumber, suggested by trade and load) for tomorrow morning → the work is started and marked fixed with a note and a photo → Kamran's bell and Home say *Is it fixed?* → he confirms with 5 stars → closed; both clocks met; the confirmation list shows it. "Not fixed" reopens it to the same technician. Video: `video/ref1-repair-desktop-en.webm`; Urdu on a phone in `screenshots/r*-390-ur.png`.
2. **Visitors and the gate.** Kamran invites Hina Rauf with her plate → a 6-digit code → the guard's wrong code is refused, the right one lets her in, she is checked out, and the used single-entry code is refused. A courier without a pass: the guard asks A-101 → Kamran's phone shows the prompt → approve → the live queue shows the answer → let in. Video: `video/ref2-gate-desktop-en.webm`.
3. **A notice with acknowledgement.** Imran writes *Water tank cleaning on Sunday* for the whole site, asks for acknowledgement and publishes → Kamran's bell → he reads and acknowledges → the office sees delivered, read and acknowledged counts and the flats that have not acknowledged (A-101 no longer listed). Video: `video/ref3-notice-desktop-en.webm`.

## 4. Owner decisions and rules, as applied

| Decision or rule | How D.2 applies it |
|---|---|
| D-28: community issues are maintenance requests (kind = community issue), not a second ticket system | One list and one Request 360 for both kinds; MNT-012 is a view of the same requests |
| D-47: privacy of affected counts | Opt-in affirmations; residents see a count only at ≥ 3 households with an audience ≥ 5, in fixed groupings, from scheduled snapshots; never who. A block is hidden when "site − block" would fall below the threshold, and, on sites with three or more blocks, when the hidden blocks together would (adjacent-block differencing). Vector-tested in `privacy-differencing.vectors.json` |
| C.2 ruling: only a matched bank statement line settles money | The sandbox gateway records *accepted, waiting for the bank*; no bill, balance or receipt changes |
| Rule R (V3.2): a resident sees services only through a verified link in force and a licensed service | Every `/portal/...` operations endpoint checks it; a moved-out tenant loses notices and requests for that flat at once |
| Gate B suspension rule: a suspended organisation keeps its start page, financial history and help; everything else is paused | All D.2 areas and endpoints are paused for a suspended organisation (Cedar Hills) — see §6, item 1 |
| No real channels (Issue #7) | SMS, WhatsApp, gateway, QR scanning and live refresh are simulated and say so on screen |

## 5. Screen register

- **Adopted:** the 17 D.2 delta rows: 2 new screens (MNT-012, PORTAL-034), 7 states (MNT-013, PORTAL-035, PORTAL-040, PORTAL-042, PORTAL-043, VIS-007, PARK-007) and 8 changed rows (MNT-002, MNT-003, PORTAL-023, PORTAL-026, RES-005, NOT-003, VIS-004, PARK-005).
- **Now:** 424 rows, 346 distinct screens: **118 built, 32 partial, 196 planned** (before D.2: 415 / 344; 92 / 32 / 220). All 321 V2.1 IDs and addresses preserved.
- **Corrections to the register (please confirm):**
  - MNT-012 and PORTAL-034 get plain addresses (`/backoffice/mnt/issues`, `/customer/portal/issues`); the delta's `?status=` and `?area=` are optional filters, noted in the rows.
  - Permission names follow the code: MNT-001/002/003/006/007 `operations.view`; MNT-004/005/008 `maintenance.manage`; VIS-004/006 `visitors.manage`; NOT-003 `messages.send` (the register said `maintenance.view` and `communications.view`, which do not exist).
- **Status method:** an independent read-only audit compared each row's tabs, actions, states and linked records with the code; the gaps it found were fixed (§8 lists what remains).

## 6. Decisions made in D.2 (please confirm or correct)

1. **Suspended organisations: D.2 is paused, not readable.** V3.2 says "history read-only" for Cedar Hills; Gate B's tested rule says only financial history stays readable. D.2 follows Gate B (maintenance, visitors, vehicles, notices and the residents dashboard all say *This workspace is suspended*). If maintenance history should stay readable, it is a one-word change per area.
2. **A technician without a sign-in** (Bilal Khan, plumber) is recorded by the office; Waqas Ali (electrician) has his own sign-in and sees only his jobs.
3. **The gate and maintenance staff see only what their work needs.** The guard's walk-in picker lists flat codes from the gate's own endpoint; the maintenance supervisor's new-request form lists flats with the names of the people who live in or own each (to raise a request on someone's behalf), from `/ops/flats`. Neither reads the site's records, payers or balances (neither role has `site.view`).
4. **Online payments** is a tab of Site 360 for whoever manages the merchant account (the committee secretary in the demo); the building manager does not see it.
5. **Scheduled notices** publish themselves on the next read after their time (the demo has no background jobs). A saved draft is published now; to schedule, start a new notice with a time.
6. **Community issues board:** *Open* lists every open issue; *In progress* is the subset assigned, being worked or on hold.
7. **Reasons:** rejecting a vehicle or declining a booking needs at least 10 characters; removing a vehicle or recording a move-out at least 5.
8. **Amenity slots** are time ranges (hall 12:00–16:00 and 18:00–23:00; rooftop 17:00–20:00 and 20:00–23:00).
9. **Phones show two tabs plus More** on Request 360, Site 360 and Flat 360 (their labels are long); other screens keep three (`UrlTabs` gained an optional `phoneLimit`).
10. **After a repair is marked fixed** the resident no longer sees "Bilal is coming on …"; the completion card replaces it.

## 7. Product decisions still open

- Attachments on notices (an agenda, a circular) and links from a notice to a record (PORTAL-043).
- Whether residents may book amenities for a flat they own but do not live in.
- Who may see a community issue's internal comments when an outside contractor is assigned.
- Whether a moved-out tenant who still owes dues keeps read access to past notices for that flat.

## 8. Limitations and what is not in D.2

- **PORTAL-043 PARTIAL:** notices are text only (no attachments or linked records).
- **Right-to-left typing (shared, all gates):** while typing English into a field in the Urdu app, a trailing full stop shows at the start of the line; saved text displays correctly everywhere. Tested fixes and why they were not applied: `test-results.md` §Findings.
- **Toasts over drawers (shared):** a stack of confirmations can cover a drawer's bottom buttons until the toasts dismiss themselves.
- **Not exercised in the browser:** a read-only vehicles view (every Al-Noor role that sees vehicles may approve them) and the suspended organisation's D.2 pages (covered by the unit tests of the shared access rule).
- **Simulated:** SMS, WhatsApp, QR scanning, the gateway, live refresh and scheduled publication; the demo clock keeps 26 October 2026 with the real time of day.
- No SOS, chat, community hub, payroll or rentals (later gates).

## 9. Integration notes (changes outside the D.2 folders)

- `packages/ui/src/layout/Tabs.tsx`: optional `phoneLimit` (default 3, unchanged behaviour elsewhere) with a unit test.
- `apps/backoffice/src/pages/society/kit.tsx`: `FlatSelect` accepts `options` (codes only) instead of reading the site structure, and keeps the typed text itself, so a re-render elsewhere on the page (the gate refreshing after a code check) no longer clears what someone is typing. This applies to every page that uses it.
- `apps/backoffice/src/pages/society/sites/SiteWorkspace.tsx` and `FlatWorkspace.tsx`: the Online payments, Services and move-out additions; two tabs on phones.
- `apps/customer-web/src/pages/dues/DuesHome.tsx`: the **Needs your attention** section; the resident tour's navigation text (`dues.json`) now names Requests and Notices.
- `apps/customer-web/src/prototype/routes.tsx`: the old PORTAL-016/017 addresses send society residents to Repairs.
- `packages/fixtures/src/shared-demo.ts` (the demo link between the two apps, D.1/C.2): a copy fetched from the office's bridge no longer replaces a save this app made while the copy was on its way. Overlapping requests on the resident's home page had lost a write (a resident's text size never reached her account).
- `packages/ui/src/workspace/tenantWorkspace.ts`: the D.2 menu entries. *Vehicles* and *Send message* own only their own addresses, so the other parking and notification screens (PARK-001, NOT-001 …) still answer as planned.
- `apps/backoffice/src/pages/home/PlanHome.tsx` (a maintenance-only client such as Shalimar Court): requests, new request and the technician board are now working quick actions; only preventive maintenance (MNT-010, Gate G) is still listed as planned.
- Tests updated to the D.2 reality: `register.spec` counts (424 / 346); `platform.test` (HQ's Al-Noor includes the online-payments add-on); `access.spec` (Shalimar's maintenance addresses open the working screens instead of the planned page); test personas `alnoor_maintenance` and `alnoor_technician`.

## 10. Evidence

- Screenshots: `docs/status/gate-d2/screenshots/` — the three references on desktop in English and on a phone in Urdu, the other D.2 screens in both, and resident pages at 320 px with 200 % text.
- Videos: `docs/status/gate-d2/video/` — the three references, desktop, English.
- Specs: `tests/e2e/d2.spec.ts` (journeys, axe and reflow), `tests/evidence/gated2.evidence.spec.ts`, `packages/fixtures/src/operations/operations.api.test.ts`.
