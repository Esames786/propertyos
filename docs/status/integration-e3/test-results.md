# E.3 pricing integration: test results

Branch `integration/e3-wave1-claude`. Each run records its head, its power state and its numbers. Nothing is rounded.

## Power log

Power is checked with `PowerOnline` and `Win32_Battery.EstimatedChargeRemaining`.

| UTC | PowerOnline | Charge | Used for |
|---|---|---|---|
| 2026-11-18 21:24 | False | 63 % | Own specs, 1 worker: e3qa-denied + e3qa-links (24 / 24) |
| 2026-11-18 21:46 | False | 44 % | No browser run (below 50 %) |
| 2026-11-18 21:55 | False | 37 % | Pre-regression checkpoint `ad3fac5` pushed; waited for AC |
| 2026-11-19 05:10 | True | 4 % | AC back (the machine slept overnight on battery) |
| 2026-11-19 05:16 | True | ≈5 % | Full Vitest |
| 2026-11-19 06:37 | True | 20 % | Chromium targeted run, start (lock held 06:37:35–06:57:38) |
| 2026-11-19 06:50 | True | 29 % | Firefox + WebKit smoke, start |
| 2026-11-19 06:57 | True | 35 % | End of the targeted run |
| 2026-11-19 07:11 | True | 46 % | Final checks done; previews stopped |

## Static checks (head `5800bba`; later commits change tests and docs only)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` (ESLint, logical CSS, i18n) | exit 0. i18n: 2 locales × 32 namespaces, 12,936 keys each, parity OK |
| Register (`npm run register:sync`) | 139 BUILT / 83 PARTIAL / 140 PLANNED (as expected for the E.3 candidate) |

## Vitest (full, head `5800bba`)

The run was not quiet: Agent 3's browser run held the CPU.

| Run | Result |
|---|---|
| `npx vitest run` | **2,091 / 2,092** in 92 files. One 5 s load timeout: `society/finance/finance.api.test.ts` › "Saba collects 4 cash lines and 1 cheque …" |
| That file rerun alone | **17 / 17** |

## Chromium targeted run (Playwright build of `52fdd4b`; lock held; 3 workers; retries off)

Specs:
- every `e3-*` and `e3qa-*` spec;
- the evidence specs `e3qa.evidence` + `e3int.evidence`;
- register, e0-foundation, int-ew1, e13-workspaces;
- the specs covering the changed shared files: e1-crm and e2-projects (idempotency.ts, routes and handler registries), e7-ledger, and access (permission catalogue, MyAccess labels, access outcome).

**220 / 221** in 12.5 minutes. axe: **307 scans, 0 violations** (E.3 specs: 74 scans, 0).

| Spec | Passed |
|---|---|
| access | 10 / 10 |
| e0-foundation | 7 / 7 |
| e1-crm | 14 / 14 |
| e13-workspaces | 22 / 22 |
| e2-projects | 19 / 19 |
| e7-ledger | 17 / 17 |
| int-ew1 | 8 / 8 |
| register | 16 / 16 |
| e3-* (GPT, 7 files) | 16 / 16 |
| e3qa-authorized | 9 / 9 |
| e3qa-conflict | 5 / 5 |
| e3qa-denied (new) | 6 / 6 |
| e3qa-discount (new) | 2 / 2 |
| e3qa-editors | 19 / 19 |
| e3qa-keyboard | 5 / 5 |
| e3qa-links (new) | 17 / 18 (see below) |
| e3qa-quality (7 screens × EN/UR × 1440 / 390 / 320 @ 200 % / dark; layout + axe) | 10 / 10 |
| e3qa-reflow (new) | 3 / 3 |
| evidence e3qa | 9 / 9 |
| evidence e3int (new) | 6 / 6 |

**The one failure was a test defect, not an app defect.**
- The test was "unit links go to E.2's unit quick view". It asserted the intermediate address `/inv/unit-quick-view?record=…`.
- E.2 resolves that address to `/inv/unit-matrix?project=prj_heights&unit=…`, with the unit's quick view open. At 1 worker the test had won that race.
- Fixed in `405129b`: the test waits for the final address and checks that the quick view shows the same unit.
- After the fix it passed 1 + 3 repeats. The whole `e3qa-links` spec then passed **18 / 18** on the Playwright build of `6eb1ae2` (1 worker).

## Firefox + WebKit smoke (same build; 3 workers; retries off)

**98 / 98** in 6.9 minutes.

## Normal build: test-only principals absent (head `6eb1ae2`)

Checked with `scripts/check-test-principals.mjs`, after a build without `PROPERTYOS_E2E_PRINCIPALS`.

| Build | Files scanned (sourcemaps) | Hits |
|---|---|---|
| backoffice, normal | 479 (216) | **0** |
| customer-web, normal | 120 (37) | **0** |
| platform-hq, normal | 114 (34) | **0** |
| backoffice, Playwright build (`--expect-present`) | 479 (216) | Present: every id, principal id and display name, in `index-*.js` and its `.map` only |
| customer-web / platform-hq, Playwright build | 120 / 114 | 0 |

There are 28 needles, read from `test-principals.ts`:
- `E3QA`, `e3qa`, `E3 QA`, `usr_e3qa`, `res_e3qa`;
- the 5 ids, the 4 principal ids and the 4 display names;
- the 6 exported names;
- `@repo/fixtures/testing`, `fixtures/src/testing`, `test-principals`, `build-personas.e2e`.

## Mutations (each file restored byte-identical, SHA-256 checked)

**Vitest: 26 / 29 caught.**
- The re-targeted guards (V02, V04, V06, V07, V13, V17, V19, V22) and the new V26–V29 are all caught:
  - V26: the build swap made unconditional;
  - V27: stale reported as key reuse;
  - V28: the key format back to 100 characters;
  - V29: replay returns today's draft.
- Three equivalent survivors, the same three as at `74241b0`:
  - **V03:** replay's re-lookup through the creator / scope check. The same checks run earlier on every path.
  - **V12:** the excessive-discount guard. `fromPaisa` refuses the negative payable.
  - **V16:** per-project `pricing.manage` in the plan preview. It is redundant with `unit.view` under today's access model.

**Browser: 9 / 9 caught** (backoffice rebuilt for each mutant, 1 worker):

| Mutant | What it breaks |
|---|---|
| B05 | Drawer refusal removed |
| B15 | Address not updated |
| B16 | Generic error instead of the one not-found |
| B17 | Shell check not warmed (remount, confirmation and focus lost) |
| B18 | Back / Forward do not reset the editor |
| B19 | COM screens fall back to the planned page |
| B20 | Drawer asks for drafts without `pricing.manage` |
| B21 | No minus sign |
| B22 | Select text truncated again |

## Evidence

`docs/status/integration-e3/screenshots`: 76 PNGs. Every width matches its name (checked).
- 60 are the seven-screen set: EN/UR at 1440 and 390, at 320 with 200 % text, and dark.
- 16 show the integration's own states: denied outcomes, a draft link and its not-found, the COM-004 deduction rows, and a select at 320 with 200 % text with keyboard focus.

The reviewed local-validation set (`gate-e3-local-validation/screenshots`) is unchanged.

Reviewed by eye:
- `denied-com-001-1440-en`, `denied-inv-007-drawer-390-ur`;
- `link-com-003-not-found-1440-en`;
- `discount-com-004-preview-390-en` and `-ur`;
- `select-com-001-project-focus-200pct-320-ur`.
