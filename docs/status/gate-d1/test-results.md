# Gate D.1: test, accessibility and localisation results

## Closure after the review of `afd9357` (Issue #5)

| Check | Result |
|---|---|
| Typecheck, lint (ESLint, logical-CSS RTL guard, i18n parity) | clean. 2 locales × 20 namespaces, **5,879 keys** each (+6: scope labels, shared-settings note, the phone section menu) |
| Unit and API tests | **1,123 / 1,123** in 35 files (+8). New: `reconcileShared` (first-share merge, newer wins, nothing to share), migration of older records, adopting shared essentials leaves per-app settings alone; `/me/preferences` (one record per person and organisation; the newer change kept; a chosen text size never lost; invalid values refused; the switch carries the shared language); the same contact details in both apps; waiting for the account (a slow account never holds the app; a late answer still applies) |
| End-to-end, full | **274 / 274** in one full run (34.8 min) on the final code: production builds, retries off, **3 workers** (D.1 delivery: 267). Gate B, C.1, C.2 and D.1 suites all green. Other sessions' load tests were running on this machine; an earlier run with 4 workers under that load was 263 / 273 (nine Gate B time-budget failures and onboarding test 14, which was a real bug: see below), and the same code with 3 workers was 274 / 274 |
| Accessibility (inside E2E) | **764 axe scans, 21,133 rule passes, 0 violations** (D.1 delivery: the same). D.1 spec: 78 scans, 2,160 passes, 0 violations |
| New E2E | Rabia switches Management ↔ Resident: her C.2 125 % reaches the office; 150 %, high contrast and reduced motion follow her to the resident app while the office's dark theme stays; 175 % and Urdu come back. Another person in the same browser is unaffected. **Phone reachability** in real viewports at 320 px (200 %, UR) and 390 px (100 % EN, 200 % UR) on six D.1 pages: 30 Tab stops each clear of the header and the bar; the last control clears the bar. **Keyboard open** (390 × 420) in both apps: the field in view, the bar steps aside and is inert. The reflow sweep now includes 320 px at 200 %. **Section addresses:** a page opened by a full load never takes the previous page's scroll position, a reload keeps its own, and *Settings › Onboarding* stays at *Guided tours* |
| Evidence | **11 / 11**: **162 screenshots** (+39 real-viewport `v01`–`v07` and `x01`–`x05`) and **5 videos** (+`closure-shared-essentials-en.webm`); every screenshot exactly its viewport's width |
| Cross-browser smoke | **18 / 18** with `--repeat-each=3` on the final code. The run before it was 17 / 18 (one Firefox failure, below). Across the closure: 1 failure in 18 Firefox runs; WebKit 18 / 18 |
| Manual screen reader, devices, printing, forced colours | still **not performed** ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)) |
| Firefox failure from the first D.1 run | **recurred once, artifacts kept** (see below). Narrowed, not established: the resident app waited about 34 s for the demo link while the machine was starved; the closure's wait for the account is now capped at 3 s |

### Problems found while closing

| Found by | Problem | Fix |
|---|---|---|
| Header probe (real viewports) | The site chip's short name could still be cut (it was allowed to shrink), and at 200 % its label grew while the header's buttons did not | Short name → initials → icon by measurement; header labels use the capped chrome size; on phones the demo notice shows its shield |
| The new E2E (Rabia) | Arriving in the other app set the language directly, which counted as a newer change there and overwrote the resident's 175 % | The landing only greets in the shared language; the app's sync applies it as a received change. The switch also waits for a change still on its way |
| The extended reflow sweep (320 px, 200 %) | Five buttons and one card grid did not wrap (sound test, My data download and request, household request actions, My properties) | They wrap; the grid track can shrink |
| Evidence | Rabia's office profile showed no mobile number (her resident profile did) | Contact details are looked up by the person, so both apps show the same |
| Full regression (Gate B onboarding test 14, then 3 of 10 alone) | Opening a settings section by its address (*Settings › Onboarding* opens at *Guided tours*) sometimes landed at the top, so the test's click hit the 150 % card. Cause: every page opened by a full load is React Router's history entry `default`, so a page took the previous page's saved scroll position, and that restore could arrive after the section jump. Users would see it too (a page opening part-way down because of the previous page) | In all three apps the first entry's scroll position is kept by its own address: a reload still returns to where you were; another page never inherits it. 0 failures in 90 instrumented runs (about 1 in 4 before). New E2E *settings section addresses* (fails without the fix: the next page opened at 1,500 px) |
| Cross-browser smoke (Firefox, 1 failure in 9 Firefox runs) | The Firefox failure from the first D.1 run came back in the same test (resident home, before the proof). This time its trace and screenshot were kept and read (not committed: 14 MB). The page showed *Loading…* for about 34 s, the closure's wait for the person's shared essentials, which in the society demo travel through the demo link (the hidden frame to the office app, itself 2 s to load in Firefox). The home page's code was fetched only after that, and the bill appeared 0.1 s after the test gave up. The test runner was starved too (3.6 s between two steps; its 20 s wait ended after 31 s), and other sessions' load tests were running on this machine | The cause inside Firefox is **not established** (machine starvation is the likeliest explanation). The weakness it exposed is fixed: the wait for the account had no limit. The resident app now goes ahead after 3 s with its own record; a late answer still applies, and a size chosen in the other app then closes the first-run step. New unit test (fails without the cap). The C.1/C.2 run before the closure had no such wait, so it does not explain that first failure |
| Full regression (an interrupted run, then `a11y.spec` alone) | The Stage 1 axe route sweeps ran out of time: customer routes 37–66 s against 60 s (the hub, now the largest page, takes about 10 s per scan); office routes 100–133 s against 180 s, and once over 180 s under full load | Checked first that nothing loops: once settled, the hub makes no DOM changes and no requests in 5 s (both apps, EN/UR, 390/1280 px). Time budgets raised to 150 s and 300 s; nothing scanned was removed |

The record of the first D.1 delivery follows unchanged.

## Delivery of `afd9357`

**Run date:** 2026-10-29.

**Environment:**
- Production builds of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Playwright (Chromium), axe-core.
- Retries **off**. Leftover development servers stopped before every run.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **20** namespaces (new: `identity`), **5,873 keys** each (C.2: 19 namespaces, 5,116 keys) |
| Unit and API tests | `npm test` | **1,115 / 1,115** in 34 files. New for D.1: `identity.api.test` (16), `personal.test` (7), `brand.test` (3); `contrast.test` now covers dark, high contrast (light and dark) and every palette |
| Register | `npm run register:sync` | **404 rows, 340 distinct: 82 built, 27 partial, 231 planned** (C.2: 396 / 337; 67 / 30 / 240). All 321 V2.1 IDs and addresses preserved |
| End-to-end, full | `npx playwright test --project=e2e` | **267 / 267** in one full run (26.9 min) on the final code. Gate B, C.1 and C.2 suites all green (C.2: 246). Earlier full runs on this branch: 263 / 265 twice; the failures are listed below and fixed |
| Accessibility (inside E2E) | axe in every spec that scans | **764 axe scans, 21,133 rule passes, 0 violations** (C.2: 686 / 18,986 / 0) |
| D.1 end-to-end | `tests/e2e/identity.spec.ts` | **21 / 21**. Its axe scans: **78** (18 pages × EN/UR × 1440/390, plus 6 steps of the invitation journey), 2,160 rule passes, 0 violations |
| Cross-browser smoke (C.2 regression) | `npx playwright test --project=firefox-smoke --project=webkit-smoke` | **18 / 18** with `--repeat-each=3`, then 3 / 3 in Firefox again. The first attempt was 5 / 6: one Firefox run of the resident proof → receipt path failed; it did not recur in 12 later Firefox runs, and its artifacts were overwritten by the re-run, so the cause is **not established** |
| Evidence | `npx playwright test --project=evidence tests/evidence/gated1.evidence.spec.ts` | **9 / 9**: **123 screenshots** and **4 videos**; every screenshot exactly its viewport's width |
| Manual screen reader, devices, printing, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed**: needs a person and devices |

## New tests

**API (`packages/fixtures/src/identity/identity.api.test.ts`), all through the fail-closed mock server:**
- An invitation is accepted with the code once, bound to the person and flat; the view never carries the full name or contact details; a used link explains itself.
- Wrong codes count down (2, 1) and then lock, even for the right code.
- A cancelled invitation, an unknown token and another organisation's token are refused.
- Never invited without a verified link; never on a channel without consent.
- Only staff with `portal_access.invite` invite; residents cannot read portal access.
- Phone sign-in answers the same for a number without an account.
- Ending another device's session refuses that device; the current session cannot be ended from the list; another person's session is "not found".
- Closing a resident's access refuses them everywhere; a reason is required.
- The app-switch ticket works once, only in the other app; people with one role get no switch.
- Exports: the requester cannot decide or download before approval; the approver cannot request or download; widening is refused; the file holds only what was approved and says it is fictional; declining needs a reason; a developer's administrator has nothing to export.
- A completed deletion removes contacts and app access and keeps the bills; a second open request of the same kind is refused; privacy requests need `privacy.requests.manage`.
- Staff sessions: only this organisation's staff; another organisation's person is "not found"; ending needs `sessions.manage`.
- Households: request → approval → the person appears; a flat that is not yours is refused; names and roles only.
- Organisation colours: only `admin.branding`; a custom colour needs white label; a preset reaches the resident app.

**Unit:** preference migration from C.2 (size and *chosenAt* kept), resolution (organisation palette, person's choice, high contrast, device theme and motion, reading mode), `<html>` attributes and brand properties, reset; brand guardrails (accept, refuse with suggestion, not a colour).

**E2E (`tests/e2e/identity.spec.ts`):** the hub in all three apps (applies at once, per person, survives reload, reset, keyboard), C.2 compatibility, the invitation journey with axe on every step, the welcome without the size step, phone sign-in, the flat tab, devices, the app switch with no leakage, a resident signed out with the reason, exports (maker-checker, narrowing, download), My data, staff sessions, organisation colours reaching the resident app, households; axe on 18 D.1 pages × EN/UR × desktop/phone; 320 px and 200 % on the same pages with no sideways scrolling **and no text squeezed into a narrow column**.

## Problems found while testing D.1

| Found by | Problem | Fix |
|---|---|---|
| Visual review of reference 2 | The wrong-code message showed its key: i18next pluralises only on a numeric `count`, and the server sends strings | Field errors convert `count` to a number; the server sends `count` |
| Visual review (320 px, Urdu) | The role-mode chip squeezed the resident header until the organisation name wrapped one letter per line | Chip hidden below 400 px (the account menu names the mode); the language button is icon-only below 360 px |
| Visual review (dark mode) | Text on photos turned dark on a dark scrim (`inverse` flips in dark mode) | New `on-image` colour, white in every theme |
| Browser check | A menu section and its item shared the id `switch`; the menu silently did not open | Distinct ids |
| Browser check | ADM-022 was blocked: the register gave the whole screen the `white_label` module | Register decision: presets core, custom colour white label (report §6) |
| First D.1 E2E run | axe: definition lists with icons outside `dt`/`dd`; a badge directly inside a list; a faded but operable volume control | Icons moved into `dt`; the badge wrapped in `li`; the fade removed |
| First D.1 E2E run | 200 % text on a phone: long button labels did not wrap (hub, devices, profile) | Those buttons wrap |
| Evidence review | Device, privacy and household rows squeezed their text into a narrow column once buttons could wrap (no overflow, so the overflow check passed) | Text columns get a minimum width; the E2E reflow test now fails on squeezed text |
| Full regression | A Stage 1.5R test selected the radio "More contrast" and also matched "Follow my device setting — uses more contrast…" | Cards are named by their label only; the description is attached as a description (better for screen readers too) |
| Full regression | The developer-edition rail gained *Profile*, changing a Stage 1.5R contract | Profile stays in the account menu for that edition |
| Full regression | C.1 dashboard assertion (see report §6, decision 11) | Finds the run by key |
| Full regression under load | The D.1 axe sweep exceeded its time budget | Split into four tests (language × width) |
