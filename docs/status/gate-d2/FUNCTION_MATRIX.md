# Gate D.2: function matrix

The owner authorised **Gate D.2, Resident Operations / Society Maintenance** as frontend-only work (Issue #7; branch `feature/gate-d2-resident-ops` from `integration/d1-s1` at `5b93544`; V3.2 documents at `0e57604`). This matrix lists each requirement of the authorisation, where it is built and what checks it.

**Paths and file names:**
- Paths are relative to the repository root.
- Office pages: `apps/backoffice/src/pages/society/operations/`. Resident pages: `apps/customer-web/src/pages/operations/`. Mock API: `packages/fixtures/src/operations/`. Contracts: `packages/contracts/src/operations.ts`.
- Screenshots: `docs/status/gate-d2/screenshots/<name>-<width>-<en|ur>.png` (`-320-200pct` = 320 px with 200 % text). Videos: `docs/status/gate-d2/video/*.webm`.
- Tests:
  - `ops.api` is `packages/fixtures/src/operations/operations.api.test.ts` (12 tests through the fail-closed mock server);
  - `d2.spec` is `tests/e2e/d2.spec.ts` (13 tests on production builds, axe inside);
  - `privacy` is `packages/fixtures/src/operations/privacy.test.ts` (20 tests on `privacy-differencing.vectors.json`);
  - `security`, `register`, `tabs` are `packages/fixtures/src/security.test.ts`, `tests/e2e/register.spec.ts`, `packages/ui/src/layout/Tabs.test.tsx`.

## 1. Baseline and register

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 1.1 | Build on `integration/d1-s1` at `5b93544` in an isolated worktree; never touch the preview, `main` or the integration worktree | worktree `D:/laragon2/www/propertyos-d2`, branch `feature/gate-d2-resident-ops` | `git log`; nothing deployed |
| 1.2 | Reconcile the built/partial baseline; apply only the D.2 delta rows (no 26 net-new canonical screens) | `docs/ui/screen-register.csv`: 2 new, 7 states, 8 changed rows | `register` (424 rows, 346 distinct); `npm run register:sync` |
| 1.3 | 26 distinct screens and 7 states | report §2.2 | `d2.spec` axe lists; screenshots `o*`, `p*`, `r*`, `v*`, `n*` |
| 1.4 | Statuses marked honestly | 26 BUILT; PORTAL-043 PARTIAL (no attachments) | independent read-only audit, gaps fixed (report §5) |

## 2. Reference 1: repair to resident confirmation

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 2.1 | A-101 submits a repair: category, location (room), urgency, fictional images with descriptions, contact preference | `RepairsPage.tsx` (new-repair sheet), `rkit.tsx` `PhotoField` | `d2.spec` ref 1; `r02-report-a-repair` |
| 2.2 | Site / flat / party-link validation (Rule R) | `site.ts` `residentOps`, `requests-handlers.ts` `canRaiseFor` | `ops.api` ref 1 and refusals; `d2.spec` (A-102 cannot open A-101's repair) |
| 2.3 | Triage, priority and SLA | `RequestWorkspace.tsx` triage drawer; `sla.ts` | `d2.spec`; `r05`, `r06`, `r15-sla-dashboard` |
| 2.4 | Assignment to a technician (suggested by trade and load); technicians see only their own jobs | assign drawer; `MaintenancePages.tsx` technician board | `ops.api`; `d2.spec` (technician board, another technician's request not found); `r07`, `r08` |
| 2.5 | Progress, comments and status updates | Request 360 Discussion (public, internal and, while a job is assigned, *Office and assigned technician*) and Timeline; resident comments. A technician or contractor sees only comments shared with the assignee and their own (ruling, Issue #8) | `ops.api` (incl. *a technician sees only the comments shared with the assignee*) |
| 2.6 | Evidence of completion | complete drawer: note and described photo | `d2.spec`; `r09-completion-evidence` |
| 2.7 | Resident confirms or reopens | `RepairsPage.tsx` *Is it fixed?* (rating; "Not fixed" → same technician) | `d2.spec`; `ops.api`; `r13`, `r14` |
| 2.8 | Manager SLA and related Flat 360 | SLA dashboard; Flat 360 → Services | `d2.spec`; `o08-flat-360-services` |
| 2.9 | Distinguish an individual repair from a community issue | Repairs vs Community issues (resident); kind filter (office) | `d2.spec` axe on both; `p02-community-issues` |
| 2.10 | Phone EN/UR with contextual navigation | bottom bar Requests and Notices; breadcrumbs; Home *Needs your attention* | `r*-390-ur` screenshots; `d2.spec` axe at 390 px |

## 3. Reference 2: visitors, the gate and vehicles

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 3.1 | Resident invites a guest with an access window, vehicle and expiry | `ServicesHub.tsx` invite sheet | `d2.spec` ref 2; `v02`, `v03` |
| 3.2 | Tenant, site and pass restrictions verified | `visitors-handlers.ts` (code, window, single/multiple entry, cancelled) | `ops.api`; `d2.spec` (wrong code, used code refused) |
| 3.3 | Management gate queue (VIS-007), browser-simulated refresh | `VisitorPages.tsx` `LiveQueue` ("refreshes every 15 s (simulated)") | `d2.spec` walk-in; `v08-live-queue-waiting` |
| 3.4 | Guard check-in / check-out; expired, duplicate, refused and denied states | Gate check-in, Inside now, Answers from residents | `d2.spec`; `ops.api`; `v05`, `v06` |
| 3.5 | Occupant approval only when required; only occupants are asked | walk-in → occupants of the flat; resident prompt and Visitors tab | `ops.api` (occupants only); `d2.spec`; `v09-occupant-prompt-390` |
| 3.6 | Audit | pass history; visit history | `ops.api`; `v11-visit-history` |
| 3.7 | PARK-005 / PARK-007 vehicle approvals: plate uniqueness, owner linkage | `VehiclesOffice.tsx` checks drawer; `vehicles-handlers.ts` | `ops.api`; `d2.spec` vehicles; `o06`, `o11-vehicle-approval` |
| 3.8 | The guard sees no money | walk-in flat picker from the gate's own endpoint (codes only) | `d2.spec` walk-in as the guard |

## 4. Reference 3: official notices

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 4.1 | Compose with an audience preview (RES-005 or NOT-003); publish needs `communications` + `notices.publish` | `NoticesOffice.tsx` compose and send-message; `notices-handlers.ts` | `d2.spec` ref 3; `ops.api`; `n02-compose-with-audience` |
| 4.2 | Recipient notification (PORTAL-042) deep-linked to PORTAL-023/043 | `GatePrompt.tsx` bell; `NoticesPages.tsx` | `d2.spec`; `n03` |
| 4.3 | Acknowledgement and read counts | notice stats and *Flats that have not acknowledged* | `d2.spec`; `n06-delivery-and-acknowledgement` |
| 4.4 | No `community_hub` or `community_chat` | notices need `resident_portal` only | `ops.api` |
| 4.5 | Edit creates a version; withdraw keeps history and hides content | versions; tombstone with withdrawal date | `ops.api` |
| 4.6 | No leak across block, site, legal entity or moved-out audience | audience re-checked on every read; "not available to you" | `ops.api`; `d2.spec` (move-out) |
| 4.7 | Scheduling | scheduled notices publish on the next read after their time (simulated scheduler, labelled so in the composer and the notice detail) | `ops.api` (scheduling refusals); report §6 item 5 |

## 5. Community issues (D-28, D-47)

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 5.1 | One request model, `kind = repair \| community_issue` | `operations.ts` `RequestKind`; one list and one Request 360 | `ops.api` |
| 5.2 | MNT-012 board, MNT-013 merge, PORTAL-034, PORTAL-035 raise / affirm / withdraw | `IssuesBoard.tsx` (Open, In progress, Resolved, Merged, Moderation); merge drawer; `IssuesPage.tsx` | `ops.api`; `d2.spec` axe; `o02`, `p02` |
| 5.3 | Counts only at ≥ 3 reports from an audience ≥ 5; thresholds only raised by the tenant | `privacy.ts` | `privacy` vectors (`privacy-differencing.vectors.json`) |
| 5.4 | No differencing leaks: site − block, adjacent blocks, successive snapshots, toggles | fixed groupings; site − block and adjacent-block remainders; scheduled snapshots that ignore small changes | `privacy` vectors; `ops.api` (toggling changes nothing visible) |
| 5.5 | Never expose other residents' identities, contacts or debts | resident views carry counts only; "A resident" in comments | `ops.api`; screenshots `p02` |

## 6. Security and access invariants

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 6.1 | Handlers fail closed; no denied request reads or mutates state | every D.2 handler declares module, permission and suspension class | `security` (every endpoint: 401, 403, unlicensed) |
| 6.2 | Rule R on resident screens; staff by module permission and scope | `site.ts`; route guards in `apps/backoffice/src/prototype/routes.tsx` | `ops.api`; `d2.spec` |
| 6.3 | Nav, global search, related records, deep links and every read/write guarded | `tenantWorkspace.ts`; `operationsSearch` / `operationsRecordAccess` | `register` (every address); `ops.api` |
| 6.4 | Shalimar (maintenance only): no CRM or developer leaks; future grants respected | Shalimar staff side; "not in your plan yet" before 1 November | `ops.api` |
| 6.5 | Cedar Hills (suspended): no new operational actions | all D.2 areas paused (Gate B rule, kept by the owner ruling in Issue #8) | `security`; `tenantWorkspace.test.ts` |
| 6.6 | Moves, transfers and payer changes never auto-invite or rewrite liabilities | move-out drawer: *still pays* warning, invitations untouched | `ops.api`; `d2.spec` move-out |
| 6.7 | Audiences: owner vs occupant vs payer; no contact or last-login disclosure | audience roles; resident views | `ops.api` |
| 6.8 | Fictional data; simulated uploads, channels and gateway; never Paid without C.2 evidence | sandbox gateway: *accepted, waiting for the bank* | `d2.spec` gateway (A-101 still owes 5,200.00) |
| 6.9 | Amenities booked by the people who live in the flat; owners only where the amenity allows (ruling, Issue #8) | `Amenity.bookers`; `/portal/bookings`; PORTAL-022 shows *Only the people who live in the flat can book this* | `ops.api` (Rabia: hall yes, gym no for A-202; Junaid: gym yes) |
| 6.10 | Office acting for a technician without a sign-in is recorded as the office colleague | work-order history | `ops.api` |

## 7. UI and acceptance

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 7.1 | Limestone & Evergreen; connected tabs, records, context trails, quick actions, instant feedback, no empty placeholders | all D.2 pages; empty states with next steps | screenshots |
| 7.2 | EN/UR RTL at desktop, tablet, 390 and 320 px; 100–200 % text | all D.2 pages | `d2.spec`: axe EN/UR at 1440, 768 and 390 px, no sideways scroll; resident pages at 320 px with 200 % text. `d2-closure.spec` (Issue #8): Home, Notices (list and detail), Visitors, Repairs and Issues at 320 × 700 with 100, 150 and 200 % text in both languages, element by element (nothing clipped, off screen, spilling out of its control or broken mid-word; text size as chosen); a seven-figure amount probe; Firefox and WebKit smoke at 320 px / 200 % Urdu |
| 7.3 | High contrast, dark mode, reduced motion | shared D.1 display preferences | `t01`–`t05` screenshots; reduced motion: shared D.1 behaviour, not re-tested in D.2 |
| 7.4 | Fixed bars never hide actions | phone bottom bars; drawers with footers; toasts | `d2-closure.spec`: keyboard walks at 320 × 700 / 200 % (both languages) checked with `elementFromPoint` against the header and the bar, last content above the bar, soft keyboard at 320 × 360; toasts never cover an open drawer: earlier ones wait, ones from inside it are capped and stay above its action bar (phone and desktop; `Toast.test.tsx`); captures `c01`–`c10` |
| 7.5 | Resident app purpose-first | Home: bill, then *Needs your attention*; bottom bar Home · Bills · Pay · Requests · Notices | `r11`, `z01` |
| 7.6 | Negative vectors: revoked grants, other site or entity, moved out, withdrawn notice, outside-audience link, expired pass, duplicate plate, merging, differencing | `ops.api` refusals | `ops.api`; `d2.spec` |
| 7.7 | Preserve D.1 accessibility, S.1/C.1/C.2 financial invariants and every regression suite | | full regression in `test-results.md` |
| 7.8 | Deliverables | this folder | — |
