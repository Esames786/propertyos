# Gate E.3 local validation — checkpoint (Agent 2, Wave 2)

**Branch:** `fix/gate-e3-local-validation-claude` (worktree `D:\laragon2\www\propertyos-e3-qa`), from GPT's
`fix/gate-e3-qa-hardening-gpt@c4a6f3a`. GPT's branches are never changed.
**Ports:** `E2E_PORT_OFFSET=3200` → 8373 (backoffice), 8374 (customer), 8375 (HQ). Output: `test-results-e3qa/`.

## How to resume

1. `. test-results-e3qa/scratch/env.sh` (Node on PATH, TEMP on D:, offset 3200).
2. Read this file, then `git log --oneline c4a6f3a..HEAD`.
3. Build for tests: `sh test-results-e3qa/scratch/build.sh` (sets `PROPERTYOS_E2E_PRINCIPALS=1`, as
   playwright.config.ts does), serve: `sh test-results-e3qa/scratch/preview.sh &`, check:
   `sh test-results-e3qa/scratch/serve-check.sh`. Shipped-build proof: `sh test-results-e3qa/scratch/shipped-check.sh`.
4. Stop previews: `powershell -File test-results-e3qa\scratch\stop-previews.ps1`.
5. Never build while `mutate.cjs` runs: the browser bundle includes the mock server, so a build then ships a mutant.

## Done

- Baseline recorded (see test-results.md §1).
- Fixes D1–D7 (compile, lint, tests, Vitest include, register PARTIAL), one commit each.
- Test-only pricing principal (browser + API) `c10d686`; positive and negative API (54) and browser specs.
- D8 `c4cb1c0` + D8b `76c6887` saved state holds / no duplicate send; D9 `43e3d2e` 409 recovery;
  D11 `be4d882` prototype-named keys; D10 `c840822` outage ≠ "not in your scope"; V13 test `979d155`;
  D13 `ab223d2` focus after save + INV-007 focus return; D12/D14 `cefed5e` + `568adb8` reflow at 320/200 %.
- Vitest mutations: 22/25 caught (V03, V12, V16 equivalent).
- Full typecheck / lint / Vitest (79 files, 1,872) green on `cefed5e`.

## Next

- [x] Commit: COM-004 unit option shows the reference only; INV-007 draft amount `inline-block` (`df0bd28`); evidence
      spec (+ scroll to top) and its 60 PNGs, reviewed (`faf60e0`).
- [x] Browser mutations (12/14 caught; B09/B13 defensive classes, see test-results.md §3): `node test-results-e3qa/scratch/mutate.cjs test-results-e3qa/mutations-browser.json browser`
      (then `build.sh` + `preview.sh` again for a clean build).
- [x] Complete regression under the lock, on AC, 18 Nov 09:21–10:18 UTC at `67be408`: Chromium **575/575** (50.2 min,
      axe 1,681 scans / 0 violations), Firefox + WebKit smoke **70/70** (6.5 min). See test-results.md §5.
- [x] Pushed as a labelled **pre-regression checkpoint** at the coordinator's request (battery 22 %). What ran on
      this product source (`8a341a0`): typecheck and lint clean; Vitest 1,872 (2 load timeouts in
      community/finance suites, 78/78 alone); E.3 browser 64/64 (latest per spec, see test-results.md §5);
      evidence 9/9 (60 PNGs reviewed); mutations Vitest 22/25 and browser 12/14, survivors explained.
- [x] Results committed and pushed as a docs commit; hand-off sent. **STOPPED for GPT/owner review.**

## Waiting

- The full regression runs from `sh test-results-e3qa/scratch/wait-and-run.sh final` (background): it waits for
  the shared lock, yields 150 s to agents already waiting (Agent 1 has priority), needs AC, then runs
  `final.sh` (complete Chromium e2e + e3qa evidence, then Firefox + WebKit smoke). Log: `test-results-e3qa/wait.log`.
