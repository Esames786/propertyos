# Gate E.13 — checkpoint (Agent E, Wave 1)

Worktree `D:\laragon2\www\propertyos-e13`, branch `feature/gate-e13-connected-workspaces` from `373d0cf`.
Ports: E2E_PORT_OFFSET=2600 → 7773/7774/7775. Test output `test-results-e13/` (helper scripts in
`test-results-e13/scratch/`: env.sh, build.sh, preview.sh, serve-check.sh, stop-previews.ps1, power.ps1,
png-widths.cjs, axe-count.cjs, mutations.cjs, final.sh, timing-ab.sh).

## Done (local commits up to 51d4173)
- Contracts, provisional permissions, two new Larkspur personas, mock API (`developer/{workspace,documents}`),
  API tests 38/38, mutation checks 18/18 caught.
- Screens (11) with local route module `prototype/routes.e13.tsx`, shell hooks (recent-record visit,
  Ctrl+K "Search everywhere"), i18n EN + UR, register rows PARTIAL (139 / 54 / 169).
- Full typecheck 0 errors; full lint (eslint, logical CSS, i18n parity) clean.
- Targeted browser runs on the current build: e13 e2e 22/22 (after fixes), e13 smoke FF/WK 8/8 (after
  timeouts), e13 evidence 9/9.
- Full Vitest: 1710/1720 under heavy load — the 10 failures are 5 s timeouts of society/payroll API tests;
  A/B timing shows the same timeout with the E.13 handlers unregistered (load, not E.13).

## Next
1. When the lock frees: `sh test-results-e13/scratch/final.sh final` (complete Chromium + evidence gatee13,
   stage1, gatebfinal; then full FF/WK smoke). Accepted PNGs of ui-stage-1 and gate-b-final are restored.
2. Full Vitest again on a quieter machine.
3. PNG review, test-results.md, push the branch, hand-off (REPORT.md text goes into the hand-off: the
   harness refused that file).

## How to resume
`. test-results-e13/scratch/env.sh`, read this file and `git log --oneline -8`.
