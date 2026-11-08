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

## Next (Part 2 — bounded E.0 foundation)
Contracts `developer.ts`; Wave 1 permissions + `PERMISSION_MODULE`; F-3 `lead.manage`; four Larkspur personas and roles; `developer/state.ts`, `scope.ts`, `multientity.fixture.ts`, `handlers.ts` registration point; `idempotency.ts`, `projection.ts` (+ test kit); `DevScreen`/`DevRecord`, `routes.developer.tsx`; nav items gated by new permissions; tests + mutation checks; full regression under the lock on AC; REPORT.md, test-results.md.

## How to resume
`. test-results-e0/scratch/env.sh`; build `sh test-results-e0/scratch/build.sh`; serve `sh test-results-e0/scratch/preview.sh &`; check `sh test-results-e0/scratch/serve-check.sh`; stop `powershell -File test-results-e0/scratch/stop-previews.ps1`. Mutation runner: `node test-results-e0/mutate.cjs <spec.json> <out.json>`.
