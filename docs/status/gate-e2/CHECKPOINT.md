# Gate E.2 (projects and inventory) — checkpoint

Agent C, Wave 1. Worktree `D:\laragon2\www\propertyos-e2`, branch `feature/gate-e2-projects-inventory` (from `373d0cf`).
Ports 7373–7375 (`E2E_PORT_OFFSET=2200`). Scripts and logs in `test-results-e2/scratch/` (git-ignored).

## Done
- Contracts `packages/contracts/src/projects.ts`; provisional permissions `project.view|manage|approve`, `storage.manage`.
- Provisional personas `lk_project_officer` (Hina Baig) and `lk_projects_director` (Kashan Lodhi), Larkspur's own roles.
- Mock API `packages/fixtures/src/developer/inventory/` (rules mirror E.0 `crm-holds.ts` at 3bc31cb; scope; bound idempotency; views; handlers), registered in `handlers.ts`.
- Screens `apps/backoffice/src/pages/developer/projects/` + route module `apps/backoffice/src/prototype/routes.e2.tsx` hooked in `routes.tsx`.
- i18n namespace `projects` (EN, UR), registered in `resources.ts`.
- Register rows PRJ-001/002/003, INV-001/002/008/010 → PARTIAL; `register:sync` (139 built / 49 partial / 174 planned).
- Tests: `inventory.api.test.ts`, `inventory.vectors.test.ts` (+ `inventory.vectors.json`), `tests/e2e/e2-projects.spec.ts`, `tests/smoke/e2.smoke.spec.ts`, `tests/evidence/gatee2.evidence.spec.ts`; `security.spec.ts` Towers matrix line updated; `role-templates.test.ts` Larkspur role count 6 → 8.
- Local commit b4a9eb8 (milestone 1).

## Next
1. Targeted E2E green (fixes after run 1: testid collision, list selector, toast filter, `N-bed` wrapping, P360 without record).
2. Evidence PNGs; look at each.
3. Mutation checks (`node test-results-e2/scratch/mutations.cjs`).
4. Full pre-push: typecheck, lint, full `npm test` (quiet machine), build; then on AC with the lock: complete Chromium run + FF/WK smoke.
5. Docs REPORT.md, test-results.md; commit; push; hand-off.

## Resume
`. test-results-e2/scratch/env.sh`; previews `sh test-results-e2/scratch/preview.sh` (background); build `sh test-results-e2/scratch/build.sh`.
The machine was on battery during development (PowerOnline False): complete runs wait for AC.
