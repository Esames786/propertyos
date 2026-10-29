# Gate D.1: test, accessibility and localisation results

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
