# Gate S.2a: test, accessibility and localisation results

**Run date:** 2026-11-03. Only tests that were actually executed are reported.

**Issue #14 closure (the current code, `d7cb324`):** the results on the final code are in [§ Issue #14 closure results](#issue-14-closure-results-final-code) at the end.

**Earlier runs:**
- **Issue #12 closure** (`0e14895`): [§ Issue #12 closure results](#issue-12-closure-results-final-code).
- **The gate** (`95d70d0`): the sections before both.

**Environment:**
- **Builds and ports.** Production builds of all three apps on isolated ports: `E2E_PORT_OFFSET=400` (office 5573, resident 5574, HQ 5575). Built with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`, and served on both 127.0.0.1 and ::1.
- **Tools.** Node 20.20.1. Playwright: Chromium, plus Firefox and WebKit for the smoke. axe-core with the WCAG 2.0/2.1/2.2 A and AA rules.
- **Run settings.** Retries off, 3 workers. Reduced motion and a fixed clock in every S.2a test (business date Monday 26 October 2026).
- **Shared machine.** It was under heavy load from other work (about 99 % CPU, from processes that are not mine; I did not touch them). I restarted only my own servers.

## Summary (`95d70d0`, before Issue #12)

| Check | Command | Result |
|---|---|---|
| GPT's foundation as received (`311dfb5`) | `npx tsc -p tsconfig.json --noEmit`, `npm run lint`, `npx vitest run` | clean; **1,345 / 1,345** |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **25** namespaces (new: `hr`), **9,867 keys** each |
| Unit and API tests | `npx vitest run` | **1,417 / 1,417** in 46 files. The 72 new tests:<br>• `hr.test.ts`: 52 cases from `hr-roster.vectors.json` (shift windows across month and year end, overlap, lateness, multi-site and leave blocks, coverage, document expiry, instalment plans, CNIC and phone);<br>• `hr.api.test.ts`: 20 tests through the fail-closed mock server.<br>Also updated: `community.api.test.ts` (Staff tab) and `platform.test.ts` (Al-Noor's selection with HR; price unchanged) |
| Register | `node scripts/sync-screen-register.mjs` | **439 rows, 354 distinct: 131 built, 36 partial, 187 planned** (D.3: 437 / 353; 122 / 35 / 196). Every earlier ID and address preserved |
| **Full combined regression** | `E2E_PORT_OFFSET=400 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gates2a.evidence.spec.ts --workers=3 --retries=0` | **382 / 383** in one 38.2-minute run:<br>• **e2e 369 / 370** (every gate, B to S.2a; D.3 had 347);<br>• **evidence 13 / 13**.<br>The one failure was a D.3 expectation that S.2a changes by design ([below](#the-one-failure-in-the-full-run)). It was corrected and its spec re-run in full: **25 / 25** on the same build |
| S.2a end-to-end | `tests/e2e/s2a.spec.ts` (inside the full run) | **23 / 23** |
| Accessibility (inside E2E) | axe in every spec that scans | **1,291 axe scans, 35,656 rule passes, 0 violations**; `s2a.spec` had 111 of them |
| Evidence | `tests/evidence/gates2a.evidence.spec.ts` (inside the full run) | **13 / 13**: **67 screenshots** and **2 videos**. The width of every screenshot was read from its PNG and matches its viewport (the three element captures are narrower by design) |
| Firefox and WebKit smoke | `E2E_PORT_OFFSET=400 npx playwright test tests/smoke --project=firefox-smoke --project=webkit-smoke --workers=3 --retries=0` | **36 / 36**: all 18 smoke tests (C.2 3, D.2 4, integration 3, D.3 4, **S.2a 4**) in both browsers |
| Manual screen reader, devices, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed:** needs a person and devices |

### The one failure in the full run

`d3.spec.ts:546`, "D.3 without the add-ons". With chat and the hub withdrawn, the test expected the Community home's tabs to be exactly `notices`. They were `notices,staff`.

- **Why the new value is correct.** Al-Noor also holds the separate HR add-on. The brief requires the residents' Staff on duty tab to be independent of Community Chat and the Hub, and `s2a.spec` asserts exactly this case.
- **The change.** The expectation in `d3.spec.ts` and the same line in `d3.smoke.spec.ts` now read `notices,staff`, with a comment. The check is still an exact match, so polls, services and resources must still be absent.
- **Re-run.** `tests/e2e/d3.spec.ts` alone on the same build: **25 / 25**. The smoke above includes the corrected D.3 smoke test.

## What the tests found during the gate, and what changed

The first S.2a spec run (13 passed, 10 failed) and the 320 px diagnostic found these. Each was fixed in the product, or the test was corrected where the test itself was wrong; no assertion was weakened.

| Found | Kind | Fixed |
|---|---|---|
| The Employee 360 "Request leave" button and the leave list shared one test id | product (ambiguous id) | button renamed `hr-360-request-leave` |
| Stacked links in the corrections list were under 24 px apart (axe `target-size`) | product (accessibility) | name and date links are at least 24 px tall |
| At 320 px: the new-employee form, the employee filters and every tab row ran past the screen; tab labels such as "Attendance corrections (2)" did not fit even alone at 200 % | product (layout) | single-column grids; **shared** `UrlTabs` wrap; **shared** `SelectControl` values wrap |
| At 320 px / 200 %: night-shift times, a dashboard button, a reference ("ANR-AD-" / "0002") and hyphenated words broke or spilled | product (layout) | times wrap only between whole times; labels wrap in the button; references kept whole; wording without hyphens |
| Urdu: "7:00 AM – 3:00 PM" was shown as "AM – 3:00 PM 7:00" (found in the evidence review) | product (bidi) | each time isolated; ranges flow in the page's direction |
| The advance test's voucher approval failed | test | the page's mock server acts for the persona it was opened as; the treasurer now opens a page before deciding |
| The 320 px test expected 16 px body text in the office | test | the office's body text is 14 px (15.12 in Urdu); the test checks the chosen size multiplies it |
| The phone evidence looked for a desktop roster cell | test | the phone roster shows one day; the capture chooses Friday first |

After these fixes, the whole S.2a spec plus a diagnostic over every S.2a screen passed: 29 / 29, then 36 / 36 together with the evidence. Then came the full run above.

## S.2a end-to-end tests (`tests/e2e/s2a.spec.ts`)

| # | Test | What it proves |
|---|---|---|
| 1 | Reference flow 1 | validation, duplicate CNIC, Employee 360, the night shift, the supervisor's check-in, Employee 360 on duty; axe on each step |
| 2 | Flow 2, the week | warnings, pending leave asked first, swap, removal with a reason, publish, next week from draft to published |
| 3 | Flow 2, On duty now | late and absent, short-staffed, suggested replacement brought in, next shift |
| 4 | Flow 3 | recording ≠ approving; nobody decides their own; approved leave becomes a roster gap; the administrator decides the manager's own correction |
| 5 | Leave from Employee 360 | no balance calculated; duties covered listed |
| 6 | Documents | simulated upload clears the warning; numbers masked |
| 7 | Advances | evidence required; maker ≠ checker; "approved — not paid"; paid out only by linking a voucher prepared, approved and posted through S.1 |
| 8 | Who sees what | supervisor: roster and attendance only; finance: advances only; technician: nothing |
| 9 | Without the add-on | "not in your plan"; no residents' tab |
| 10 | Developer organisation | HR stays the planned screen (Gate E) |
| 11 | Residents | roles and posts, names only with consent, nothing personal; works with chat and the hub withdrawn; axe |
| 12–13 | Screens in en and ur | axe at 1440, 768 and 390 px on 14 office screens and the residents' tab; no sideways scroll |
| 14–19 | 320 × 700 at 100, 150 and 200 %, en and ur | element-level layout checks on 14 screens, the assign drawer and the residents' tab |
| 20–21 | Dark mode with high contrast, en and ur, 390 px | axe and layout on the roster, On duty now, Employee 360, leave and advances |
| 22–23 | Keyboard at 320 px / 200 %, en and ur | every control of the roster, On duty now and Employee 360 reachable, never under the header or bar |

## S.2a smoke (`tests/smoke/s2a.smoke.spec.ts`, Firefox and WebKit)

1. A new guard: validated, refused as a duplicate, saved, given tonight's night shift, and on the roster.
2. On duty now: an absent guard is marked and covered, and the shift is no longer short.
3. Corrections: the supervisor asks, the manager decides, and nobody decides their own.
4. At 320 px with 200 % text in Urdu: the roster, On duty now and the residents' Staff on duty are not clipped or broken.

## Issue #12 closure results (final code)

**Run date:** 2026-11-03.
- **Environment:** the same as above. Production builds on `E2E_PORT_OFFSET=400`; retries off; 3 workers; the shared machine again at about 94 % CPU from other work, which I did not touch.
- **Final build:** made after the last code change (the advance history wording and the test title). Every result in the first table ran on that build.

### Summary (final code)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 25 namespaces, **9,854 keys** each. The closure removed the voucher-linking strings and added the Issue #12 ones |
| Unit and API tests | `npx vitest run` | **1,431 / 1,431** in 47 files (before: 1,417 in 46). New: `hr.closure.api.test.ts`, 14 tests. `hr.api.test.ts` was updated to the new contracts |
| Multi-site security regression | `hr.closure.api.test.ts` (inside the unit run) | **5 / 5** P0 tests (isolation; never-issued ids; cross-site management; transfers and revocation; overlap without disclosure) |
| Residents' Staff on duty accuracy | `hr.closure.api.test.ts`, `hr.api.test.ts`, `s2a.spec`, `s2a.smoke` | **7 / 7** closure tests and 2 / 2 API tests; the E2E and smoke tests are in the rows below |
| Settlement integrity | `hr.closure.api.test.ts` | **2 / 2**: nine kinds of posted S.1 voucher, each refused with the advance and the cashbook unchanged; maker ≠ checker |
| Checked against the broken behaviour | the closure tests on deliberately broken code, then restored | employee scope off: 5 tests fail; site-bound scope off: 3 fail; "not checked in" treated as confirmed: 7 fail |
| Register | `node scripts/sync-screen-register.mjs` | 439 rows, 354 distinct: 131 built, 36 partial, 187 planned (no status changed; HR-008 PARTIAL) |
| **Complete combined regression** | `E2E_PORT_OFFSET=400 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gates2a.evidence.spec.ts --workers=3 --retries=0` | **383 / 383** in one 37.6-minute run: e2e **370 / 370** (every gate, B to S.2a) and evidence **13 / 13**. No retries, no test excluded, no assertion weakened |
| S.2a end-to-end | `tests/e2e/s2a.spec.ts` (inside the full run) | **23 / 23** |
| Accessibility (inside E2E) | axe in every spec that scans | **1,292 axe scans, 35,684 rule passes, 0 violations**; `s2a.spec` had 112 of them (one more than before: the residents' tab on a phone) |
| 320 × 700 at 100, 150 and 200 % text, English and Urdu | `s2a.spec` (inside the full run) | **6 / 6**: every S.2a screen, the assign drawer, and the residents' tab with both lists (an arrival is recorded first) |
| Dark mode with high contrast; keyboard at 320 px / 200 % | `s2a.spec` (inside the full run) | **4 / 4** |
| Evidence | `tests/evidence/gates2a.evidence.spec.ts` (inside the full run) | **13 / 13**: **70 screenshots** and 2 videos, all recaptured. Every screenshot's width matches its viewport |
| Firefox and WebKit smoke | `E2E_PORT_OFFSET=400 npx playwright test tests/smoke --project=firefox-smoke --project=webkit-smoke --workers=3 --retries=0` | **36 / 36**: all 18 smoke tests in both browsers |
| Manual screen reader, devices, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed** |

### Runs before the final one, as they happened

1. **Closure code, first browser run.** `s2a.spec`, `d3.spec` and the S.2a evidence ran together: **60 / 61**.
   - The failure: `s2a.spec` 320 × 700, English, 150 %. My new settlement wording "An approved staff-advance category" broke at the hyphen, the same defect fixed earlier in the gate.
   - Reworded to "An approved category for staff advances". Then 320 px: 8 / 8, and S.2a plus D.3 smoke: 16 / 16.
2. **Complete combined regression, before the final build:** **383 / 383** in 38.1 minutes (e2e 370, evidence 13; 1,292 axe scans, 35,684 rule passes, 0 violations).
3. **Firefox and WebKit smoke, before the final build:** **35 / 36**.
   - The failure: WebKit, S.2a "a new guard". The Role combobox kept the typed "guard" and the form refused to save ("This field is required"), so the duplicate-CNIC alert the test waits for never appeared.
   - Repeated: it failed 4 times in 5 in WebKit. The same test had passed in WebKit on this build earlier the same day, so it depends on timing under load.
   - The combobox is unchanged in the closure. The test clicked the option without checking it was taken. Its `pick` helper now waits for the option to be visible, clicks it, then checks the list closed and the field shows the chosen option. No assertion was removed.
   - With that, the S.2a smoke ran **40 / 40** (4 tests × 2 browsers × 5 repeats), then all smoke **36 / 36**.
4. **Review of the evidence** found the advance history still saying "Approved — not paid". It now says "Approved — payment not verified", in both languages.
   - That change, and the retitled S.2a advance test, came after runs 2 and 3. Everything was therefore rebuilt and run again: the table above.

### Issue #12 tests (`packages/fixtures/src/hr/hr.closure.api.test.ts`)

| # | Test | What it proves |
|---|---|---|
| 1 | Organisation-wide versus main-site manager | the annexe (another legal entity) never reaches a main-site principal in any list, count, department total, KPI, document row, leave or correction, attendance day, roster, On duty now, advance, option list or Employee 360 (19 strings checked) |
| 2 | Never-issued answer | 14 path ids and 5 body ids of the annexe answered exactly like ids that were never issued; hiring for another site or entity refused; a duplicate CNIC refused without naming the record; the main site's own hire still works |
| 3 | Cross-site management | each site's manager sees only theirs; organisation-wide sees all, with the site switcher and both legal entities; a legal-entity scope covers its sites |
| 4 | Effective dates and revocation | a transfer today, then a future transfer; a single-site manager refused when ending a multi-site employment (`other_sites`); a leaver stays with the last sites; no site in scope gives 404, no permission gives `permission_missing`, no module gives `module_not_licensed` |
| 5 | Overlap without disclosure | double booking across sites refused with nothing of the other site in the answer; candidates show the person blocked and no other site's staff; a supervisor cannot record at a site they do not work at |
| 6–12 | Residents | scheduled; checked in and late; absent, replaced, confirmed; approved and pending leave; overnight; employment ended; another site, no HR, and no chat or hub |
| 13 | Settlement integrity | the right-looking voucher, a wrong employee, a wrong advance, a supplier payment, an unrelated receipt, another entity and site, reversed before, reused, and reversed after: all refused (`settlement_unverifiable`). The advance stays approved and unverified with only its two history entries. Nothing reads as paid, repaid, received or owed. S.1's vouchers are unchanged, and the candidates route is gone |
| 14 | Maker ≠ checker | the requester holding the approval permission is refused (`maker_checker_required`); the treasurer approves |

## Issue #14 closure results (final code)

**Run date:** 2026-11-04.
- **Environment:** the same as above. Production builds on `E2E_PORT_OFFSET=400`, served on 127.0.0.1 and ::1; retries off; 3 workers.
- **Shared machine:** other sessions' PHP and MySQL work, Windows Defender scanning, about 4 GB of 32 GB memory free. I did not touch any of it.
- **Final build:** made after the last code change (the order of the supervisor's cover checks). Every browser result in the first table ran on that build. Only test files and documents changed after it. The register edit changed notes and tests only, and the generated register module stayed byte-identical.

### Summary (final code)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 25 namespaces, **9,856 keys** each (two new: `decision.blocked.other_sites`, `e360.otherSitesNote`; `problems.otherSites` reworded) |
| Unit and API | `npx vitest run` | **1,447 / 1,447** in 49 files (before: 1,431 in 47). New: `hr.issue14.api.test.ts` (12) and `demo-licence.test.ts` (4) |
| Issue #14 negative tests | inside the unit run | **12 / 12**: 6 for P0 (every refused request leaves the whole HR state byte-identical), 6 for P1 |
| Mutation checks | scratch script; each rule broken on purpose, one at a time, then restored and compared byte for byte | **17 breaks, each caught** (16 scripted, including the handlers of `0e14895`, plus the cover-check order by hand); restored: 0 of 46 HR API tests fail. Detail in the [report, §12.4](GATE_S2A_REPORT.md#124-tests-added) |
| Register | `node scripts/sync-screen-register.mjs` | 439 rows, 354 distinct: 131 built, 36 partial, 187 planned (no status changed); `register.spec` 16 / 16 on the edited register |
| **Complete combined regression** | `E2E_PORT_OFFSET=400 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gates2a.evidence.spec.ts --workers=3 --retries=0` | **388 / 388** in one 49.5-minute run: e2e **374 / 374** (every gate, B to S.2a) and evidence **14 / 14**. No retries, no test excluded, no assertion weakened |
| S.2a end-to-end | `tests/e2e/s2a.spec.ts` (inside the full run) | **27 / 27** (4 new: the shared guard read only; the same at 320 × 700 with 200 % text in English and Urdu; supervisors' own departments with direct addresses) |
| Accessibility (inside E2E) | axe in every spec that scans | **1,299 axe scans, 35,889 rule passes, 0 violations**; `s2a.spec` had 119 of them (7 new) |
| 1440, 768, 390 px, both languages | `s2a.spec` (inside the full run) | axe and no sideways scroll on every S.2a screen |
| 320 × 700 at 100, 150 and 200 % text, English and Urdu | `s2a.spec` (inside the full run) | **8 / 8**: every S.2a screen, the assign drawer, the residents' tab, and the shared guard's read-only Employee 360 |
| Dark mode with high contrast; keyboard at 320 px / 200 % | `s2a.spec` (inside the full run) | **4 / 4** |
| Evidence | `tests/evidence/gates2a.evidence.spec.ts` (inside the full run) | **14 / 14**: **79 screenshots** (9 new, `j01`–`j05`) and 2 videos, all recaptured. Every screenshot's width matches its viewport. Changed as intended: `b06`, `c05`–`c07`, `d01` and `i01` (the security supervisor sees security only, and names without links) |
| Firefox and WebKit smoke | `E2E_PORT_OFFSET=400 npx playwright test tests/smoke --project=firefox-smoke --project=webkit-smoke --workers=3 --retries=0` | **36 / 36** (the guard's board shows security only, in both browsers) |
| Manual screen reader, devices, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed** (H9 and H10 added) |

### Runs before the final ones, as they happened

1. **First build of the closure.**
   - `s2a.spec`: **27 / 27**.
   - S.2a evidence: **14 / 14**.
   - Reviewing those captures found the supervisors' names linked to Employee 360, which they cannot open. Now `PersonName`.
2. **Second build.**
   - `s2a.spec`: **26 / 27**. The failure was my new test: the attendance page has one list per department, and the locator matched two. Fixed with `.first()`; the Issue #14 tests then passed **4 / 4**.
3. **The first complete combined run** was stopped part-way, by me. Reviewing the code during it, I found the cover-order leak, and the run was then on outdated code.
   - The leak: a supervisor's cover request read the covered duty before checking the supervisor's own permission. A maintenance supervisor could learn whether a guard had been marked absent.
   - The checks were reordered and a test added (mutation-checked), then everything was rebuilt.
   - The stopped run's partial results are not counted.
4. **Unit and API, complete runs on the final code.** Four complete runs each failed one or two tests, on a 5-second timeout, in tests this closure does not touch:
   - S.1's "bulk office collection" reference test: 5.9, 6.9, 5.5 and 11.4 seconds;
   - once also D.3's "5,000 random small polls": 6.0 seconds.

   One more run, with 6 workers, made no progress for 12 minutes and was stopped. Each of those files passed when run alone (`finance.api.test.ts` 17 / 17).

   Those runs took 60 to 93 seconds, with other work on the machine. I did not establish a cause beyond timing: the same tests had passed in the complete runs earlier the same day (1,443, then 1,447). After the browser runs, the complete suite passed **1,447 / 1,447** with default settings (the table above). No test or timeout was changed.

### Issue #14 tests (`packages/fixtures/src/hr/hr.issue14.api.test.ts`)

| # | Test | What it proves |
|---|---|---|
| 1 | Details, role, contacts, consent | <ul><li>A main-site manager sees the shared guard read only.</li><li>Six changes are refused with `other_sites` and nothing of Block C.</li><li>The whole HR state is unchanged.</li><li>A legal-entity scope covering both sites, and organisation-wide HR, may.</li><li>A single-site employee is still edited.</li></ul> |
| 2 | Atomic edit | A PATCH with a valid phone and an invalid role, address or emergency contact changes nothing |
| 3 | Documents | Replacing and adding a shared document are refused, state unchanged; organisation-wide HR replaces it |
| 4 | Leave touching Block C | <ul><li>Submit, approve, reject and cancel (pending and approved future) are refused.</li><li>The state and both sites' published rosters are unchanged.</li><li>Organisation-wide approval then makes Block C's duty "on leave".</li></ul> |
| 5 | Advances | <ul><li>Raise, withdraw, approve (main-site treasurer) and reject are refused, state unchanged.</li><li>The person is not in the request list.</li><li>Linking is still `settlement_unverifiable`.</li><li>Organisation-wide finance approves.</li></ul> |
| 6 | Non-disclosure | Another site's employee is answered like a never-issued id (404), never `other_sites` |
| 7 | Roster, board, attendance | <ul><li>Shahid: security only; Naveed: maintenance and housekeeping only. This holds this week and next, on the board and in attendance, with no other department's names.</li><li>The manager sees all four departments.</li></ul> |
| 8 | Candidates | <ul><li>Another department's shift: `not_your_department`.</li><li>Next week: `permission_missing`.</li><li>Own shift today: own department only.</li><li>The manager plans any shift and date.</li></ul> |
| 9 | Cover | <ul><li>The same `permission_missing` for Naveed before and after a guard is marked absent.</li><li>Naming the electrician gets the unknown-id answer, state unchanged.</li><li>Permitted cover and recording still work.</li></ul> |
| 10 | Another site | <ul><li>The site list is the supervisor's own.</li><li>`?site=` Block C on the roster, board and attendance answers like a site that does not exist.</li><li>Block C's template is refused.</li><li>No other site's staff among the candidates, and no "not at site".</li><li>Omer as cover gets the unknown-id answer.</li><li>Organisation-wide HR keeps Block C.</li></ul> |
| 11 | Leave clashes | Shahid sees a guard's clashes; Naveed does not see the request |
| 12 | Shared guard's leave | Shahid sees the main-site clash only; organisation-wide HR sees both |
