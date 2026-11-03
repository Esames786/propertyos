# Gate S.2a: test, accessibility and localisation results

**Run date:** 2026-11-03. Only tests that were actually executed are reported.

**Environment:**
- **Builds and ports.** Production builds of all three apps on isolated ports: `E2E_PORT_OFFSET=400` (office 5573, resident 5574, HQ 5575). Built with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`, and served on both 127.0.0.1 and ::1.
- **Tools.** Node 20.20.1. Playwright: Chromium, plus Firefox and WebKit for the smoke. axe-core with the WCAG 2.0/2.1/2.2 A and AA rules.
- **Run settings.** Retries off, 3 workers. Reduced motion and a fixed clock in every S.2a test (business date Monday 26 October 2026).
- **Shared machine.** It was under heavy load from other work (about 99 % CPU, from processes that are not mine; I did not touch them). I restarted only my own servers.

## Summary (final code)

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
