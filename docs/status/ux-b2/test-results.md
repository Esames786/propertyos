# UX batch B2: test, accessibility and localisation results

**Run date:** 6 November 2026. Only tests that were actually executed are reported, with every interim failure.

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
