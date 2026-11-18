# Integration E Wave 1 (Issue #25): checkpoint

Agent 1, worktree `D:\laragon2\www\propertyos-int-e-wave1`, branch `integration/e-wave1` (from `373d0cf`).
Ports 8173–8175 (`E2E_PORT_OFFSET=3000`), test output `test-results-ew1/` (git-ignored), docs here.

## Done

1. `--no-ff` merges, in order (source SHAs are the second parents): `544e3f2` E.0 `b3a3b42` (clean), `b5b99b9` E.1
   `31b6027`, `b3c13be` E.2 `9d74405`, `c71d143` E.7 `4a49ffc`, `30042f5` E.13 `0809ba3`, `b1d0645` B10 `0774049` (clean).
2. `eb6dc82` one roster (E.0's four + Saad Hameed `lsp_ledger_clerk`/`usr_lsp_0008` + Haroon Qadri
   `lsp_records_clerk`/`usr_lsp_0009`), canonical permissions (storage.manage → inventory.manage; E.7 actions →
   journal.create / gl.manage / gl.approve / bank.import / bank.import.approve; `requiresAll` for the CRM pipeline),
   one route registry (`DEVELOPER_AREAS`) and one handler registry (`DEVELOPER_AREA_HANDLERS`).
3. `c26aee3` one hold ledger/clock/projection (`crm-holds.ts holdViewFor`, one `UnitHoldView`), INV-002 Urdu 320 px fix.
4. `ed6dda3` helper swaps: bound idempotency, scope (projectVisible / projectGoverned / entityWhole /
   organisationWhole), developer state (E.7 entity LSP, cost centres, collection account, numbering; E-08 fixture).
5. `f57d31b` E.13 registry providers (opportunity, visit, storage, account, journal), task kinds journal_approval /
   project_activation, unit deep link → INV-002, PRJ-002 Documents tab from E.13, E.1 project link, register notes
   (139 / 76 / 147, no BUILT promotion), seam tests, `int-ew1` e2e and evidence specs, E.0 spec on live screens.
6. `36896f1` test-only: the two Gate C.2 video specs reach the statement through Home → Statement (same user flow).
7. `6c2a4b6` fixes from the targeted Chromium run (82 passed, 4 failed): E.0 journal/import series in the year form
   (F-INT-W1-18; the month form broke E.7's 320 px / 200 % and dark checks); Lead 360's e-mail may wrap (the real
   source of F-INT-W1-11's 111 px). Developer Vitest 219/219, typecheck 0, lint 0 after it.
8. Build of `6c2a4b6` served on both loopbacks (serve-check OK). Mutation E.0 51/51 caught (before `6c2a4b6`).

9. Mutations done: E0 51/51, E1 18/19 (M4 equivalent, as on E.1), E2 20/20, E7 19/20 after `d8de2df` (M18
   equivalent, as on E.7; M10 had survived because a test went vacuous under the roster, F-INT-W1-19), E13 18/18,
   B10 2/2, seams 15/15.
10. Full Vitest on `d8de2df` while Agent 3's browsers ran: 1,948/1,951, three 5 s timeouts in untouched suites
    (community polls, rentals source scan, society finance reference 2); the three files alone 82/82.

11. First complete run (2026-11-17 20:23Z) ABORTED, not counted: it started on battery, and `build.sh` had not set
    `VITE_OFFICE_ORIGIN`/`VITE_CUSTOMER_ORIGIN` (the demo bridge pointed at :5173). `build.sh`, `serve-check.sh`
    (bridge check) and `final.sh` (refuses on battery, `lock-power.sh`) fixed. The lock was kept while on battery.
12. Full Vitest on `d8de2df`, quiet machine: 1,951/1,951. Static checks on `d8de2df`: typecheck 0, lint 0, i18n
    parity, register 139/76/147, routes 34/34.
13. Complete run on AC after the PC woke (2026-11-18): Chromium 725/728 (07:39–08:54Z; axe 1,835 scans, 0
    violations); C.2 videos 2/2; Firefox + WebKit smoke 98/98; identity:327 ×10 = 10/10; WebKit s2a:52 ×20 = 18/20.
    539 PNGs of other gates restored.
14. `97474f8` fixes the 3 Chromium failures (AmountStrip `wrap` broke the figure, F-INT-W1-20); the quick-view
    specs on the new build 70/70; `packages/ui` Vitest 94/94, typecheck and ESLint clean.
15. Lock released 09:17:22Z; previews stopped. Docs final.

## Done: STOPPED for GPT and owner review

- Push `integration/e-wave1` without force; `git ls-remote origin integration/e-wave1`; hand off.
- The coordinator's `backup/integration-e-wave1-pre-regression` (`d8de2df`) is theirs: not pushed to, not deleted.

## How to resume

`. test-results-ew1/scratch/env.sh` (node PATH, TEMP, offset 3000). All edit scripts are in `test-results-ew1/scratch/`.
Lock: `D:\laragon2\www\.e2e-busy` (final.sh takes and releases it). Stop previews: `stop-previews.ps1`.
