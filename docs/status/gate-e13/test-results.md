# Gate E.13 — test results

Branch `feature/gate-e13-connected-workspaces` (from `373d0cf`). Production builds served on 7773–7775
(E2E_PORT_OFFSET=2600) on both 127.0.0.1 and ::1; retries off. Six agents share the PC; the laptop ran on
battery and slept 19:40–21:14 PKT (empty battery) during the slice; complete browser runs were made on AC
holding the shared lock.

## Static checks
- `npm run typecheck`: 0 errors.
- `npm run lint`: ESLint clean; logical CSS clean; i18n parity OK (2 locales × 28 namespaces, 11,375 keys each).
- `npm run register:sync`: 449 rows, 362 distinct screens — 139 BUILT, 54 PARTIAL (+11 E.13), 169 PLANNED.

## Unit / API (Vitest)
- E.13: `developer/workspace/workspace.api.test.ts` 21 and `developer/documents/documents.api.test.ts` 17 —
  **38 / 38**.
- Complete `npm test` (final code, quieter machine): **64 files, 1,720 / 1,720 passed.** (Earlier runs under the full load of six agents hit 5 s timeouts in society/payroll API tests; see the load note.)

## Mutation checks (`test-results-e13/scratch/mutations.cjs`)
Each mutant breaks one guard, the two E.13 API test files run, the file is restored and SHA-256 checked
(byte-identical every time). **18 / 18 caught.** M17 (expiry window) survived the first pass; the expiry
test now also asserts that 35 days is "valid", and it is caught. M7 and M13 were first invalid mutants
(duplicate import); re-run as valid mutants, both caught by assertions.

| # | Guard broken | Caught by |
|---|---|---|
| M1 | a document visible without its linked record | unknown = hidden; Plaza licence; narrow vs full |
| M2 | every document listed | controller vs clerk lists; narrow vs full; revocation |
| M3 | document activity not re-resolved | narrow vs full; activity projection |
| M4 | template visible to every document reader | clerk never sees the Gardens checklist |
| M5 | shared rule (site scope) not applied to project records | revocation of documents; revocation of favourites |
| M6 | saved lists keyed by session only | per-person lists; session binding |
| M7 | saved entries shown without re-resolving | revocation hides favourites; withdrawn rentals add-on |
| M8 | a new session keeps older lists | session binding |
| M9 | a hidden document answers 403 | unknown = hidden (3 tests) |
| M10 | a key replays for another person | bound idempotency (another person) |
| M11 | a key replays for another input | bound idempotency (another input) |
| M12 | the drafter may approve | maker ≠ checker |
| M13 | any record of the tenant may be attached | Gardens lead unknown to the clerk; validation order |
| M14 | the resident app may use the workspace | office app only |
| M15 | other people's follow-ups listed as mine | Bilal's tasks are his own |
| M16 | a second pending draft allowed | one draft at a time |
| M17 | the 30-day expiry window ignored | expiry counts (after the added assertion) |
| M18 | hidden units found by search | Bilal never finds a Gardens unit; narrow vs full |

## Browser
### Final run on HEAD `34864b8` (code as of `5313fe7`; later commits are docs only)
Lock held 23:44:00Z–00:33:27Z (8–9 Nov), on AC (100 %, no sleep or resume events). Previews of that build on
7773–7775, both loopbacks checked byte for byte. Same configuration as the first run: every e2e spec plus the
`gatee13`, `stage1` and `gatebfinal` evidence specs, 3 workers, retries off. Output:
`test-results-e13/final2-*`.
- **Complete Chromium run: 547 passed, 0 failed, 14 skipped** in **44.5 min**. The 14 skipped tests are
  `stage1.evidence.spec.ts`, which skips itself by design. Axe: **1,642 scans, 45,335 rule passes,
  0 violations**; the E.13 spec ran 36 scans with 0 violations. The `access.spec.ts:28` failure from the first
  run is gone.
- **Evidence files after the run:**
  - Accepted `stage1` and `gate-b-final` evidence was restored with `git checkout`; nothing changed outside
    `gate-e13`.
  - Two `gate-e13` PNGs were rewritten (`e13-upload-drawer-1440-en`, `-errors-1440-en`). They look identical and
    differ by under 300 bytes (rendering noise), so they were discarded and not re-committed.
- **Full Firefox + WebKit smoke: 77 / 78** in 4.2 min. Firefox passed every test. WebKit had one failure:
  `s2a.smoke.spec.ts:52` "a new guard…", one of the two known intermittents.
  - **Symptom:** at line 48 the list stayed open for 20 s after the click on the "Security guard" option (HR
    role search).
  - **Rerun with `--repeat-each`** (WebKit, 3 workers, retries off, under the lock):
    - this build, `--repeat-each=10`: 6 / 10 failed;
    - this build, `--repeat-each=20`: 11 / 20 failed.
  - **A/B against the untouched base `373d0cf`** (same machine, ports and settings, minutes later, base build
    served on both loopbacks with no E.13 chunk): **11 / 20 failed**.
  - All 28 failures have the same signature (`pick` → `listbox` count 1).
  - **Cause:** the WebKit flake that predates E.13 (recorded in S.1 hotfix, S.3 and the integration of
    S.3/B1/B2). The failure rate on this branch equals the base rate, and E.13 changes no HR, roster or combobox
    code. On the HR page `useRecordVisit` sends nothing because there is no record in the address.

### First run (build of `4f56461`, before the palette fix)
**Complete Chromium run** (lock held 21:56:59–22:51:26Z, on AC; build of `4f56461`; every e2e spec + evidence
`gatee13`, `stage1`, `gatebfinal`; 3 workers, retries off; `test-results-e13/final-e2e.log`, `.json`):
**546 passed, 1 failed, 14 skipped** (all 14 = `stage1.evidence.spec.ts`, skipped by design: "historical
evidence, not re-run") in **49.5 min**. Axe: **1,642 scans, 45,335 rule passes, 0 violations** (E.13 spec: 36
scans, 0 violations).
- The one failure was caused by E.13: `access.spec.ts:28` (Shalimar's palette) found two menu items named
  "Operations" — the screen and the new "Search everywhere for “Operations”" action (Playwright matches names by
  substring). **Fix `5313fe7`:** the action's accessible name is now "Search everywhere"; what was typed is its
  description, so it never takes the name of a screen or record. Re-run on the fixed build (one worker, lock
  then held by Agent D): `access.spec.ts`, `command-palette.spec.ts` and `e13-workspaces.spec.ts` —
  **39 / 39 passed** (5.4 min; `test-results-e13/rerun.log`).
- `gatebfinal` and `stage1` evidence ran because the palette (with a query) is in their screenshots; their
  accepted PNGs and videos were restored afterwards (`git checkout`; tree clean outside `gate-e13`).

**Full Firefox + WebKit smoke** (same lock, all smoke specs incl. `e13.smoke.spec.ts`): **78 / 78 passed in
4.1 min.** Known intermittents (`identity.spec.ts:327`, WebKit `s2a.smoke.spec.ts:52`) did not fail.

**E.13 spec on its own** (development runs, one worker): `tests/e2e/e13-workspaces.spec.ts` 22 tests (positive
journeys 7, access/scope/partitioning 4, input/duplicates/refusals 3, keyboard 2, accessibility 6: axe at 1440 px
EN/UR incl. the upload drawer, 320 × 700 at 200 % text EN/UR incl. keyboard walks, dark mode 390 px EN/UR);
`tests/smoke/e13.smoke.spec.ts` 4 tests × Firefox, WebKit; `tests/evidence/gatee13.evidence.spec.ts` 9 tests,
101 PNGs in `screenshots/` (every width matches its name; `png-widths.cjs`).

Defects the browser runs found and fixed during the slice: a double press of "Upload" created two documents
(one submit per form now; the server's bound key alone cannot stop a second logical create after the first
succeeded); references, titles and file names broke mid-word or overflowed at 320 px / 200 % (word joiners,
`inline-block` references, wrapping buttons and row actions); a file size read backwards inside Urdu (now
isolated left-to-right); the related panel counted the open document itself.

## Load note (Vitest)
Under the combined load of six agents, some society/payroll API tests exceed Vitest's 5 s per-test timeout.
A/B timing (`test-results-e13/scratch/timing-ab.sh`, same load, alternating runs): `finance.api.test.ts`
timed out the same way **with the E.13 handlers unregistered** (25.5–25.8 s of tests without, 21.4–30.2 s
with): load, not E.13. `handlers.ts` restored byte-identical.
