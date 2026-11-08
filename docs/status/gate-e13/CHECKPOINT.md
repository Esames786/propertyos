# Gate E.13 — checkpoint (Agent E, Wave 1)

Worktree `D:\laragon2\www\propertyos-e13`, branch `feature/gate-e13-connected-workspaces` from `373d0cf`.
Ports: E2E_PORT_OFFSET=2600 → 7773/7774/7775. Test output `test-results-e13/`.

## Done
- [x] Read wave1-common, directive (Agent E + coordination), Gate E plan §2.3, §3, §4, §6 E.13, OPEN_DECISIONS (E-07, E-28, E-35).
- [x] `npm ci`.

## In progress / next
1. Contracts `documents.ts`, `productivity.ts`.
2. Provisional permissions + two new Larkspur document personas (decision for the owner).
3. Mock API: `packages/fixtures/src/developer/{workspace,documents}/`.
4. Vitest API tests (security matrix).
5. i18n `documents.json` + `workspace.json` (`hub` block), EN + UR.
6. Pages + local route modules; shell hooks (record visit, palette "search everywhere").
7. Register rows → PARTIAL, `register:sync`.
8. E2E, evidence, smoke specs; full checks under the lock on AC.
9. REPORT.md, test-results.md, MANUAL_VERIFICATION.md.

## How to resume
`export PATH=/d/laragon2/bin/nodejs/node-v20.20.1-win-x64:$PATH`, `cd /d/laragon2/www/propertyos-e13`, read this file and `git log`.
