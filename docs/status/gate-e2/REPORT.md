# Gate E.2: Projects and inventory, Agent C report (Wave 1, provisional)

> The coordinator wrote this file from Agent C's hand-off, because the harness does not let subagents write report files. The content is Agent C's. Full results are in [test-results.md](test-results.md); see also [CHECKPOINT.md](CHECKPOINT.md) and [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).

## 1. Agent and assignment

Agent C built Gate E.2, projects and inventory: seven screens.

- PRJ-001, PRJ-002, PRJ-003
- INV-001, INV-002, INV-008, INV-010

Worktree: `D:\laragon2\www\propertyos-e2`, built on `373d0cf`. Agent A's branch was not merged or cherry-picked.

## 2. Branch and SHAs

- Branch: `feature/gate-e2-projects-inventory`, pushed without force.
- Agent's final commit: `4541ad5`, 5 commits on top of `373d0cf`.
- The commit that adds this report sits on top of `4541ad5` and contains no code.

## 3. Screens

- **Status:** BUILT 0, PARTIAL 7, PLANNED 0.
- **Register:** Agent C moved its own rows from PLANNED to PARTIAL; INV-002 was already PARTIAL. `register:sync` now gives 449 rows and 362 distinct screens: 139 BUILT, 49 PARTIAL, 174 PLANNED (before: 139 / 43 / 180).
- **`register.spec.ts`:** the constants did not change, because the spec counts rows, not statuses.

What each screen still needs to become BUILT once E.0 is accepted and integrated:

| Screens | Still needed |
|---|---|
| PRJ-001, PRJ-002, INV-001 | Swap in E.0's scope and state helpers. E.0 must also store the three unit dimensions (E-10). PRJ-002's other 10 tabs stay "Planned" until their own slices. |
| INV-002, INV-008 (holds) | Swap in E.0's `crm-holds.ts`. Until E.4 and E.5 exist, reserved and booked units come only from the demo seed. |
| PRJ-003 | Decisions E-06 and E-07, plus E.0's approval and idempotency helpers. |
| INV-010 | E.5 bookings ("allocate only to an active booking"). Until then, booked units from the demo seed stand in. |

## 4. Features

### PRJ-001: Projects list

- Search, filters by kind and city, and sorting.
- KPIs are computed from the units at request time. Each KPI opens the filtered matrix or availability.
- A figure the reader may not see says why ("not in your plan for this site", "your role doesn't show these figures") instead of showing zero.

### PRJ-002: Project 360

- All 15 register tabs are present. Overview, Units, Leads, Documents and Activity are live.
- Documents shows a "planned (E.13)" state, because the fixtures contain no project documents.
- The other tabs say "Planned · E.5…E.12", name decision E-24, or say "Not in your plan" for a site without the licence.

### PRJ-003: Project setup

- A four-step wizard: basics, site and legal entity, structure, review.
- Checks run in the browser and again on the server. Each step saves a draft.
- The maker submits; a different person approves it, or returns it with a reason.
- Only the maker can edit. Submitted records are locked.
- Activating a project creates no units.

### INV-001: Unit matrix

- A grid by tower, floor and position, or plots by phase.
- Each cell states its status in words plus a pattern (held: hatched, reserved: dotted), never by colour alone.
- The grid is one keyboard stop. Arrow keys move between units (RTL-aware), Home/End and Ctrl+Home/End jump to the ends, Enter opens a unit.
- Filters live in the URL. Dashboard links (`?record=twr_…`, `blk_…`, a unit type) open the matrix pre-filtered.
- A list alternative exists; at 320 px it is the only view.

### INV-002: Unit quick view

- Its own drawer. The CRM's `UnitQuickView.tsx` is untouched.
- Shows the three status dimensions, the hold (as this reader may see it), storage, and the unit's history.
- A user can hold a unit for an open lead of the project: 48 h, one key per logical create. Only the person who placed a hold can release it.
- The register address `?record=<unit>` opens the drawer over its project's matrix.

### INV-008: Live availability

- Totals, plus rows per tower or phase. Each count links to the filtered matrix.
- Holds in force show a countdown. Expired holds are listed as history.
- States that come only from the seed are labelled.
- The page refreshes every 30 s and after every change.

### INV-010: Storage inventory

- 22 Larkspur storage records and 5 Crescent Bay Towers records. Plaza's records are never reachable. None starts allocated.
- Storage can be allocated to sold stock of the same project, and released with a reason. History is kept.

### Server rules (in the order of plan §4.2)

- Out-of-scope ids answer exactly like unknown ids (404).
- Idempotency keys are bound to operation, person, target and input fingerprint. Any other reuse of a key gets 409.
- Activity and holds are filtered per reader: lead references appear only for people who may see that lead.
- Every refusal leaves the stored state byte-identical.

### Hold rule

- `developer/inventory/rules.ts` mirrors Agent A's `crm-holds.ts` at `3bc31cb`, read-only, with the same names and signatures.
- One clock reading per request. Expired holds count as not held. Only the person who placed a hold can release it. Legacy holds that have no initiator cannot be released by anyone.
- Holds go into the same store the CRM uses, so a unit can never be held twice.

### Translations

EN and UR, in a new `projects` namespace.

## 5. Unit and API tests (Vitest)

- **E.2 tests:** 29 API tests and 5 vector tests. `inventory.vectors.json` covers dimension round trips, buckets, hold expiry and release, seed totals, and parity with the dashboard's figures.
- **`security.test.ts`:** 26 tests, passing with the 18 new endpoints.
- **Full suite in the lock window:** 1,715 of 1,716.
  - The one failure is a 5,000 ms timeout in `rentals.integration.test.ts`, a test that reads every source file, while the machine was shared.
  - Run alone right after resuming under load, it timed out once more, then passed 4/4.
  - It is not an assertion failure, and the test was not edited.
- **Typecheck and full lint:** clean (ESLint, logical CSS, i18n parity).

## 6. End-to-end tests (complete run, lock held, on AC, 18:51–19:43Z)

- **Chromium: 519 of 520 passed, 45.2 min.** The run covered every e2e spec plus the E.2 evidence spec, with 3 workers and retries off.
  - The one failure is the known `identity.spec.ts:327` intermittent. Run alone with `--repeat-each=10`, it passed 10/10.
- **Agent C's specs:** e2e 19/19, evidence 6/6, register-coverage chunks 16/16, `security.spec` 8/8.
- **Firefox + WebKit smoke: 76/76, 4.7 min,** including Agent C's own smoke spec (6/6).

## 7. Permission and security tests

- **Site scope:** a Heights-only person never sees Gardens in any list, total, count, Project 360, matrix, unit or storage view.
- **Plan scope:** Crescent Bay Plaza says "not in plan", and the unassigned import is unreachable.
- **Hidden ids:** hidden and unknown ids give identical 404s. This covers projects, towers, units, storage, setup records, and leads or units named in a request body.
- **Holds:**
  - A unit that is already held cannot be held again.
  - Only the person who placed a hold can release it. Release attempts on other people's, expired, unknown and legacy holds are all refused alike.
  - Seed holds can never be released.
  - Expiry is tested with a faked clock: still held at 07:59:59, available at 08:00:00, history kept, and the unit can be held again.
- **Storage:**
  - No double allocation.
  - Another project's unit is refused (`cross_project_forbidden`).
  - Only sold units qualify.
  - Storage that is out of service is refused.
- **Maker and checker:** maker ≠ checker is checked by person, even when one person holds both permissions. A second preparer cannot edit or submit someone else's draft.
- **Revocation:** revoking a permission, the view permission or the project scope mid-session takes effect on the next request.
- **Validation:** every field is validated before anything is stored. Pressing a button twice creates one record.
- **In the browser:** narrowing the manager's sites hides Gardens at once, and finance is refused.

## 8. Mutation checks

- **20/20 caught.** Every file was restored byte-identical (SHA-checked).
- The first pass ran 20 deliberate breaks and caught 18. The two survivors were:
  - drafts visible to any projects reader;
  - any `project.manage` holder able to edit a draft.
- Tests were added for both, and the re-run caught all 20.

## 9. Accessibility

- **axe:** 1,639 scans in the complete run with **0 violations**. 33 of them are E.2 scans: EN and UR at 1440 and 390, plus dark mode with high contrast.
- **320 px at 200 % text, EN and UR:** no sideways scroll and no clipped or broken words. Reference numbers and "N-bed" labels stay on one line.
- **Keyboard:** a keyboard walk on a phone finds no control hidden under the header or bottom bar. The grid has keyboard navigation and visible focus.
- **Not done:** NVDA, VoiceOver and real devices still need a person.

## 10. Screenshots

There are 50 PNGs in `screenshots/`. Every width matches its file name, and Agent C reviewed the key ones. They cover:

- 1440 px, EN and UR: 13 each;
- 390 px (phone): 3 each;
- 320 px at 200 % text (`…-200pct-320-en|ur`): 6 each;
- the Heights-only and no-access views;
- dark mode with high contrast, in Urdu.

## 11. Open dependencies

### Owner decisions

| Decision | What this build does provisionally |
|---|---|
| E-06 / E-07 | Adds permissions `project.view`, `project.manage`, `project.approve` and `storage.manage`, and two fictional personas: `lk_project_officer` (Hina Baig) and `lk_projects_director` (Kashan Lodhi). No existing role gained anything. Projects-area reads accept `project.view` or `unit.view` (the Projects menu's permission today); the owner needs to confirm that. |
| E-10 | The three unit dimensions are derived from the seed status. |
| E-11 | Holds stay at 48 h, with no extension or override. |
| E-37 | The legal entity is read-only. |
| E-24 | Gates the Residents and Maintenance tabs. |

### Other slices

- E.4 and E.5: reservation and booking records.
- E.13: project documents.

### E.0 helpers to swap in

| Agent C's file | E.0 file |
|---|---|
| `developer/inventory/rules.ts` | `crm-holds.ts` |
| `scope.ts` | `developer/scope.ts` |
| `idempotency.ts` | `idempotency.ts` |
| `state.ts` | `developer/state.ts` |

At `373d0cf`, the old CRM release endpoint still lets anyone with `unit.hold` release any hold (Issue #23). E.0 fixes that, and the E.2 screens never call that endpoint.

### Shared-file touches

All are small, additive and marked "Gate E.2 (provisional)".

- `permissions.ts`, `access.ts` (permission-to-module map), `persona.ts`, `contracts/index.ts`
- `role-templates.ts`: two new Larkspur roles. `role-templates.test.ts`: the Larkspur role count changed from 6 to 8.
- `people.ts`, `fixtures/handlers.ts` (handler registration), `i18n/resources.ts`
- `routes.tsx`: one import and one spread, plus a new `prototype/routes.e2.tsx`. Pages may not import the router, so the area's route module has to live there.
- `screen-register.csv` and `register.generated.ts`: only E.2's seven rows.
- `tests/support/fixtures.ts`: `PersonaId`.
- `security.spec.ts`: one assertion. With Towers selected, Crescent Bay's unit matrix now opens the built screen instead of the planned page.

Not touched: `crm-handlers.ts`, `demo-store.ts`, `UnitQuickView.tsx`, `crm.ts`, `crm-data.ts`, `crm.json`, navigation, quick create, edition gating.

## 12. Integration readiness

Ready to integrate after E.0 is accepted.

- The helpers to swap are listed in section 11. The hold rule already matches `3bc31cb` name for name.
- Expect small conflicts in the shared files above: personas and roles, the permission list, the handler list, and i18n resources.
- After the swap, re-run:
  - `inventory.api.test.ts` and `inventory.vectors.test.ts` (the vectors pin the hold rule);
  - the full suites;
  - the mutation script (`test-results-e2/scratch/mutations.cjs`).

At hand-off, the lock was released, previews were stopped and the working tree was clean. **STOPPED for review.**
