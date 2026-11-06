# Gate S.3 checkpoint (resume notes)

Branch `feature/gate-s3-rentals` in worktree `D:\laragon2\www\propertyos-s3`.

## Issue #17 closure 2 (GPT follow-up review of `d050bad`): done, committed and pushed; STOPPED for GPT's final review

Review: `C:\Users\Dell\AppData\Local\Temp\claude\f4d6f3736e292f75\6752593f-e85c-4b16-9d5c-8157297782a1\scratchpad\issue17-gpt-review-2.md` (Issue #17 comment 6689628632). Base `d050bad`; the closure-2 commit's SHA is in the delivery message.

- [x] Tests first (3 in `rentals.issue17.api.test.ts`); leak reproduced on `d050bad` (list and lookup).
- [x] Fix: `statementKnown` (one rule, landlord view and office), `officeKnows`, `issuedOf` filtered, office list filtered; lookup of a hidden-only statement = the never-issued draft.
- [x] Mutations 28/28 killed; tsc, lint clean; Vitest 1,621/1,621; build.
- [x] Combined run 1: 426/429 (PC entered Modern Standby 18:04:50Z–20:03:26Z mid-run; the 3 C.1 tests then 15/15 alone). Combined run 2: **429/429 in 39.3 min**. Axe 1,506 / 0. Smoke 50/50. Identity :327 10/10 alone; S.2a WebKit 4/10 alone on battery.
- [x] Lock acquired 17:31:56Z (after C and B), released 2026-11-06T21:05:31Z. Previews stopped.
- [x] Docs: report "Issue #17 closure 2" (D1–D4), SECURITY_FINDINGS S17, FUNCTION_MATRIX, test-results closure-2 section.
- Note: the PC was on battery (48 % at the end, unplugged).

## Closure 1 (pushed as `d050bad`)
- Merge `0dd9723` (04b6fde, no conflict); P0 portal projection; P1 `owner_statement.issue`; mutations 25/25; combined 428/429; smoke 50/50 then 49/50 (WebKit S.2a; A/B 8/10 branch vs 8/10 clean `04b6fde`); axe 1,506 / 0.

## How to resume
- Build: `sh test-results-s3/scratch/build.sh`; serve: `sh test-results-s3/scratch/preview.sh` (ports 5773–5775, both loopbacks).
- Run: `E2E_PORT_OFFSET=600 npx playwright test …` with TEMP/TMP on D:. Lock: `node test-results-s3/scratch/acquire-lock.cjs` (exclusive create, grace for the agent next in line).
