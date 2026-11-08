# Gate E.13 — checkpoint (Agent E, Wave 1)

Worktree `D:\laragon2\www\propertyos-e13`, branch `feature/gate-e13-connected-workspaces` from `373d0cf`.
Ports: E2E_PORT_OFFSET=2600 → 7773/7774/7775. Test output `test-results-e13/` (helper scripts in
`test-results-e13/scratch/`: env.sh, build.sh, preview.sh, serve-check.sh, stop-previews.ps1, power.ps1,
png-widths.cjs, axe-count.cjs, mutations.cjs).

## Done (local commits 843b528, e358be8)
- Contracts `productivity.ts`, `documents.ts`; provisional permissions (`document.view`, `document.upload`,
  `document_template.manage`, `document_template.approve`, module core); two new Larkspur personas
  (Tehmina Durrani `lsp_doc_controller`, Haroon Qadri `lsp_records_clerk`, Heights only).
- Mock API in `packages/fixtures/src/developer/{workspace,documents}/` registered in `handlers.ts`.
- API tests: `workspace.api.test.ts` (21) and `documents.api.test.ts` (17) green.
- Pages in `apps/backoffice/src/pages/developer/{workspace,documents}/`, local route modules mounted in
  `prototype/routes.tsx`; shell hooks (recent-record visit in ShellLayout, Ctrl+K "Search everywhere").
- i18n `documents.json` (new namespace) and `workspace.json` `hub` block + permission labels, EN + UR; parity OK.
- Register: 11 rows PLANNED → PARTIAL, synced (139 built, 54 partial, 169 planned).
- Specs written: `tests/e2e/e13-workspaces.spec.ts`, `tests/evidence/gatee13.evidence.spec.ts`,
  `tests/smoke/e13.smoke.spec.ts` (not yet run).

## Next
1. Typecheck + lint clean (running; machine on battery, slow).
2. Build for offset 2600, previews on both loopbacks, run my e2e spec targeted (`--workers=1`), fix.
3. Mutation checks (`node test-results-e13/scratch/mutations.cjs`).
4. On AC and holding the lock: full `npm test`, complete Chromium run, evidence spec, FF/WK smoke.
5. REPORT.md, test-results.md (MANUAL_VERIFICATION.md drafted).
6. Push branch only; hand off.

## How to resume
`. test-results-e13/scratch/env.sh`, read this file and `git log --oneline -5`.
