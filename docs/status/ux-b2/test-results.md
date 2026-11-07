# UX batch B2: test, accessibility and localisation results

Only tests that were actually executed are reported, with every interim failure. The Issue #20
follow-up (7 November 2026) comes first; the original B2 results (6 November) follow unchanged.

## Issue #20 follow-up: final results (the committed code)

**Machine.** Ports 6373–6375 (`E2E_PORT_OFFSET=1200`), production builds served on 127.0.0.1 and ::1,
each listener checked to be this worktree's current build.
- While agent B held `D:\laragon2\www\.e2e-busy` (from 22:11Z until it released it), my browser work was
  single-spec with 1 worker.
- I held the lock from 23:18:14Z to 00:01:22Z.
- The laptop was on AC for both long runs; CPU 8 % at the start of the combined run.

| Check | Command | Result |
|---|---|---|
| Build | `build.sh` (three apps) | OK |
| Built CSS | `test-results-b2/scratch/css-layers.cjs` on each app's bundle | `:focus-visible,[data-focus-visible]{--tw-outline-style:solid}` at top level, unlayered, in all three; `.outline-none` and the focus utilities in `@layer utilities`; the container rule in `@layer base` |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical CSS, i18n parity) | `npm run lint` | clean; 2 locales × 26 namespaces, 10,296 keys each (no new keys) |
| Unit and component | `npx vitest run` | **1,536 / 1,536** (55 files), 33 s. New since B2: 5 tests in `MetricCard.test.tsx` (S.3 patterns EN and UR, displayed value, untouched contexts, N-B2-5) |
| **Complete combined Chromium run** | `E2E_PORT_OFFSET=1200 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/uxb2.evidence.spec.ts --workers=3 --retries=0 --reporter=list,json` | **472 / 472** in 38.2 min: every gate's e2e (400), `ux-b2.spec.ts` (32), `ux-b2-focus.spec.ts` (24), B2 evidence (16). No failure, flaky test, retry or skip |
| Axe | from that run's JSON | **1,464 scans, 40,493 rule passes, 0 violations** (focus spec: 6 scans, 0) |
| Firefox + WebKit smoke (full) | `--project=firefox-smoke --project=webkit-smoke --workers=3 --retries=0` | **56 / 56** in 3.5 min: **Firefox 28 / 28, WebKit 28 / 28** |
| Evidence | `docs/status/ux-b2/screenshots` | 48 screenshots (18 new: r01–r09 keyboard focus, EN and UR). Widths checked; phone and 200 % shots looked at. Three B2 screenshots were re-written by the run: t01 ×2 now show one ring instead of two; m03 Urdu has a tiny rendering difference. `git status docs/status` shows changes only under `ux-b2/` |

Known intermittents in this round: D.1 `identity.spec.ts:327` and WebKit S.2a "a new guard…" both
passed. One pass does not show that either is fixed or that either is caused by the base.

### Ring measurements

Rows are attached to the run's JSON (`rings-*.txt`). For the office (66 rows: EN and UR × 1440 /
390 dark + high contrast / 320 at 200 %):
- **every control: outline solid, 2 px (3 px for the base ring in high contrast);**
- **94–100 % of the ring's pixels change by ≥ 3:1 against the unfocused pixels, median 7.94:1 to
  14.67:1;**
- **no second ring.**

Clipping: only the technician choice in the Urdu drawer at 320 px / 200 % (72 % of its path clipped by
the drawer body, N-B2-3). CRM, HQ and resident controls are asserted at ≥ 90 % (the resident Pay
action ≥ 50 %, by design).

| Engine | Keyboard (header Search, stat tile, drawer choice, tab, resident bar) | Mouse press (stat tile, tab) |
|---|---|---|
| Chromium | focus-visible, solid 2 px, 94–100 % ≥ 3:1 | focused, not focus-visible, no ring |
| Firefox | same (tab 94 %) | same |
| WebKit (Windows build) | same (tab 93 %) | same: the press focuses the control (unlike Safari on macOS) but shows no ring |

Emulated forced colours (Chromium): the office header controls and stat tile still draw their rings.

### Issue #20 interim failures (all of them, in order)

1. Focus spec run 1, 17 / 23:
   - (a) Axe at 390 px in dark + high contrast on the society dashboard: `color-contrast`, 2 nodes (1.92:1). This is **N-B2-7**: the same nodes and ratio appear on the base `04b6fde` (probe on a temporary base worktree, EN and UR). That mode now scans Request 360.
   - (b) Header Search at 320 / 200 % in Urdu: 25 % of ring pixels.
   - (c) Resident bar at 320 / 200 % in English: 77 %.
   - (d) HQ tenant rows are hidden on phones.
2. Run 2, 18 / 23:
   - Round controls had been sampled at four points. The path now follows the corner radius, and each sample takes the strongest of its five-pixel neighbourhood.
   - HQ uses the tenant cards on phones.
   - The Pay action reached 57 % (its raised circle covers the ring).
3. Run 3, 20 / 23: Urdu header Search still 20 %. **Cause:** a right-to-left page that overflows sideways (N-B2-2) is screenshotted shifted from client coordinates. Fixed with a marker. The Pay action threshold became 0.5, with the reason in the test.
4. Run 4, 22 / 23: the Urdu drawer choice at 320 / 200 % reached 28 %. **Cause:** the drawer body clips the choice's ring (N-B2-3). The helper now reports ancestor clipping and samples only the visible part. Clipping is allowed only for drawer controls at 320 / 200 %, and asserted 0 elsewhere.
5. Run 5, 21 / 23: a tab panel taller than the screen had been counted as clipped. Now only ancestor clipping counts.
6. Run 6: 23 / 23. Then the forced-colours test was added: 1 / 1.
7. Smoke (Firefox and WebKit, 1 worker): the WebKit Issue #20 test saw 0 % ring pixels. **Cause:** the WebKit project renders at `deviceScaleFactor` 2; geometry is now scaled by `devicePixelRatio`. Re-run: both engines pass.

No existing test was changed in this round. The B2 smoke and evidence specs gained tests; nothing was
skipped, retried or loosened.

---

# Original B2 results (6 November 2026)

## Environment

- **Builds and ports.** `E2E_PORT_OFFSET=1200` = office 6373, resident 6374, HQ 6375 (5173 + 1200).
  Built with `VITE_OFFICE_ORIGIN=http://localhost:6373 VITE_CUSTOMER_ORIGIN=http://localhost:6374`
  (`test-results-b2/scratch/build.sh`) and served with `vite preview` on 127.0.0.1 and ::1
  (`preview.sh`). Before each browser run the listeners on 6373–6375 were checked to be this worktree's
  previews of the current build.
- **Tools.** Node 20.20.1; Playwright 1.64.1 (Chromium; Firefox and WebKit for the smoke); axe-core with
  the WCAG 2.0/2.1/2.2 A and AA rules; Vitest 4.1.12.
- **Run settings.** Retries off everywhere. Reduced motion and a fixed clock (Monday 26 October 2026,
  16:10 Lahore) in every B2 browser test.
- **Shared machine.** Agent A's full regression held `D:\laragon2\www\.e2e-busy` until 14:20:50Z; until
  then my browser runs were single-spec with 1 worker. I held the lock from 14:20:56Z to 16:52:33Z for the
  final runs below. Other sessions on the PC ran PHP load tests (8 `php.exe`): CPU was 48 % at the start
  of combined run 1 and 18 % at the start of run 2.

## Final results (the committed code)

| Check | Command | Result |
|---|---|---|
| Build | `build.sh` (three apps) | OK, 57 s |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean (103 s) |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 26 namespaces, **10,296 keys** each (base 10,294; 2 new keys, EN and UR) |
| Unit and component tests | `npx vitest run` | **1,531 / 1,531** (55 files) in 95 s. Base: 1,517. New: `MetricCard.test.tsx` 7, `forms.test.tsx` +4, `Tabs.test.tsx` +1, `Dialog.test.tsx` +2. (An earlier full run under another agent's browser load: 1,529 / 1,531, two 5 s timeouts in untouched node suites; those two files re-run alone 78 / 78. See interim 6.) |
| **Complete combined regression, run 2** | `E2E_PORT_OFFSET=1200 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/uxb2.evidence.spec.ts --workers=3 --retries=0 --reporter=list,json` | **445 / 446** in 37.3 min: e2e 431 / 432 (every gate B to S.2b and the S.1 hotfix, 400, plus the 32 B2 tests) and evidence 14 / 14. The one failure is `identity.spec.ts:327` (interim 8): a single non-retrying read of `<html data-palette>` right after a click; it passed in run 1, and 30 / 30 then 60 / 60 when repeated (3 and 6 workers). Its path (BrandingPage, ChoiceCards, DisplayPreferences) has no B2 change. **Not reproduced; pre-existing not proven.** |
| Complete combined regression, run 1 | same command | **443 / 446** in 1.5 h under load: 3 tests **timed out** at 240 s, all in `d2.spec.ts`'s axe sweeps (`D.2 screens in en-PK` office and resident, `ur-PK` office) while `page.goto` or `axe.analyze` was still running; no assertion failed. Re-run alone: 4 / 4 in 165 s. The 32 B2 tests and the 14 evidence tests passed. |
| Axe | from run 2's JSON report (`test-results-b2/scratch/axe-count.cjs`) | **1,458 scans, 40,313 rule passes, 0 violations**. B2 spec alone: 32 scans, 862 passes, 0 violations. (Run 1: 1,390 scans, 0 violations, fewer because of the three timed-out sweeps.) |
| Firefox and WebKit smoke (full) | `npx playwright test --project=firefox-smoke --project=webkit-smoke --workers=3 --retries=0` | **53 / 54** in 178 s: **Firefox 27 / 27**, **WebKit 26 / 27**. The 5 B2 smoke tests pass in both browsers (also 10 / 10 in a separate 1-worker run). The failure: WebKit `s2a.smoke.spec.ts:52` "a new guard…", see below |
| WebKit failure, reproducibility | `--project=webkit-smoke tests/smoke/s2a.smoke.spec.ts -g "a new guard" --repeat-each=20 --workers=3` | **Branch: 8 / 20 pass** (12 fail). **Base `04b6fde` (temporary worktree, same ports, same command): 12 / 20 pass** (8 fail). Every failure on both: line 48, the HR role combobox's listbox still open after the option click. **Pre-existing: proven on the base.** The form's combobox is the HR kit's, not touched by B2 |
| Evidence | `docs/status/ux-b2/screenshots` | **30** screenshots from `tests/evidence/uxb2.evidence.spec.ts` (written again by run 2). Every width equals the viewport in its name (30 / 30 checked); the phone shots were looked at. No other gate's evidence spec ran, so their committed screenshots are untouched (`git status docs/status` shows only `ux-b2/`) |

## B2 tests by finding

e2e = `tests/e2e/ux-b2.spec.ts` (32 tests, Chromium); smoke = `tests/smoke/uxb2.smoke.spec.ts` (5 tests ×
Firefox and WebKit); component = Vitest in `packages/ui`.

| Finding | Tests |
|---|---|
| SH-01 | e2e: 390 px EN and UR (Cancel visible, named "Cancel" / "منسوخ کریں", ≥ 44 × 44 px, at the inline end of the row in each direction; closes; focus back on the header search; Escape; keyboard Enter → Tab → Cancel → Enter; axe); 320 px at 200 % EN and UR (`layoutProblems` on the open palette with results); desktop (no Cancel; Esc hint; Escape and focus); Platform HQ phone; essentials tour's search step left with Cancel. Smoke FF/WK. Evidence s01, s02, d01 |
| OPS-01 | e2e: triage (note kept; closing clears; reopening clean), assign (technician kept), complete and hold (note kept), merge (422 field message) and resolve (summary kept): each refusal is `getByRole('alert')` inside the drawer, focused, in the viewport, and nothing is on the page; close, cancel and hide dialogs: too-short reason refused inside the alert dialog, reason kept, a longer one succeeds and the state changes; Start refused on the page; 320 px at 200 % EN and UR (drawer and dialog `layoutProblems`, axe); dark + high contrast EN and UR. Component: `Dialog.test.tsx` ×2. Smoke FF/WK (triage, close). Evidence o01–o04, d02 |
| SH-02 | Component: `MetricCard.test.tsx` (7). e2e: HQ ARR card `ariaSnapshot` EN and UR, CRM budget card, every society and finance dashboard tile EN and UR (context once, full amount in the name), tiles at 320 px / 200 % EN and UR (value and context inside the tile, value on one line, measured directly). Evidence m01–m03 |
| SH-04 | Component: `forms.test.tsx` ×2. e2e: household empty submit EN and UR (`data-invalid`, message, trigger described; axe; 320 px / 200 %). Smoke FF/WK. Evidence f01, f02 |
| RES-06 | e2e EN and UR: proof form and re-send form (Tab never stops on the file input; Shift+Tab back; Enter opens the picker; file named; axe). Smoke FF/WK |
| SH-10 | Component: `Tabs.test.tsx`. e2e EN and UR: outline solid, ≥ 2 px, ≥ 3:1; no ring after a mouse click; phone in dark + high contrast. Smoke FF/WK. Evidence t01 |
| SH-11 | Component: `forms.test.tsx` (EN, then Urdu). e2e EN and UR: CRM schedule-visit calendar and HQ policy effective date; Next month changes the month; axe. Smoke FF/WK. Evidence c01 |
| SH-12 | Component: `forms.test.tsx` (description, then description + error, `aria-invalid`, still toggles). FormsLab is covered by the existing e2e |

## Existing tests changed

| Test | Change | Why |
|---|---|---|
| `tests/e2e/dashboard.spec.ts:167` ("KPI tiles and inventory rows are links…") | The expected `aria-label` of `kpi-collected` now ends with `, [\d.]+% of Rs\s[\d.]+[KMB] scheduled` | SH-02: the tile's context line is now part of its name, once. The old pattern anchored `$` right after the change in words. This is the correct new accessible name; nothing else in the assertion was loosened. |

No other existing test was changed, skipped, retried or given a longer timeout.

## Interim failures (all of them, in order)

1. Vitest, new `Dialog.test.tsx` test: `rerender()` from `renderWithProviders` drops the providers, so the dialog's state was lost. Test-harness bug; the harness now sets the refusal from `onConfirm`. Re-run 4 / 4.
2. `tsc`: the new consent schema in `forms.test.tsx` used `z.literal(true)` (resolver type clash with the boolean default). Typing fixed (`z.boolean().refine`). Re-run 8 / 8.
3. `ux-b2.spec.ts` run 1 (1 worker): 22 / 32. (a) palette and tile tests also asserted no page-level sideways scroll; the society dashboard itself scrolls 21 px (EN) / 6 px (UR) at 320 px / 200 % because of two older nowrap links (observation N-B2-2); those B2 tests now check the palette and each tile. (b) the close dialog at 320 px / 200 % was 409 px wide **with no refusal** (pre-existing): footer buttons nowrap → fixed. (c) SH-10: panel focused, but `outline-style: none`: Tailwind 4 `outline-none` + `outline-2` draws nothing → `outline-solid` added (observation N-B2-1). (d) the phone tab row ends with "More", so the dark-mode test tabs up to three times.
4. `ux-b2.spec.ts` run 2: 30 / 32; the close dialog still 409 px wide: the reason `TextArea`'s 20-column intrinsic width set the dialog's minimum → `w-full`. Re-run 2 / 2.
5. Evidence review of the phone shots: the first tile fix (let the value wrap) broke tokens joined by no-break spaces mid-word ("Rs 355." / "8K"; Urdu "ہ" / "زار"), which `layoutProblems` missed (aria-hidden text, and a word wider than 75 % of the column). Replaced by a size cap (`min(var(--text-3xl), 19cqi)`), nowrap kept, and the tile test now measures value and context directly. Re-run 4 / 4; evidence re-shot.
6. Full Vitest during Agent A's browser run: 1,529 / 1,531; 5 s timeouts in `finance.api.test.ts` ("Saba collects 4 cash lines…", 5,493 ms) and `community.test.ts` ("5,000 random small polls", 7,676 ms). Re-run alone 78 / 78; final full run 1,531 / 1,531.
7. Combined run 1: 443 / 446, three `d2.spec.ts` axe sweeps timed out under load (above). Re-run alone 4 / 4.
8. Combined run 2: 445 / 446, `identity.spec.ts:327` intermittent (above). Not reproduced in 90 repeats.
9. Full smoke: WebKit `s2a.smoke.spec.ts:52` (above), pre-existing on the base.

## Localisation

Two new keys, both languages: `common:calendar.previousMonth` ("Previous month" / "پچھلا مہینہ") and
`common:calendar.nextMonth` ("Next month" / "اگلا مہینہ"). Urdu wording to a native reader. The palette's
Cancel reuses `common:actions.cancel`. Every B2 browser test runs in English and Urdu (right to left).

## What the automated checks do not cover

No screen reader was run (see MANUAL_VERIFICATION.md, status "not performed"). Axe and role/name queries
are not a WCAG certification.
