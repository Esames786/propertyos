# Gate E.1 checkpoint (Agent B, wave 1)

Worktree `D:\laragon2\www\propertyos-e1`, branch `feature/gate-e1-crm-pipeline` (from `373d0cf`). Ports 7173–7175 (offset 2000). Scratch scripts (not committed): `test-results-e1/scratch/` (env.sh, build.sh, preview.sh, serve-check.sh, stop-previews.ps1, power.ps1, png-widths.cjs, look.cjs, diag.cjs, mutants.cjs, register.cjs).

## Done (local commit 676d76d and after)
- Contracts `packages/contracts/src/sales.ts`; provisional permissions `lead.assign`, `lead.manage`; Larkspur `sales_manager` role and persona Samina Latif (`usr_lsp_0004`).
- Mock API `packages/fixtures/src/developer/crm/` (state, scope, idempotency, pipeline rules, views/projection, handlers) + `crm-pipeline.vectors.json`, `pipeline.test.ts`, `crm-pipeline.api.test.ts` (54 tests green).
- Screens `apps/backoffice/src/pages/developer/crm/` (pipeline, assignment drawer, Opportunity 360, calendar + reusable `calendar/AgendaCalendar.tsx`, visit workspace, Lead 360 cross-links); route hook; `sales` i18n namespace (EN + UR, parity OK).
- Register CRM-006/007/008/009/011 PLANNED → PARTIAL (139/48/175), synced.
- Specs: `tests/e2e/e1-crm.spec.ts` (14 tests), `tests/smoke/e1.smoke.spec.ts`, `tests/evidence/gatee1.evidence.spec.ts`.
- Mutation checks (first full pass): 16/19 caught. Survivors: M4 equivalent (project scope already enforced by the effective-access decision), M5 and M15 → tests added (direct `mayHold` organisation test; opportunity timeline reassignment projection test). Second pass was stopped at M10 when the battery reached 6 %; files verified byte-identical by sha256 afterwards.
- Harness refused `REPORT.md` / `test-results.md` as new files: their text goes in the hand-off.

## E2E state (targeted, 1 worker)
Green: journey, drag (after drag helper fix), keyboard + rings, lost/reopen, duplicate conversion, Bilal scope, unauthorized, cross-project + revocation, invalid visit, UR 320/200 %. Fixed after the last run, needs a re-run on a fresh build: unbroken refs/hyphenated status words (calendar "No-show", "Lead LD-…" link), axe-test timeout 360 s.

## Next
1. On AC: `sh test-results-e1/scratch/build.sh`, start previews, `serve-check.sh`; rerun `tests/e2e/e1-crm.spec.ts` fully (1 worker); rerun mutants M5, M15 (and the rest) with `node test-results-e1/scratch/mutants.cjs` — never build while it runs.
2. Smoke (FF/WK) and evidence specs; check every PNG (`node test-results-e1/scratch/png-widths.cjs docs/status/gate-e1/screenshots`).
3. Full typecheck, lint, full `npm test`, build; take the lock; complete Chromium (all e2e + e1 + gatee1 evidence, 3 workers) and full FF + WK smoke.
4. Commit, push `feature/gate-e1-crm-pipeline`, `git ls-remote`, release lock, stop previews, hand-off (report text inline).
