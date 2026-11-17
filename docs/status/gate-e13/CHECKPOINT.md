# Gate E.13 — checkpoint (Agent E, Wave 1)

Worktree `D:\laragon2\www\propertyos-e13`, branch `feature/gate-e13-connected-workspaces` from `373d0cf`.
Ports: E2E_PORT_OFFSET=2600 → 7773/7774/7775. Test output `test-results-e13/` (helper scripts in
`test-results-e13/scratch/`).

## Status: DONE — pushed, STOPPED for review
- 11 screens PARTIAL (register 139 / 54 / 169), typecheck 0 errors, lint clean, Vitest 1,720 / 1,720,
  E.13 API 38 / 38, mutations 18 / 18 caught.
- **Final run on HEAD `34864b8`** (on AC, lock held 23:44–00:33Z):
  - Complete Chromium run: **547 passed, 0 failed, 14 skipped** (skipped by design), 44.5 min.
  - Axe: 1,642 scans, 0 violations.
  - Firefox + WebKit smoke: **77 / 78**. The one failure is the known WebKit intermittent
    `s2a.smoke.spec.ts:52`. Rerun with `--repeat-each=20`, it failed 11 / 20; the base `373d0cf` (A/B) also
    failed 11 / 20, so it predates E.13.
- First run (on `4f56461`): 546 passed, 1 failed. The failure was the E.13 palette name, fixed in `5313fe7`.
  Smoke passed 78 / 78.
- Evidence: 101 PNGs in `screenshots/`. Details: `test-results.md`, `MANUAL_VERIFICATION.md`.
- REPORT.md: the harness refused the file; its text is in the hand-off to the coordinator.

## Next (after review)
Integrate E.0 (permissions, personas, scope/projection/idempotency helpers, edition-aware routes and nav),
then re-run the complete regression and move the 11 rows to BUILT.
