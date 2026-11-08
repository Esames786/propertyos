# Gate E.1 checkpoint (Agent B, wave 1)

Worktree `D:\laragon2\www\propertyos-e1`, branch `feature/gate-e1-crm-pipeline` (from `373d0cf`). Ports 7173–7175 (offset 2000). Scratch scripts: `test-results-e1/scratch/` (env.sh, build.sh, preview.sh, serve-check.sh, stop-previews.ps1, look.cjs, diag.cjs).

## Done
- Contracts `packages/contracts/src/sales.ts`; provisional permissions `lead.assign`, `lead.manage`; Larkspur `sales_manager` role and persona Samina Latif.
- Mock API `packages/fixtures/src/developer/crm/` (state, scope, idempotency, pipeline rules, views, handlers) + vectors, unit and API tests (green).
- Screens in `apps/backoffice/src/pages/developer/crm/` (pipeline, assignment drawer, Opportunity 360, calendar + reusable `calendar/AgendaCalendar.tsx`, visit workspace, Lead 360 cross-links); route hook; `sales` i18n namespace (EN + UR).
- E2E spec `tests/e2e/e1-crm.spec.ts`.

## Next
1. Make `e1-crm.spec.ts` green (targeted, 1 worker), then smoke + evidence specs.
2. Register rows CRM-006/007/008/009/011 PLANNED → PARTIAL, `npm run register:sync`.
3. Mutation checks; full typecheck/lint/vitest/build; complete Chromium + FF/WK smoke under the lock on AC.
4. REPORT.md, test-results.md, MANUAL_VERIFICATION.md; commit; push; hand-off.

## Resume
`source test-results-e1/scratch/env.sh`; `sh test-results-e1/scratch/build.sh`; start previews with `preview.sh` (background); `serve-check.sh`; run specs with `--workers=1` unless holding `D:\laragon2\www\.e2e-busy`.
