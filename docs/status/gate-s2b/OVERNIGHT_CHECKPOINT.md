# Overnight checkpoint: Gate S.2b, Issue #16

**Purpose:** a resume point if the session stops. Read this first, then continue from "Remaining".

- **Worktree:** `D:\laragon2\www\propertyos-s2b`
- **Branch:** `feature/gate-s2b-society-payroll`
- **Starting SHA (reviewed):** `a0d4a70`. The Issue #16 work is uncommitted on top until the closure commit.
- **Issue:** https://github.com/Esames786/propertyos/issues/16 (two P0 findings)

## Done (verified)

1. **P0-1, scope-aware projection** (`packages/fixtures/src/payroll/views.ts`).
   - `projectEvents` and `projectVersions` are applied to the run, period and instruction histories and to the versions.
   - Free-text notes (`approvalNote`, `reversalReason`, `cancelReason`) are returned only to readers with the whole employer.
   - Stored events and versions name the employee they are about (`StoredEvent.employeeId`, `StoredVersion.aboutId`); state v2.
2. **P0-2, bound idempotency** (`handlers.ts`).
   - `replayOf` and `remember` bind operation, principal, target and the input fingerprint.
   - The replay runs after the authority checks and re-reads its record through a scoped lookup.
   - Any other reuse gets 409 `idempotency_key_reused`, and nothing changes.
3. **Contract.** `PayVersion.net` and `included` are optional.
4. **UI.** The versions panel works without amounts; brief reversal and cancellation texts.
5. **Strings.** New keys in English and Urdu; parity 10,278 keys.
6. **Tests.**
   - `packages/fixtures/src/payroll/payroll.issue16.api.test.ts`: 4 tests, all passing.
   - The payroll suite: 52 / 52.
7. **Mutation table** (scratchpad `mutate-i16.cjs`, first run).
   - P1–P26 all caught.
   - I1–I9 all caught except I6, then fixed by adding a hidden person's `line_removed` event to the test.
   - J1 cannot be observed: each operation's target is a different kind of id. It is kept as defence in depth.
   - J2–J5 caught. R0 (the `a0d4a70` sources) fails all 4 new tests.
8. **Browser test** (in `tests/e2e/s2b.spec.ts`): a main-site-only reader with a Block C worker. Helper `addBlockCWorker` in `tests/support/society.ts`.
9. Evidence captures i01–i03 (full reader, then main-site reader) added and generated: evidence spec 13 / 13.
10. UI audit fix: list-level `scopeLimited` on periods, runs and disbursements (plus the dashboard flag) with a notice on every payroll screen that shows amounts; API and browser assertions added; mutation K1 caught.
11. S.2b browser spec 15 / 15 on the final build. Final mutation table: P1–P26, I1–I9, J2–J5, R0 and K1 caught; J1 cannot be observed (by design); restored 0 / 52.

## Remaining

None for Issue #16: commit `Gate S.2b closure (Issue #16)`, push, STOP for GPT review.

## Final results (Issue #16 code)

- tsc and lint clean; parity 10,278 keys.
- vitest 1,501 / 1,501 ×2.
- Mutations: all caught except J1 (cannot be observed).
- Combined 402 / 402 in 39.4 min (e2e 389, evidence 13), retries off.
- Axe 1,372 scans, 0 violations.
- FF/WK smoke 40 / 40.
- 52 screenshots and 1 video.

**Parallel agents.**
- Gate E plan pushed: `docs/gate-e-plan` @ `3e4cfa8`.
- UX audit pushed: `docs/frontend-ux-audit` @ `1a0779e`.
- S.3 Rentals stopped on the weekly usage limit with uncommitted work in `D:/laragon2/www/propertyos-s3`; resume the same agent after the limit resets.

## Resume commands

```sh
cd /d/laragon2/www/propertyos-s2b
export PATH=/d/laragon2/bin/nodejs/node-v20.20.1-win-x64:$PATH TEMP='D:\laragon2\www\propertyos-s2b\test-results-s2b\tmp' TMP='D:\laragon2\www\propertyos-s2b\test-results-s2b\tmp'
npx vitest run packages/fixtures/src/payroll        # 52 expected
sh test-results-s2b/scratch/build.sh                 # stop previews and build
sh test-results-s2b/scratch/preview.sh &             # serve 5673-5675 on both loopbacks
E2E_PORT_OFFSET=500 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gates2b.evidence.spec.ts --workers=3 --retries=0
```

## Current results

- Payroll unit and API: 52 / 52.
- tsc and lint: clean.
- Full regression: complete (above).
