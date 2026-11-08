# Gate E.7 (accounting & banking) — checkpoint

Agent D, worktree `D:\laragon2\www\propertyos-e7`, branch `feature/gate-e7-ledger-banking` (from `373d0cf`).
Offset 2400 (ports 7573–7575). Test output `test-results-e7/`.

## Done
- [x] Read wave1-common, directive (Agent D), Gate E plan §2.2/§3/§4/§6 E.7, OPEN_DECISIONS E-03/04/06/07/08/15/16/17/18/27/28/29/37.
- [x] `npm ci`.

## Next
1. Contracts `packages/contracts/src/ledger.ts`.
2. Engine/state/seed/handlers `packages/fixtures/src/developer/ledger/`.
3. Vectors + API negative matrix.
4. Pages `apps/backoffice/src/pages/developer/ledger/`, i18n `ledger.json`.
5. Routes hook, register rows → PARTIAL, personas.
6. E2E, evidence, smoke; docs; full checks under the lock; push.

## How to resume
Read this file, `git log --oneline 373d0cf..HEAD`, `git status`.
