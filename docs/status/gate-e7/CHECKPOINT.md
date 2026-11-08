# Gate E.7 (accounting & banking) — checkpoint

Agent D, worktree `D:\laragon2\www\propertyos-e7`, branch `feature/gate-e7-ledger-banking` (from `373d0cf`).
Offset 2400 (ports 7573–7575). Test output `test-results-e7/`.

## Done
- Contracts `packages/contracts/src/ledger.ts`; provisional permissions `gl.view`, `gl.post`, `journal.approve`.
- Engine, state (seeded through the journal path), handlers, samples, scope/idempotency helpers in
  `packages/fixtures/src/developer/ledger/`; vectors (`ledger.vectors.json`, 29 tests) and API negative
  matrix (`ledger.api.test.ts`, 24 tests) green. Commit 1d7d3ac (local).
- Personas lk_accounts / lk_controller / lk_treasury + Larkspur ledger roles (role-templates.test.ts constant 6 → 9 for Larkspur).
- Pages `apps/backoffice/src/pages/developer/ledger/` (11 screens), i18n `ledger.json` EN + UR, routes hook,
  register rows ACC-001…010 + BANK-005 → PARTIAL, `register:sync` (139 / 54 / 169).
- Specs written: `tests/e2e/e7-ledger.spec.ts`, `tests/evidence/gatee7.evidence.spec.ts`, `tests/smoke/e7.smoke.spec.ts`.

## Next
1. Typecheck is very slow on this machine (investigating whether the ledger namespace makes i18n typing slow).
2. Lint, full vitest, build; targeted browser runs of the E.7 specs (workers=1), fix.
3. Mutation checks; docs (REPORT, test-results, MANUAL_VERIFICATION); complete Chromium + FF/WK smoke under the lock on AC; push.

## How to resume
Read this file, `git log --oneline 373d0cf..HEAD`, `git status`.
