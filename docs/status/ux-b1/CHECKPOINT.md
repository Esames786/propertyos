# UX repair batch B1 "Money truth": checkpoint

Branch `fix/ux-b1-money-truth` from `04b6fde` (S.1 hotfix, Issue #18 closed; parent `474e4ae`), worktree
`D:\laragon2\www\propertyos-b1`. `E2E_PORT_OFFSET=1000` = ports 6173-6175 (5173 + 1000).
Sources read (not merged): `docs/ux-backlog@90c2b0a` (§1-§6, B1 entries, N-1, N-2), `docs/frontend-ux-audit@1a0779e`.
Report: `docs/status/ux-b1/B1_REPORT.md` (findings, function matrix, tests, mutations, evidence, manual
verification, observed-not-fixed, integration notes, interim failures). §4.3 holds the final regression.

## Status: B1 pushed 6b1d7f9; Issue #19 follow-up done and pushed (below; B1_REPORT.md §11)
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
- [x] B1_REPORT.md §4.3 filled. Committed with explicit paths; pushed `6b1d7f9`.

## Issue #19 closure (GPT review of 6b1d7f9: P0, duplicate credit-note lines bypass the cap)
- [x] Reproduced on 6b1d7f9 (temporary test, deleted): 600 + 600 on one line with 1,000 open issued ANR-CN-0002
      for 1,200; invoice outstanding -200.00 shown "paid". Also: unknown line ids skipped silently, `[null]` threw.
- [x] Fix (server, `society/handlers.ts` credit-note POST): body shape and membership as a whole, each line at most
      once (duplicates refused, not summed), then the unchanged `creditableOf` amounts; all before any number,
      audit or write; authority checks first as before. EN/UR strings duplicateLine, linesMismatch (10,321 keys).
- [x] Vitest: 5 new tests appended to `ux-b1.api.test.ts` (existing 18 unmodified): 23/23; 4 of the 5 fail on the
      unfixed handler. Mutations (`mutate19.cjs`): 10/10 caught + K1-K5 re-run 5/5, all restored byte-identical.
- [x] tsc 0, lint 0 (parity OK), Vitest 1,540/1,540 (76 s), build OK. Combined e2e + B1 evidence under the lock
      (22:11:05Z-22:53:20Z): 418/418 in 38.9 min, axe 1,468 scans / 0 violations; smoke 49/50: WebKit
      `s2a.smoke.spec.ts:52` "a new guard" failed once (known intermittent; listbox did not close).
- [x] WebKit `--repeat-each=20` of that test (lock 22:54:48Z-23:01:17Z): this branch 6/20 failed, base 04b6fde
      9/20 failed, all the same assertion: pre-existing, not caused by B1. Firefox smoke 25/25.
- [x] B1_REPORT.md §11 written (reproduction, fix, tests, mutations, results, interim failures). Committed with
      explicit paths as a fast-forward of 6b1d7f9 and pushed; previews stopped; lock released. STOPPED for GPT's
      final review.

## Resume notes
- Scripts in `test-results-b1/scratch/`: build.sh, preview.sh (ports 6173-6175 only), mutate.cjs, mutate19.cjs,
  register.cjs, png-widths.cjs, axe-count.cjs, power.ps1 (AC/battery/sleep check), final19.sh, wk19.sh.
- Never build while mutate.cjs runs (it edits sources). Never stop processes I did not start; one full browser
  regression at a time (lock file). The single-spec S.1 run at 19:33 failed 2 phone/axe tests on infrastructure
  (target crashed, worker exit 0xC0000142) under saturation; both passed in the combined run.
