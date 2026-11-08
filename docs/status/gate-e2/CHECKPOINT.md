# Gate E.2 (projects and inventory) — checkpoint

Agent C, Wave 1. Worktree `D:\laragon2\www\propertyos-e2`, branch `feature/gate-e2-projects-inventory` (from `373d0cf`).
Ports 7373–7375 (`E2E_PORT_OFFSET=2200`). Scripts and logs in `test-results-e2/scratch/` (git-ignored).

## Done
- Contracts `packages/contracts/src/projects.ts` (dimensions, buckets, projects, setup, matrix, availability, storage).
- Provisional permissions `project.view`, `project.manage`, `project.approve`, `storage.manage` (permissions.ts, access.ts).
- Provisional personas `lk_project_officer` (Hina Baig) and `lk_projects_director` (Kashan Lodhi) with Larkspur's own roles.
- Mock API `packages/fixtures/src/developer/inventory/` (rules, state, scope, idempotency, views, handlers); registered in handlers.ts.
- Hold rule mirrors E.0's `crm-holds.ts` (3bc31cb, read only): `holdClock`, `holdActive`, `activeHolds`, `holdUntil`, `releasableBy`.
- API tests `inventory.api.test.ts` (28 green).

## Next
1. i18n namespace `projects` (en-PK, ur-PK) + register in resources.ts.
2. Pages `apps/backoffice/src/pages/developer/projects/` + area route module; hook in routes.tsx.
3. Register rows PRJ-001/002/003, INV-001/002/008/010 → PARTIAL; `npm run register:sync`.
4. Vectors `inventory.vectors.json` + test; security.spec.ts line for the Towers matrix.
5. E2E, evidence, smoke specs; full checks; docs; push.

## Resume
`. test-results-e2/scratch/env.sh` then `npx vitest run packages/fixtures/src/developer/inventory`.
