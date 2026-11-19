# Wave 2 combined integration: test results

**Code head `b9fdffa`.** Every commit after it is docs and evidence only.

- Machine: the shared Windows 11 laptop, 12 logical CPUs, Node 20.20.1.
- During the final runs Agent 1 held the browser lock (from 07:40Z) and Agents 2 and 3 were stopped, so the full
  Vitest and the complete runs were **quiet**.
- Ports 8173–8175 (`E2E_PORT_OFFSET=3000`). The previews of the production build served on 127.0.0.1 and ::1.
- Raw logs and JSON reports are in the git-ignored `test-results-ew2/`.

## 1. Static checks (`b9fdffa`)

| Check | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npm run lint`: ESLint | **0 problems** |
| `npm run lint`: logical CSS | no physical left/right utilities or properties |
| `npm run lint`: i18n parity | **2 locales × 33 namespaces, 13,650 keys each, parity OK** |
| `npm run register:sync` | **449 rows, 362 distinct: 139 BUILT, 100 PARTIAL, 123 PLANNED** (the expected combined register); generated file unchanged |
| Route audit (`route-audit-w2.cjs`) | 199 paths; Wave 1 screens **34 / 34**, E.3 **7 / 7**, E.8 **17 / 17**, each served exactly once; the only repeat is the pre-existing shell and root `*` |
| Normal build (`npm run build`, both origins) + `node scripts/check-test-principals.mjs` | **exit 0; no trace of the test-only principals**: backoffice 505 files (229 sourcemaps), customer 120 (37), HQ 114 (34) |
| Test build (`PROPERTYOS_E2E_PRINCIPALS=1`) + `--expect-present` | **exit 0**: the backoffice holds them, the other apps do not |

## 2. Vitest

- **Quiet full suite on `b9fdffa`: 2,171 / 2,171 passed, 96 files, 52.0 s.** Lock held, AC (94 %), CPU 20 % at the
  start.
- On the merge commit, before the fixes: 2,159 / 2,159 (95 files).
- New in the combination: `packages/fixtures/src/developer/wave2-seams.test.ts`, 12 tests.

## 3. Mutations

No build or commit ran while a set was running. Every file was restored with a matching SHA.

| Set | Caught | Note |
|---|---|---|
| **Combination seams** (Vitest, W2-V01…V09) | **9 / 9** | W2-V03 (E.3 lists units without E.2's `inventoryVisible`) survived the first pass. The test was strengthened (`b9fdffa`, a site without an inventory licence), and the mutant is now caught |
| **Combination browser** (W2-B1…B5) | **5 / 5** | W2-D1 E.8 references; W2-D3b visit posted; W2-D3a heading; W2-D4 description; the `pt_` prefix left out |
| E.3 Vitest guards (re-run on the combination) | **26 / 29** | V03, V12 and V16 survived, as on E.3's own branch (`dfd52f8`: the same three, its documented equivalents) |
| E.3 browser guards on the pages this integration touched (B01, B02, B03, B09, B13, B14) | **4 / 6** | B09 and B13 (COM-005's defensive `min-w-0` / `w-full` classes) survived, as on E.3's reviewed branch, where they are documented. B01, B02, B03 and B14 were caught |
| E.8 guards (re-run on the combination) | **50 / 50** | #30 ("a refusal stores nothing") ends its full-suite run by timing out, as on E.8's branch. Run alone the E.8 way, 10 tests fail: caught |

The first E.3 Vitest pass overlapped for about a minute with a second, mistaken start of the same runner. Its result
was set aside and the whole set re-run alone; the table shows the re-run.

## 4. Browsers (the test build, previews on both loopbacks, 3 workers, retries off, all on AC)

| Run | Result |
|---|---|
| **Complete Chromium**: every e2e spec plus every evidence spec on the list (gatee0, gatee1, gatee2, gatee7, gatee13, uxb10, intew1, gates3, uxb1, uxb2, cnidem, ints3b, gatebfinal, gated1, **e3qa, e3int, gatee8, intew2**) | **883 / 883 passed** (727 e2e, 156 evidence), 08:23:05–09:39:15Z (1.3 h). Power at start and end: PowerOnline True (95 %, then 100 %) |
| axe in that run | **2,007 scans, 55,324 rule passes, 0 violations** (EN/UR RTL, dark mode, 320 px at 200 %, as the specs cover) |
| Gate C.2 video specs (Wave 1's test-only repair) | **2 / 2**, 09:39:16–09:40:40Z |
| **Firefox and WebKit smoke**, every smoke spec | **104 / 104** (Firefox 52, WebKit 52, including the e3 and e8 smoke specs), 09:40:44–09:48:29Z, AC 100 % at start and end |
| Known intermittents, alone, not edited or suppressed | Chromium `identity.spec.ts:327` ×10: **10 / 10**. WebKit `s2a.smoke.spec.ts:52` ×20: **16 / 20**; all 4 failures are the known `listbox` still open after a choice (the same rate as at Wave 1's final head) |
| Evidence of other folders | 620 files rewritten by the evidence specs were restored from HEAD; none is committed. Kept: this folder's screenshots, and the W2-D2 corrected E.8 drawer shots (`docs/status/integration-e8/screenshots/e8-60-*`) |

**Targeted runs while combining** (the test build, lock held):
- `int-ew2` first run: 5 / 7. The two failures were W2-D4, found by the new check.
- After the fix: 7 / 7.

## 5. Screenshots (`docs/status/integration-e-wave2/screenshots/`)

- 11 PNGs; every width matches its name (`png-widths.cjs`).
- Reviewed, EN and UR:
  - the payment drawer at 320 px / 200 %: the header reads "LSP-PV-2026-" / "0001", whole within its segments; the
    balance as the viewport shows it, with no page behind it;
  - Supplier 360 at 320 px / 200 %;
  - COM-004's descriptions wrapping inside their fields;
  - one search across the areas (journals and suppliers) at 1440 px;
  - "Draft not available".
- The corrected E.8 shots (`e8-60-drawer-200pct-320-*`, `e8-60-drawer-balance-…`, `…-balance-end-…`) show the open
  drawer only: its header, then the balance, then the simulation and the ledger check.

## 6. Summary against the brief

| Required | Result |
|---|---|
| Static checks | green (§1) |
| Quiet full Vitest | **2,171 / 2,171** (§2) |
| Production build + shipped check; test build + `--expect-present` | 0 hits; present in the backoffice only (§1) |
| Complete Chromium, all e2e + all evidence including e3qa, e3int and gatee8, retries off | **883 / 883** (§4) |
| Full Firefox + WebKit smoke | **104 / 104** (§4) |
| axe | **0 violations in 2,007 scans** (§4) |
| Seam mutations + re-run of the E.3/E.8 guards the reconciliation touched | 9/9 + 5/5; E.3 26/29 and 4/6 (all survivors as on E.3's own branch); E.8 50/50 (§3) |
| Known intermittents alone | 10/10; 16/20 (§4) |
| Register | **139 / 100 / 123** (§1) |
