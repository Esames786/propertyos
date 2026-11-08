# UX B10 (Issue #24) checkpoint

Agent F, worktree `D:\laragon2\www\propertyos-b10`, branch `fix/ux-b10-reflow-focus` from `373d0cf`.
Ports 7973–7975 (`E2E_PORT_OFFSET=2800`), test output `test-results-b10/`, scripts in `test-results-b10/scratch/`.

## Done
- Reproduced both P1 findings on the base build (`test-results-b10/scratch/diag/`, survey `test-results-b10/survey-base.tsv`):
  - F-INT-1: 33 of 440 StatTile label measurements cut at 200 % text, 17 tiles on all 7 StatTile screens, incl. `rent-kpi-payable` EN/UR.
  - F-INT-3: Tab from Close to Cancel left Cancel flush with the overlay's bottom edge; `ringOf` clipped 0.37 (EN).
- Fixes, committed locally as `9f76e99`:
  - `packages/ui/src/data/StatTile.tsx`: no clamp; header row `flex-wrap`; label group `flex-1`; `data-stat-label`.
  - `packages/ui/src/overlays/Dialog.tsx`: `scroll-p-4` on the modal overlay (the dialog's scroll container).
- Tests (same commit): `tests/support/ring-edges.ts`, `tests/e2e/ux-b10.spec.ts` (24), `tests/evidence/uxb10.evidence.spec.ts` (4 tests, 14 PNGs),
  `tests/smoke/uxb10.smoke.spec.ts` (2 per browser), `packages/ui/src/data/StatTile.b10.test.tsx` (2), `tests/e2e/int-s3b.spec.ts` (2 lines).
- Dev runs (not final): ux-b10 + int-s3b + uxb10 evidence 37/37 (Chromium); smoke 3/4 then the Firefox Urdu label check was corrected
  (Firefox counts Urdu glyph ink in scrollHeight; the check is now "the label does not clip" + sideways bounds); one smoke rerun stalled
  in Firefox on battery and was stopped (no result).
- The harness refused a new `REPORT.md` / `test-results.md` for this agent: their text goes into the hand-off.

## Next
1. Mutants M1 (clamp back) and M2 (scroll padding removed) running (`test-results-b10/scratch/mutants.sh`); M3–M7 on AC.
2. On AC, holding the lock: static checks + full Vitest, then `test-results-b10/scratch/final.sh` (complete Chromium e2e + all
   non-historical evidence, PNG compare + restore, full Firefox + WebKit smoke).
3. Commit this folder's screenshots, push the branch, hand off.

## Resume
`. test-results-b10/scratch/env.sh`; `sh test-results-b10/scratch/build.sh`; `sh test-results-b10/scratch/preview.sh &`;
`sh test-results-b10/scratch/serve-check.sh`; check power with `test-results-b10/scratch/power.ps1`.
