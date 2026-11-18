# Gate E Wave 1 integration (Issue #25): test results

Machine: shared Windows 11 laptop, 12 logical CPUs. Two other agents (E.3 validation and E.8) worked at the same
time, so the CPU was often near 100 %. Node 20.20.1. Ports 8173–8175 (`E2E_PORT_OFFSET=3000`). The previews of the
production build served on both 127.0.0.1 and ::1. Raw logs and JSON reports are in the git-ignored
`test-results-ew1/`. Final code head: **`97474f8`**. It is `d8de2df` plus one opt-in change to `AmountStrip`, used
only by the CRM unit quick view, found and fixed by the complete run (§4.2). Commits after it are docs and evidence
only.

## 1. Static checks (code head `d8de2df`; `97474f8`: typecheck 0, ESLint 0, `packages/ui` Vitest 94/94)

| Check | Result |
|---|---|
| `npm run typecheck` (tsc: apps, packages and tests) | **0 errors** |
| `npm run lint`: ESLint | **0 problems** |
| `npm run lint`: logical CSS | no physical left/right utilities or properties |
| `npm run lint`: i18n parity | **2 locales × 31 namespaces, 12,700 keys each, parity OK** |
| `npm run register:sync` | **449 rows, 362 distinct: 139 BUILT, 76 PARTIAL, 147 PLANNED**; `register.generated.ts` unchanged |
| Static route audit (`route-audit.cjs`) | 175 paths; **34/34 Wave 1 addresses served exactly once**; the only repeat is the pre-existing shell and root `*` |
| `npm run build` (backoffice, customer, HQ), with `VITE_OFFICE_ORIGIN=http://localhost:8173` and `VITE_CUSTOMER_ORIGIN=http://localhost:8174` as `playwright.config.ts` sets them for an offset run | **exit 0**; the customer bundle links to `localhost:8173` (0 references to :5173) |

## 2. Vitest

- **Full suite on `d8de2df`: 1,951 / 1,951 passed, 80 files, 46.7 s** (machine quiet).
- The same code, run earlier while Agent 3's complete browser run held the CPU at 100 %, gave **1,948 / 1,951**.
  All three failures were **5,000 ms timeouts**, none an assertion failure. They were in suites the integration does
  not touch (`git diff 373d0cf` is empty for them):
  - `community.test.ts`: "5,000 random small polls";
  - `rentals.integration.test.ts`: "nothing outside tests writes RentalsState.settled" (reads every source file);
  - `finance.api.test.ts`: "Reference 2: bulk office collection".

  The three files alone on the loaded machine passed **82 / 82** (those tests took 3.6 s, 2.6 s and 3.6 s). The
  quiet full run above passed every one. No test was edited.
- Earlier runs: 1,951 / 1,951 on the provider commit, and one rentals timeout on the helper-swap commit (4 / 4 when
  run alone).

New tests in this integration: `integration-seams.test.ts` (13), `registry.integration.test.ts` (4),
`tests/e2e/int-ew1.spec.ts` (7), `tests/evidence/intew1.evidence.spec.ts` (7). E.7's no-oracle test was
strengthened (`d8de2df`, test only, F-INT-W1-19).

## 3. Mutation re-runs

Runner: `test-results-ew1/scratch/mutate.cjs`, a copy of E.0's.
- Each mutant's `find` must occur exactly once.
- The file is restored after each mutant, and its SHA-256 is compared.
- No build or commit ran during a set.
- Mutants whose code the integration moved onto E.0's canonical helpers were re-anchored to the same break in the
  canonical code (`mut-reanchor.cjs`), run against the same area tests plus the seam tests.

All anchors were checked valid on `d8de2df` (`mut-check.cjs`). Every file was restored with a matching SHA.

| Set | Caught | Survivors (reason) |
|---|---|---|
| E.0 (51) | **51 / 51** | — (run on `f57d31b`; no E.0 mutant touches what changed after it) |
| E.1 (19) | **18 / 19** | M4 "assignee need not hold the project": equivalent, as on E.1's branch (the effective-access decision already enforces the assignee's project) |
| E.2 (20) | **20 / 20** | — |
| E.7 (20) | **19 / 20** | M18 "replay skips the scope re-check": equivalent, as on E.7's branch (`journalOf`/`entityOf` authorise the record before the key is read). **M10 "record of another entity readable" survived the first re-run.** Its test had gone vacuous under the reconciled roster (F-INT-W1-19). It is caught after `d8de2df` |
| E.13 (18) | **18 / 18** | — |
| B10 (2) | **2 / 2** | — |
| Integration seams (15) | **15 / 15** | — (S01–S04 registry scope and single registration; S05, S06, S15 roster, maker ≠ checker, retired `storage.manage`; S07–S10 `requiresAll` and F-3 on the pipeline, owners and lead documents; S11 `entityWhole`; S12–S13 task kinds; S14 the one hold projection) |

## 4. Browsers (production build, previews on both loopbacks, 3 workers, retries off)

Every browser run below ran on AC power. Power was recorded at the start and end of each step (`power.ps1`).
- The first attempt (2026-11-17 20:23Z) is **not counted**. It started on battery, and was stopped within 7
  minutes. It was also built without `VITE_OFFICE_ORIGIN`/`VITE_CUSTOMER_ORIGIN`, so the customer app's demo bridge
  pointed at :5173 and the cross-app specs (credit notes, collections) failed. `build.sh` now sets both, as
  `playwright.config.ts` does for an offset run. `serve-check.sh` checks the bridge, and `final.sh` refuses to start
  on battery.
- The PC then slept from about 00:26 to 07:34Z. The run below started from scratch after it woke, on AC.

### 4.1 The complete Chromium run (build of `d8de2df`, 2026-11-18 07:39:51–08:54:55Z)

| | Result |
|---|---|
| Tests | **728: 725 passed, 3 failed** (605 e2e, every historical spec; 123 evidence) |
| Evidence specs | gatee0, gatee1, gatee2, gatee7, gatee13, uxb10, **intew1**, gates3, uxb1, uxb2, cnidem, ints3b, gatebfinal, gated1 |
| axe | **1,835 scans, 50,564 rule passes, 0 violations** |
| Power | start PowerOnline True (charging, 7 %); end True (67 %) |

The three failures had one cause. In the CRM unit quick view at 320 px with 200 % text, the amount strip broke its
figure: "548,975.00" ran over 2 lines in a 212 px column. The failing tests were `int-ew1.spec.ts:85` (Urdu) and
`intew1.evidence.spec.ts:41` (English and Urdu). Earlier, the 111 px of sideways scroll from Lead 360's e-mail had
failed that test before this check could run. Fixed in `97474f8` (§4.2, F-INT-W1-20).

Includes everything the Wave 1 branches added: e0-foundation, e1-crm, e2-projects, e7-ledger, e13-workspaces, the
B10 reflow and focus specs, int-ew1 (7). It also covers EN/UR RTL, dark mode, 320 px at 200 %, and the focus-ring
metrics (Issue #20 `ring-edges`, B10 dialogs).

### 4.2 After the fix (build of `97474f8`, 09:08:47–09:16:22Z, AC 77 % → 83 %)

Every spec that renders the unit quick view, the only screen using `AmountStrip wrap`, was rerun:
`int-ew1`, `a11y`, `crm`, `e0-foundation`, `e2-projects`, and the `intew1` and `gatee0` evidence.
- **70 / 70 passed**.
- axe: 257 scans, 6,908 rule passes, 0 violations.

The change is opt-in, and no other screen passes `wrap`, so the complete run's other 655 results stand for
`97474f8`. A complete re-run was not repeated: Agent 2 was waiting for the lock.

### 4.3 Gate C.2 video specs (test-only commit `36896f1`), 08:54:57–08:56:22Z

`video: phone at 200 % in Urdu …` and `video: resident pays A-101 on a phone …`: **2 / 2 passed**, retries off.

### 4.4 Firefox and WebKit smoke (every smoke spec), 08:56:25–09:03:28Z, AC 68 % → 73 %

**98 / 98 passed**: Firefox 49 / 49 and WebKit 49 / 49. This includes the e1, e2, e7, e13 and uxb10 smoke specs the
Wave 1 branches added.

### 4.5 Known intermittents, rerun alone (not edited, not suppressed), 09:03:30–09:07:07Z

| Test | Repeats | Result | Rate |
|---|---|---|---|
| Chromium `tests/e2e/identity.spec.ts:327` (preset colours) | 10 | **10 / 10 passed** | 0 / 10 |
| WebKit `tests/smoke/s2a.smoke.spec.ts:52` (a new guard) | 20 | **18 / 20 passed**; both failures: a `listbox` still open after a choice (20 s) | **2 / 20 (10 %)** |

Both passed in the complete runs above. The WebKit rate matches the known S.2a listbox intermittent.

### 4.6 Evidence of other gates

The evidence specs rewrote 539 accepted PNGs in other gates' folders: gate-b-final 129, gate-d1 119, gate-e13 96,
gate-e7 77, gate-e1 60, gate-e2 17, ux-b2 10, ux-b1 9, gate-e0 6, gate-s3 6, integration-s3-b1-b2 5,
cn-idempotency 3, gate-c2 2 (videos). The fix run rewrote gate-e0's 6 again. **All were restored from HEAD and none is
committed.** `git status` afterwards shows only this folder.

### 4.7 Screenshots (`docs/status/integration-e-wave1/screenshots/`)

- 18 PNGs. `png-widths.cjs`: 0 whose width differs from its name (1440, 390 and 320 px).
- Reviewed by eye: the quick view at 320 px / 200 % in Urdu and English (title `LH-A-0102` whole). Both strips were
  also captured scrolled into view (a scratch capture, not committed): the icon, the label, "Rs", and the figure
  `2,195,900.00` whole.
- Also reviewed: the work queue at 320 px / 200 %, Project 360's Documents tab in dark mode at 390 px, and the
  ledger clerk's Accounting menu and bank refusal.
- The evidence PNGs are from the fixed build (§4.2).

## 5. Summary against Issue #25's test list

| Required | Result |
|---|---|
| typecheck, ESLint, logical CSS, i18n parity, register sync | green (§1) |
| All Vitest, no unexplained timeout | 1,951 / 1,951; the load timeouts are explained and pass alone and in the quiet full run (§2) |
| All historical Chromium E2E + the six branches' evidence, retries off | 725 / 728, then the 3 failures fixed and their specs 70 / 70 (§4.1, §4.2) |
| Firefox and WebKit smoke | 98 / 98 (§4.4) |
| axe; EN/UR RTL; dark mode; 320 px at 200 %; focus metrics | 0 violations in 2,092 scans; covered in the specs above |
| Screenshot review and repair | §4.7; one repair (F-INT-W1-20) |
| Mutation re-runs | E0 51/51, E1 18/19, E2 20/20, E7 19/20, E13 18/18, B10 2/2, seams 15/15 (§3) |
| B10 | its 2 mutants caught; its specs green. The two obsolete C.2 video specs were repaired in a separate test-only commit and pass (§4.3). B10's own 712 / 717 is **not** reported as green: this run is a separate, complete run on the integrated code |
