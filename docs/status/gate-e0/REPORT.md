# Gate E.0: foundation validation, Agent A report (Wave 1)

> Written by the coordinator from Agent A's hand-off, because the harness does not let subagents write report files. The content is Agent A's. The final results are also in [CHECKPOINT.md](CHECKPOINT.md).

GPT's #22/#23 code is validated and repaired, and the bounded E.0 foundation is built. All checks are green:

- complete Chromium run 551/551;
- Firefox + WebKit smoke 70/70;
- Vitest 1,751/1,751;
- mutations 51/51.

The branch is pushed and has **STOPPED for GPT review**. Agents B–E must not merge it until GPT accepts it. GPT's `docs/status/gate-e0-crm-scope/REPORT.md` stays as merged.

## 1. Agent and assignment

Agent A, E.0 foundation validation. Worktree `D:\laragon2\www\propertyos-e0`, ports 6973–6975.

- **Part 1:** integrate GPT's `23cc163` (Issues #22/#23) on `373d0cf`, then validate and repair it.
- **Part 2:** the bounded E.0 foundation (plan §6 E.0, deliverables 1–6).

## 2. Branch and SHAs

Branch `feature/gate-e0-foundation-validation`, pushed without force.

| Commit | What |
|---|---|
| `d820f68` | `--no-ff` merge of GPT's `23cc163` into `373d0cf` |
| `3bc31cb` | #22/#23 validation and repair |
| `7c6e569` | E.0 foundation |
| `5072a74` | Checkpoint |
| `d04605e` | Quick view at 320 px / 200 %, plus evidence |
| `e9724e8` | Final evidence PNGs and results; the agent's final SHA |

The commit that adds this report sits on top of `e9724e8` and contains no code.

## 3. Screens

E.0 adds no screens. The register is unchanged: 449 rows, 362 distinct screens (139 BUILT, 43 PARTIAL, 180 PLANNED).

## 4. Features completed

### Part 1: what was wrong in GPT's code, and the repairs

GPT's code type-checked and its 8 tests passed. The review found five problems, and all are fixed. `crm-gate-e0-validation.test.ts` contains 7 tests named `repair: …`. All 7 fail on `d820f68` (that run: 7 failed, 9 passed), and the whole file passes after the repairs (16/16).

| # | Problem in GPT's code | Repair |
|---|---|---|
| 1 | **Lead id oracle.** `findLead` looked the lead up before checking `lead.view`. A holder of `unit.hold` without `lead.view` (via `POST /units/:id/hold` or `/visits`) got 403 for a real lead and 404 for an invented one. | The permission is checked first, so a hidden lead and an unknown lead get the same 404. |
| 2 | **Unit id oracle.** For Bilal, a Gardens unit answered `404 out_of_scope` while an invented id answered `404 not_found`, on unit 360, hold and release. The unit permission was also checked after the lookup. | `requestedUnit` checks the permission first, then answers an out-of-scope id exactly like an invented one. CP2's licensing outcomes for the organisation's own unlicensed sites (`site_not_licensed`, `site_context_missing`, asserted by `security.spec`) are unchanged. Whether they should also become 404 is decision E-28. |
| 3 | **Expired holds still shown.** `GET /units` read raw holds, so an expired hold still showed as `held`. Each entry also read `Date.now()` separately. | New `crm-holds.ts` provides one clock (`holdClock`) and one active-hold projection (`activeHolds`). Every hold read and write takes one clock reading per request. Reads never delete a stored hold. |
| 4 | **The UI offered Release to everyone.** The server correctly refused anyone but the initiator, but the drawer still showed the button. Hold views also named the held-for lead to readers who cannot see that lead. | `UnitHoldView` carries `releasable` only for the initiator, and `leadRef` only for readers allowed to see that lead. The quick view offers Release only when `releasable` is set. A hold must be for a lead of the unit's own project; otherwise the answer is 422 and names nothing. |
| 5 | **Tests depended on the real clock.** | Tests use `vi.setSystemTime` at the 48 h boundary (−1 ms and 0 ms). GPT's hold tests now run on a fixed fake clock, with an exact principal assertion. |

Issue #23's limits are kept: a 48 h illustrative duration, no override permission and no admin override (E-11).

### Part 2: the foundation API for agents B–E

**Contracts (`packages/contracts/src/developer.ts`)**

- Types: `DeveloperState`, `DevLegalEntity`, `DevCostCentre`, `DevNumberingSeries`, `DevCollectionAccount` (masked number only) and `DevApprovalPolicyVersion` (`threshold: null`).
- `DEVELOPER_APPROVAL_SUBJECTS`, kept separate from S.1's subjects.
- `DEV_EDITIONS` and `servesEdition(access, 'DEV' | 'DEV+COMM' | 'ALL')`.

**Developer state (`packages/fixtures/src/developer/state.ts`)**

- `developerState(ctx)` only reads and never stores. It returns null for organisations that are not developers.
- `developerStateForWrite(ctx)` returns a stored section named `developer`. It re-seeds on a version mismatch, and `/demo/reset` clears it.
- Also `seedDeveloperState` and `formatDeveloperRef` (for example `LSP-JV-202610-0001`).
- Seeded read-only from existing ids (E-37):
  - entities `le_larkspur` (LSP) and `le_crescent` (CBD);
  - cost centres `cc_lsp_hq`, `cc_lsp_sales`, `cc_heights`, `cc_gardens`, plus Crescent's;
  - one masked, verified collection account per entity;
  - six illustrative policies per entity.
- Each area keeps its own records in a section named `developer.<area>`.

**Scope helpers (`developer/scope.ts`)**

These follow HR's split between "visible" and "governs". Each takes `need = { module, permission? }`.

- `projectVisible(ctx, id, need)` respects the header project filter.
- `projectGoverned(ctx, ids, need)` requires every touched project, ignores the header filter, and fails closed when given no projects.
- `entityVisible` / `entityWhole(ctx, entityId, need)`.
- `costCentreVisible(ctx, state, ccId, need)`.
- `requireProject` / `requireEntity` / `requireCostCentre` answer 404 for any out-of-scope id.
- `visibleProjectIds`, `visibleEntityIds`.

**Multi-entity fixture, test-only (`developer/multientity.fixture.ts`, E-08)**

- Adds entity `le_lsp_two_demo` (LRD) with project `prj_lsp_riverside_demo`.
- Test principals: `ACCOUNTS_TWO` (scoped to a legal entity) and `HEIGHTS_LEDGER` (Heights only).
- `multiEntityWorld()` returns `{ api, demo, data, as, snapshot }` over the real transport, using a new test-only `datasetFor` option on `MockTransport`.

**Bound idempotency (`packages/fixtures/src/idempotency.ts`)**

- `replayOf(ctx, store, { op, target, input, stillAuthorized })` and `remember(ctx, store, { op, target, input }, recordId)`.
- A key is bound to the operation, tenant, principal, target and an input fingerprint (`canonical` sorts keys).
- Any other reuse of a key always gets the same answer: 409 `idempotency_key_reused` (`errors:api.idempotencyKeyReused`).
- A replay after the caller has lost authority gets 404. A legacy id-only entry never replays.
- S.1 is not migrated (E-29); S.1 has been bound since Issue #18.

**Projection (`projection.ts`):** `projectHistory`, `projectVersions` and `wholeOnly`, generalised from payroll.

**Projection test kit (`projection.testkit.ts`):** `compareProjection({ narrow, full, hidden })` returns `{ leaks, unexercised }`. It scans object keys as well as values, and `unexercised` catches tests that check nothing.

**Holds (`crm-holds.ts`):** for E.2 and E.4.

**Mock API registration (`developer/handlers.ts`)**

`HANDLERS` already spreads `DEVELOPER_HANDLERS`. An area adds one entry to `DEVELOPER_AREA_HANDLERS`. The read-only endpoints:

| Endpoint | Permission needed |
|---|---|
| `GET /developer/legal-entities` | `project.view`, `gl.view` or `bank.view` |
| `GET /developer/cost-centres?entity=` | `gl.view` |
| `GET /developer/numbering?entity=` | `gl.view` |
| `GET /developer/collection-accounts?entity=` | `bank.view` |
| `GET /developer/approval-policies?entity=` | makers and checkers of the Wave 1 pairs |

A hidden, unknown or other-organisation entity gets the same 404.

**Routing (backoffice)**

- `prototype/dev-screen.tsx` provides `DevScreen({ page, target, edition? })`, `DevRecord({ page, target, prefix, edition? })` and `devRoute(path, element, title)`.
- `prototype/routes.developer.tsx` holds `DEVELOPER_AREAS`, the registration point for areas.
- `routes.tsx` gains one import and one `...DEVELOPER_ROUTES` before `*`. No existing block is reordered.

**How an area plugs in at Wave 1 integration**

1. Export `routes` from `pages/developer/<area>/routes.tsx` and add `{ area, routes }` to `DEVELOPER_AREAS`.
2. Export handlers from `fixtures/src/developer/<area>/handlers.ts` and add them to `DEVELOPER_AREA_HANDLERS`.
3. Replace module-local stand-ins with the scope, idempotency, projection and test-kit helpers above.
4. Use the canonical permission names below.

**Permissions (E-07), each mapped in `PERMISSION_MODULE`**

| Module | Permissions |
|---|---|
| crm | `lead.manage`, `lead.assign` |
| projects | `project.view`, `project.manage`, `project.approve` |
| inventory | `inventory.manage` |
| accounting | `gl.view`, `gl.manage`, `gl.approve`, `journal.create`, `journal.approve`, `gl.post` |
| banking | `bank.import`, `bank.import.approve` |
| core | `document.view`, `document.upload`, `document_template.manage`, `document_template.approve` |

`unit.hold.override` was not added. F-3 is now enforced: writing a lead's activity, status or follow-up requires `lead.manage`.

**New personas (fictional, Larkspur, E-06)**

| Persona | Principal | Name | Role |
|---|---|---|---|
| `lsp_sales_manager` | `usr_lsp_0004` | Hamza Rashid | sales manager |
| `lsp_project_manager` | `usr_lsp_0005` | Mehwish Kazmi | project manager |
| `lsp_accounts` | `usr_lsp_0006` | Faiza Noor | accounts officer |
| `lsp_finance_controller` | `usr_lsp_0007` | Zubair Ansari | finance controller |

Each maker–checker pair is split between two of them. Starter permission sets are unchanged.

**Navigation:** one new menu item, Accounting (`/backoffice/acc/chart-of-accounts`). Only `gl.view` holders see it. It has no `match`, so existing routing is unchanged.

**i18n (EN + UR):** role and welcome lines, `nav:items.accounting`, 18 permission labels, `errors:api.idempotencyKeyReused` and `crm:unit.heldUntil`.

**Quick view (`d04605e`):** at 320 px / 200 % the hold/release button wraps, and the lead reference in the badge stays whole and bidi-isolated.

## 5. Unit and API results

- Typecheck: 0 errors. Lint: 0 errors (ESLint, logical CSS, i18n parity on 10,942 keys × 2 locales). The production build passes.
- **Vitest 1,751/1,751** (69 files, 81 s). That is the base's 1,682 plus 69 new tests: GPT 8, validation 16, foundation 21, idempotency 8, projection 8, access 8.
- Earlier full runs under heavy load (on battery, with other agents' runs) failed only with `Test timed out in 5000ms`, all in suites E.0 does not touch. Each of those tests passes when run alone.
- One constant changed, with reason: `role-templates.test.ts` now expects 10 Larkspur roles instead of 6, because of the four E-06 roles.

## 6. End-to-end results

Conditions: on AC power, lock held 20:36–21:27Z, 3 workers, retries off, previews checked on both loopbacks.

- **Complete Chromium: 551 passed, 0 failed, 45.8 min.** That is the integration's 538 tests plus `e0-foundation.spec.ts` (7) and the `gatee0` evidence spec (6).
- 32 skipped: all of `gateb2` and `stage15r`, historical specs marked `test.skip(true)`.
- PNGs that the run rewrote in other gates' folders were restored.
- **Firefox + WebKit smoke: 70/70** (35 + 35), 4.2 min.
- The known intermittents `identity.spec.ts:327` and WebKit `s2a.smoke.spec.ts:52` both passed.
- Before the complete run, targeted one-worker Chromium runs passed: Part 1 crm/security/permissions/access/portal 42/42, plus the E.0 e2e and evidence specs.

## 7. Permission and security tests

**`crm-gate-e0-validation.test.ts`**

- Lead and unit ids stay private on every route, with refusals compared byte for byte.
- The permission is checked before the id.
- The header filter narrows results.
- The 48 h expiry boundary is checked on the fake clock across unit 360, the list, matching, hold and release.
- Holds of a peer, unknown holds, expired holds and legacy holds all get the same 404.
- The `releasable` and `leadRef` projection.
- Holds across projects are refused.
- "State unchanged" is checked on the whole store.

**`developer/foundation.test.ts`**

- No permission is granted silently.
- Maker–checker pairs are split, and the new principals are unique.
- F-3 refusals are identical for known and invented ids.
- Reading the developer state never stores it.
- The scope helpers are tested on the multi-entity fixture.
- Cross-entity 404s are identical.
- Narrow and full views are compared with the test kit.

**Other tests**

- `idempotency.test.ts` and `projection.test.ts`.
- `gate-e-access.test.ts` with `gate-e-access.vectors.json`: every tenant permission is mapped to a module, and module licensing applies to each new permission.
- `tests/e2e/e0-foundation.spec.ts`.

## 8. Mutation checks

**Part 1: 19/19 caught. Part 2: 32/32 caught.** There are no survivors, and every file was restored byte for byte (SHA-256).

- **Part 1 covers:**
  - lead and unit scope, and the order of checks;
  - the hold boundary and expiry everywhere;
  - one clock;
  - recording the initiator;
  - holds across projects;
  - release rules;
  - legacy holds;
  - the hold-view projection.
- **Part 2 covers:**
  - every idempotency binding, plus the authority re-check, legacy entries, canonical form and key precedence;
  - every projection rule and the test kit;
  - the scope helpers;
  - entity filtering in the endpoints;
  - read-only developer state;
  - F-3, role pairs and a silent grant;
  - an unmapped permission and `servesEdition`.

## 9. Accessibility

- axe: **1,607 scans, 0 violations** in the complete run: the base's 1,606 plus the quick-view scan.
- The evidence covers EN and UR (RTL) at 1440 px, 320 px at 200 % text (EN and UR), and dark mode.
- The layout check covers the hold badge and the action E.0 changed.

## 10. Screenshots

There are six, in `screenshots/`. Agent A looked at each one, and every width matches its file name.

- `e0-q01-colleague-hold-1440-en.png`, `e0-q01-colleague-hold-1440-ur.png`
- `e0-q02-colleague-hold-200pct-320-en.png`, `e0-q02-colleague-hold-200pct-320-ur.png`
- `e0-q03-colleague-hold-dark-1440-en.png`
- `e0-n01-accounts-officer-menu-1440-en.png`

The Urdu 320 px shot shows an older defect in INV-002, on lines E.0 did not change. The two amount strips overflow and cause 111 px of sideways scroll, and the title breaks inside "LH-A-0102". It has been reported to E.2, which owns that screen.

## 11. Open dependencies

**Decisions for the owner.** None is approved; each currently takes the conservative default.

| # | Decision |
|---|---|
| D-E0-01 (F-3) | `lead.manage` is granted to Larkspur administration (Nadia), Larkspur sales (Bilal) and Crescent administration (Zain), as a change to their own organisations' roles. What they can do is unchanged. Shalimar is untouched. |
| D-E0-02 | The 18 permission names above. |
| D-E0-03 | The four new people, all under Larkspur's own roles. Nadia does **not** hold `project.view`, `gl.view` or `document.view`. `register.spec` opens every address as Nadia, so once these screens are adopted it will need either a grant or a spec change. The finance controller holds `unit.view` because the Projects route gate is unchanged. Opening it to `project.view` changed the reason given for an existing outcome, so that change was reverted. |
| D-E0-04 (E-28) | An out-of-scope unit id now gets `not_found`. CP2's licensing outcomes are kept. |
| D-E0-05 (E-11) | A hold must be for a lead of its own project. Extensions, override, idempotency and concurrency are left to E.4. |
| D-E0-06 (E-37) | The new read endpoints are open to holders of existing permissions. Nadia and Farah can therefore read the masked Larkspur collection account and the entity list through `bank.view`. |
| D-E0-07 (E-27) | Developer approval subjects are kept separate. APR-001…005 are not opened to developers yet. |
| D-E0-08 (E-08) | The second legal entity exists only in tests. |
| D-E0-09 | The Accounting menu item has no `match` until it is decided who else holds `gl.view`. |

**Deferred:**

- finance core adapter (E-03);
- fixture truthfulness (E-04);
- S.1 idempotency migration (E-29);
- approvals (APR) for all editions;
- live quick-create entries;
- E-10 unit dimensions (E.2);
- each area's own route module and i18n namespaces.

**Existing behaviour noted, not changed:** the home dashboard's project showcase, including sales figures, is gated by licence and scope, not by a permission. Farah and the new accounts officer, for example, both see it.

**Shared-file touches to reconcile at integration:**

| File | Touch |
|---|---|
| `contracts/src/permissions.ts` | delimited block |
| `contracts/src/access.ts` | delimited block |
| `contracts/src/persona.ts` | four ids |
| `contracts/src/crm.ts` | `UnitHoldView` |
| `contracts/src/index.ts` | export of `developer.ts` |
| `fixtures/src/role-templates.ts` | role additions |
| `fixtures/src/people.ts` | four personas |
| `fixtures/src/handlers.ts` | unit list projection, `DEVELOPER_HANDLERS` |
| `fixtures/src/crm-handlers.ts`, `fixtures/src/crm-data.ts` | Part 1 repairs |
| `fixtures/src/demo-store.ts` | `peekSection` |
| `fixtures/src/mock-transport.ts` | test-only `datasetFor` |
| `ui/src/workspace/tenantWorkspace.ts` | Accounting menu item |
| `routes.tsx` | one import, one spread |
| `UnitQuickView.tsx` (E.2's screen) | Release condition, button wrap, badge |
| i18n (EN + UR) | `common`, `nav`, `workspace`, `errors`, `crm` |
| `role-templates.test.ts` | one constant |

## 12. Integration readiness

Ready for GPT review. Once GPT accepts it, agents B–E move their provisional helpers and permissions onto this API using the plug-in steps in section 4.

At hand-off, the lock was released, previews were stopped, ports 6973–6975 had no listeners and the working tree was clean. **STOPPED for GPT review.**
