# Gate E.13 — test results (draft, completed at hand-off)

Branch `feature/gate-e13-connected-workspaces`. Machine notes: six agents share the PC; the laptop ran on
battery and slept 19:40–21:14 (empty battery) during this slice; complete browser runs were made only on AC
and under the shared lock.

## Unit / API (Vitest)
- `packages/fixtures/src/developer/workspace/workspace.api.test.ts` — 21 tests.
- `packages/fixtures/src/developer/documents/documents.api.test.ts` — 17 tests.
- Results and the complete `npm test` figures: see the hand-off report.

## Mutation checks
`node test-results-e13/scratch/mutations.cjs` (break one guard, run the two E.13 API test files, restore,
SHA-256 check byte-identical). 18 / 18 caught after one test was strengthened (M17 survived the first pass:
the expiry test now also checks that 35 days is "valid", not "expiring").
