# Gate S.3 checkpoint (resume notes)

Branch `feature/gate-s3-rentals` in worktree `D:\laragon2\www\propertyos-s3`.
- Built on `a0d4a70`, committed locally as a checkpoint, then **rebased onto `474e4ae`** (the S.2b Issue #16 closure GPT accepted). Clean rebase, no conflicts.
- Issue #18 (`fix/s1-bank-feed-and-idempotency`) is NOT integrated (not reviewed yet); its rules are applied in rentals.
- Brief: GitHub Issue #17 + coordinator updates. S.3 stays provisional until GPT/owner review. Push only this branch, then STOP.

## Decisions taken
- Existing seeded `tnt_riverbend` (name kept), `rentals` (site scope, catalogue 29 → 30) on Heights + Court from 2026-09-01, never Villas; features owner_statements, owner_payouts, management_fees.
- Riverbend roles: Director, Portfolio manager, Finance controller (+lease.view, +rentals.configure), Client-money accounts officer (replaces maintenance starter), technician, security.
- Posting (RNT-004) and all settlement PARTIAL: no lease/payout subject in the C.1/C.2 engine; posting route always 409; no settle route; settled store has no writer.
- Riverbend shares its demo partition between the two apps (`SHARED_TENANTS`).
- Owner payout account visible only to payout preparers/approvers (Issue #18 rule).

## Progress
- [x] contracts, fixtures, API, vectors, unit + API tests (rentals: 86 tests)
- [x] i18n `rentals` (en/ur), nav/common/platform keys
- [x] office UI (7 screens + drawers), resident app landlord edition + PORTAL-037
- [x] register rows (449 / 362) + register.spec count
- [x] tsc, lint, full Vitest on the integrated branch
- [x] S.3 e2e 15/15, S.3 evidence 11/11 (one fixed and rerun), Firefox/WebKit smoke 4/4
- [x] mutation checks 15/15 killed (test-results-s3/mutations.txt)
- [x] complete combined regression: 404/404 in 38.5 min (lock held, then released)
- [x] final build: S.3 spec 15/15 twice, evidence 11/11, smoke 4/4; tsc, lint, Vitest 1,587/1,587
- [x] docs (report, function matrix, security findings, test results, manual verification)
- [x] final commit and push of `feature/gate-s3-rentals` only (SHA in the delivery message); STOPPED for GPT and owner review

## How to resume
- Build: `sh test-results-s3/scratch/build.sh`; serve: `sh test-results-s3/scratch/preview.sh` (ports 5773–5775, both loopbacks).
- Run: `E2E_PORT_OFFSET=600 npx playwright test …` with TEMP/TMP on D:. Check/create `D:\laragon2\www\.e2e-busy` before multi-worker runs.
