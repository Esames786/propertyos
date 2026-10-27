# Stage 1.5R: test and accessibility results

**Run date:** 2026-10-27.

**Environment**
- Production builds (`vite build` + `vite preview`).
- Node 20.20.1, Chromium (Playwright 1.64.1), axe-core 4.13.0.
- Retries are **off** (`retries: 0`); nothing below was retried.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 13 namespaces, 1,673 keys each (Stage 1.5: 10 namespaces, 799 keys) |
| Unit tests | `npm test` | **303 / 303** in 15 files (Stage 1.5: 202) |
| End-to-end | `npm run test:e2e` | **134 / 134** on three consecutive full runs (7.5–7.7 min each, 4 workers). Stage 1.5: 102 |
| Accessibility (inside E2E) | `a11y`, `get-started`, `portal` specs | **262 axe scans, 7,057 rule passes, 0 violations** (Stage 1.5: 142 / 3,565 / 0) |
| Build | `npm run build` | both apps build. Bundle sizes are below |

## End-to-end by spec (134)

| Spec | Tests | What it covers (new or changed in 1.5R in **bold**) |
|---|---|---|
| `onboarding.spec.ts` | 18 | **Tour v2 on the real dashboard at 1440, 390 and 320 px**: every step frames the real control. **Pause → Resume chip**, version-2 progress records, Urdu mid-tour, keyboard, reduced motion, practice isolation |
| `a11y.spec.ts` | 15 | Route matrix now includes **Sales home, lead list, lead workspace (3 tabs), More** and **9 portal views**. Overlays include **New lead (errors), Schedule visit, simulated call, unit quick view**, and the 9-step tour |
| `dashboard.spec.ts` | 13 | **Role-aware quick actions** (every tile reaches a working screen). Action-centre rows open the **real lead workspace** |
| `register.spec.ts` | 13 | All 321 register routes resolve. 24 built, 8 partial (aliases to a built screen), 289 planned |
| `portal.spec.ts` | 11 | **New.** Home; proof upload → "Awaiting verification" (never Paid); pay-online simulation; maintenance and visitor pass; Urdu; phone centre action; portal tour; axe on every portal view |
| `get-started.spec.ts` | 10 | **New.** First visit → Get started; demo role → real preparation → ready → tour; explore on my own; deep links; the full wizard (validation, wrong code, Back, Urdu mid-step, skip, review/edit, done); axe |
| `crm.spec.ts` | 9 | **New.** Sales home; the connected journey; lead-list URL state restored after visiting a lead; follow-up done; pipeline/KPI links; practice lead isolation; phone centre "+"; Urdu; Sales tour guided step |
| `shell.spec.ts` | 8 | **Phone: floating bars, centre Quick create, More page; demo-role switch** |
| `command-palette.spec.ts` | 7 | Unchanged; also finds leads created in the session |
| `reflow.spec.ts` | 6 | 320 px and 200 % zoom now include **Sales home, lead list, lead workspace, More** |
| `overlays.spec.ts` | 6 | Unchanged |
| `locale.spec.ts` | 5 | Unchanged |
| `customer-shell.spec.ts` | 5 | Updated for the new customer shell |
| `permissions.spec.ts` | 4 | Quick create: New lead and Schedule visit now work; Hold stays planned |
| `forms-keyboard.spec.ts` | 4 | **Intermittent failure fixed at the root** (see below) |

## Intermittent keyboard test: root cause and fix

**Symptom (Stage 1.5).** "The whole form can be completed with the keyboard only" failed about 1 in 3 full-suite runs, with no success toast after submit.

**Reproduction.** I ran the test under a deliberately heavy load: 24 repeats, 6 workers, 4× CPU throttling, against the production build.
- It failed 1 of 24 times.
- The improved diagnostic, which waits for either outcome, reported: `Validation failed: Preferred contact method: Choose an option.`

**Cause, from the failure trace.** After Escape closed the "Interested in" popup, the test pressed Tab 30 times before its focus matcher succeeded; a normal run needs 1.
1. React Aria returns focus to a popup's trigger on the next animation frame.
2. Under load, the test's first Tab arrived inside that frame, while focus was still on `<body>`, so Tab started from the top of the page.
3. The matcher `/Phone call|WhatsApp|Email/` then hit the **Email text field** first, and Space went into it instead of selecting a contact-method radio.

This is a race in the test, not a product defect: a person cannot press Tab within one frame of Escape.

**Fix (in the test, not a retry).**
- After each popup closes, wait until the listbox is gone and focus is back on a real control (`afterPopupCloses`).
- The contact-method matcher accepts radio buttons only, and the test asserts a radio is checked.

**Proof.**
- 40 / 40 passes under the same heavy load (it was 1 failure in 24).
- Three consecutive full-suite runs at 134 / 134.

## Other defects found and fixed during integration
- **Command palette crash.** A duplicate "Sales" destination crashed the palette (duplicate collection key). Found by the tour test that opens search mid-tour.
- **Filter changes overwrote each other** in the lead list (two URL updates from the same snapshot). Fixed with `useQueryParams`.
- **Practice leads didn't refresh lists** after saving.
- **Lead card definition list** contained a non-`dt`/`dd` row (axe `definition-list`).
- **Lead workspace overflowed at 320 px** (axe/reflow). Narrow screens now use one column, and dates wrap.
- **Drawer bodies** that scroll but hold no control (unit quick view) were not keyboard-scrollable (axe `scrollable-region-focusable`). Drawer bodies are now focusable regions.
- **Tokens lab** printed labels on dark swatches (contrast).
- **File-upload preview** revoked its image URL during React's StrictMode remount (`ERR_FILE_NOT_FOUND` in development).
- **Lead workspace without a record** showed "not found". It now invites you to choose a lead.
- **Name mismatch:** party `pty_0001` and the resident persona had different names in the backoffice and the portal.
- **Axe timing:** the helper now waits for entrance animations to settle. Scanning mid-fade had reported text that is never seen at rest.

## Bundle (production, minified)

| App | Chunk | Size | gzip | Stage 1.5 |
|---|---|---|---|---|
| Backoffice | shared (`src-*.js`) | 1,342 kB | 397 kB | 1,258 kB / 377 kB |
| Backoffice | entry (`index-*.js`) | 457 kB | 128 kB | — |
| Backoffice | new pages | Sales home 12 kB, lead list 5 kB, lead workspace 17 kB, Get started 7 kB, demo launch 20 kB, setup wizard 40 kB, More 4 kB | — | — |
| Customer | shared + entry | 1,139 kB + 442 kB | 339 + 123 kB | 882 kB / 260 kB |
| Customer | portal pages (now code-split) | 4–15 kB each | — | — |

**Growth.** The customer app now ships the portal fixtures, the 13-namespace dictionaries for both languages, and the motion library.

**Stage 6 plan**
- Load each language's dictionary on demand.
- Move fixtures behind a dynamic import (they disappear entirely once the real API exists).
- Split a vendor chunk.

## Not automated (still required)
- **Manual screen-reader testing** (NVDA, VoiceOver, TalkBack) of the entry flow, tour, CRM and portal. See `docs/status/ui-stage-1/manual-screen-reader-checklist.md`. Zero axe violations is **not** a claim of WCAG conformance.
- **Browsers:** WebKit and Firefox runs come in Stage 6; this run is Chromium only.
