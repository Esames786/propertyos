# Gate E.0 — checkpoint (Agent A)

Worktree `D:\laragon2\www\propertyos-e0`, branch `feature/gate-e0-foundation-validation`, base `373d0cf`. Ports 6973–6975 (offset 1800). Test output `test-results-e0/` (git-ignored).

## Done
1. **Merged GPT's branch** `23cc163` (Issues #22/#23) with `--no-ff` → `d820f68`.
2. **Part 1 — validation and repair of #22/#23** (milestone commit after this file):
   - `packages/fixtures/src/crm-holds.ts`: one hold clock (`holdClock`), one active-hold projection (`activeHolds`/`holdActive`), `holdUntil`, `releasableBy` (initiator only; a legacy hold without an initiator is released by nobody).
   - `crm-handlers.ts`: lead permission checked before any id (`findLead`); unit permission checked before any id and an out-of-scope unit answers exactly like an invented one (`requestedUnit`); hold views projected per reader (`holdViews`: lead ref only for readers who may see the lead, `releasable` only for the initiator); a hold must be for a lead of the unit's own project; hold/release on one clock reading.
   - `handlers.ts` `/units` list: same active-hold projection.
   - `crm.ts` `UnitHoldView` (`leadRef?`, `releasable?`); `UnitQuickView.tsx` offers Release only to the initiator; `crm:unit.heldUntil` (EN/UR).
   - Tests: `crm-gate-e0-validation.test.ts` (16; the 7 named "repair" fail on `d820f68`, see `test-results-e0/repair-tests-on-unfixed.txt`); GPT's `crm-gate-e0-holds.test.ts` moved to a fixed fake clock and its principal assertion made exact.
   - Mutation checks: 19/19 caught (`test-results-e0/mutations-part1.log`).
   - Checks: typecheck 0, lint 0 (i18n parity), Vitest 1,706/1,706 (65 files); targeted Chromium (1 worker) crm/security/permissions/access/portal 42/42.

3. **Part 2 — bounded E.0 foundation** (code complete, committed after this update):
   - Contracts `developer.ts` (state types, approval subjects, `servesEdition`); 18 Wave 1 permissions + `PERMISSION_MODULE` (`gate-e-access.vectors.json`/`.test.ts`); F-3 `lead.manage` on lead writes (Larkspur administration/sales and Crescent administration hold it: D-E0-01); four fictional Larkspur personas and roles (`lsp_sales_manager`, `lsp_project_manager`, `lsp_accounts`, `lsp_finance_controller`).
   - Fixtures: `developer/state.ts` (read never stores; `developerStateForWrite`), `developer/scope.ts`, `developer/multientity.fixture.ts`, `developer/handlers.ts` (registration point + E-37 read-only endpoints), `idempotency.ts`, `projection.ts`, `projection.testkit.ts`; `DemoPartition.peekSection`; test-only `MockTransport` `datasetFor`.
   - Backoffice: `prototype/dev-screen.tsx` (`DevScreen`, `DevRecord`, `devRoute`), `prototype/routes.developer.tsx` (`DEVELOPER_AREAS`), one spread in `routes.tsx`; Accounting nav item for `gl.view` (no `match`).
   - Tests: `developer/foundation.test.ts`, `idempotency.test.ts`, `projection.test.ts`, `gate-e-access.test.ts`; `tests/e2e/e0-foundation.spec.ts`; `tests/evidence/gatee0.evidence.spec.ts`. Mutations 32/32 (`test-results-e0/mutations-part2.log`).
   - The harness refuses new report `.md` files here: REPORT.md and test-results.md are delivered in the hand-off text instead.

   - Committed `7c6e569`. On that tree (on battery, heavily throttled): typecheck 0, lint 0 (i18n 10,942 keys × 2, parity OK), production build OK. Full Vitest 1,713/1,751: all 38 failures `Test timed out in 5000ms` in unrelated society/HR/payroll/rentals suites (battery 5 %, CPU throttled); the previous full run on the same foundation code had no timeout. **Must be re-run on AC.**

4. **Quick view at 320 px / 200 %** (`d04605e`): the hold/release button wraps; the lead reference in the hold badge stays whole and bidi-isolated. Pre-existing INV-002 defects left for E.2 (unchanged lines): the drawer title breaks inside "LH-A-0102" and the two amount strips run off a 320 px screen at 200 % (111 px sideways scroll; visible in `e0-q02-…-200pct-320-ur.png`).

## Final results (on AC, HEAD `d04605e` + evidence PNGs)
- Typecheck 0; lint 0 (ESLint, logical CSS, i18n 10,942 keys × 2 locales, parity OK); production build OK.
- **Vitest 1,751/1,751** (69 files, 81 s, 8 Nov 21:58Z). Base `373d0cf` 1,682 + 69 new (GPT 8, validation 16, foundation 21, idempotency 8, projection 8, access 8). Earlier full runs under heavy load (battery, other agents' browser runs) failed only with `Test timed out in 5000ms` in untouched suites; each of those tests passes alone.
- **Complete Chromium** (lock held 20:36–21:27Z, 3 workers, retries off, previews on both loopbacks verified): **551 passed, 0 failed**, 32 skipped (the historical `gateb2`/`stage15r` evidence specs, `test.skip(true)`), 45.8 min = the integration's 538 + `e0-foundation` 7 + `gatee0` evidence 6. **axe 1,607 scans, 0 violations.** Known intermittents `identity.spec.ts:327` and WebKit `s2a.smoke.spec.ts:52` both passed.
- **Firefox + WebKit smoke 70/70** (35 + 35), 4.2 min.
- Mutations: Part 1 19/19, Part 2 32/32 caught, every file restored byte-identically.
- Evidence: 6 PNGs in `screenshots/`, widths match their names (1440 × 4, 320 × 2).

## Next
Push `feature/gate-e0-foundation-validation`, `git ls-remote`, hand-off (REPORT text in the hand-off: the harness refuses new report .md files), STOP for GPT review.

## How to resume
`. test-results-e0/scratch/env.sh`; build `sh test-results-e0/scratch/build.sh`; serve `sh test-results-e0/scratch/preview.sh &`; check `sh test-results-e0/scratch/serve-check.sh`; stop `powershell -File test-results-e0/scratch/stop-previews.ps1`. Mutation runner: `node test-results-e0/mutate.cjs <spec.json> <out.json>`.
