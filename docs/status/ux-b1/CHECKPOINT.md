# UX repair batch B1 "Money truth": checkpoint

Branch `fix/ux-b1-money-truth` from `04b6fde` (S.1 hotfix, Issue #18 closed; parent `474e4ae`), worktree
`D:\laragon2\www\propertyos-b1`. `E2E_PORT_OFFSET=1000` = ports 6173-6175 (5173 + 1000).
Sources read (not merged): `docs/ux-backlog@90c2b0a` (§1-§6, B1 entries, N-1, N-2), `docs/frontend-ux-audit@1a0779e`.
Report: `docs/status/ux-b1/B1_REPORT.md` (findings, function matrix, tests, mutations, evidence, manual
verification, observed-not-fixed, integration notes, interim failures). §4.3 holds the final regression.

## Status: final regression passed; committed and pushed for review (see B1_REPORT.md §4.3)
- [x] Server (fixtures) and UI changes for all ten findings; EN/UR strings (10,294 -> 10,319 keys).
- [x] 320 px / 200 % fixes on the changed screens (bill charges as a list, flat codes and references whole,
      payment rows and bills list keep their words, My properties header and figure, receipt amount may wrap,
      voucher footer buttons wrap, "Latest payments" rows). Shared-component problems recorded, not fixed.
- [x] Vitest B1 API tests 18/18. Mutations: round 3 (final) 36/36 caught, all restored byte-identical
      (verified after the stall: no mutant text in sources; fixture diff 9 files as expected).
- [x] tsc exit 0 and full lint exit 0 (eslint, logical CSS, i18n 10,319 parity) on the final sources.
- [x] B1 smoke 6/6 (Firefox 3, WebKit 3). Screen register notes on 18 rows (statuses unchanged).
- [x] B1 e2e on the final build 9/9 (4.9 min, 1 worker); evidence re-shoot 9/9 (3.6 min), 55 PNGs, widths OK.
- [x] Vitest run 3 (15:41Z, 3 workers, CPU 84 % at start): 1,535 / 1,535 in 2 min 24 s (golden vectors
      included). Run 1 under load: 1,534/1,535 (one timeout); run 2 saturated (15 timeouts, dead workers), discarded.
- [x] Final regression under the lock (created atomically 16:52:35Z, released 17:29:54Z): combined e2e (every
      gate) + B1 evidence, Chromium, 3 workers, retries off: 418/418 in 34.1 min, axe 1,468 scans / 0 violations;
      Firefox + WebKit smoke 50/50 (25 + 25) in 2.6 min. Vitest run 4: 1,535/1,535 (1 min 15 s).
- [x] B1_REPORT.md §4.3 filled. Committed with explicit paths; pushed `fix/ux-b1-money-truth`; STOPPED for review.

## Resume notes
- Scripts in `test-results-b1/scratch/`: build.sh, preview.sh (ports 6173-6175 only), mutate.cjs, register.cjs,
  png-widths.cjs, axe-count.cjs. Commit message draft: `test-results-b1/commit-msg.txt`.
- Never build while mutate.cjs runs (it edits sources). Never stop processes I did not start; one full browser
  regression at a time (lock file). The single-spec S.1 run at 19:33 failed 2 phone/axe tests on infrastructure
  (target crashed, worker exit 0xC0000142) under saturation; both passed in the combined run.
