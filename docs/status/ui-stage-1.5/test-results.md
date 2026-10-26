# Stage 1.5, step 1: test and accessibility results

**Run date and environment**
- Run on 2026-10-27 against production builds (`vite build` + `vite preview`).
- Node 20.20.1 (Laragon), Chromium (Playwright 1.64.1), axe-core 4.13.0.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint 10, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean; i18n has 2 locales × 10 namespaces, 799 keys each |
| Unit tests | `npm test` | **202 / 202**, 13 files |
| End-to-end | `npm run test:e2e` | **102 / 102** on the final run (4.7 min, 4 workers) |
| Accessibility (inside E2E) | `tests/e2e/a11y.spec.ts` | **142 axe scans, 3,565 rule passes, 0 violations** |
| Build | `npm run build` | both apps build; the dashboard chunk is 38.6 kB (11.7 kB gzip) |

## Unit tests by area (202)

| Area | Tests | New in 1.5 |
|---|---|---|
| Tokens: contrast pairs (standard, more-contrast, night), blueprint conflicts, ordinal ramps, brass decorative-only, photo scrim and chip | 118 | Night palette, new pairs, ramps, scrims |
| i18n formatters | 27 | Compact money and compact number, EN and UR |
| Fixtures and mock transport | 18 | Dashboard read model (6): role composition, project filter, periods, money precision, resident refused, "never paid" |
| Contracts (API error mapping) | 1 | — |
| UI components and onboarding engine | 38 | Chart kit (5): keyboard roving, RTL arrow mirroring, data-table twin, stat-tile name, segmented radio group |

## End-to-end by spec (102)

| Spec | Tests | Notes |
|---|---|---|
| `dashboard.spec.ts` | 12 | **New.** Covers:<br>• start page;<br>• role composition (manager, sales, finance);<br>• period in the URL and after reload;<br>• project filter;<br>• chart keyboard, hover tooltip and data table;<br>• carousel and announcements;<br>• action centre ("never paid");<br>• KPI and inventory links;<br>• phone bottom bar and no overflow;<br>• Urdu RTL with mirrored axis;<br>• reduced motion;<br>• guided tour on the dashboard at desktop and phone |
| `a11y.spec.ts` | 15 | Adds the dashboard to the route matrix, a dashboard test per locale (two roles with tables, tabs and next project), and high contrast |
| `onboarding.spec.ts` | 18 | Unchanged; all pass on the new shell |
| `register.spec.ts` | 13 | All 321 register routes resolve; HOME-001 is now a built screen |
| `shell.spec.ts` | 7 | Not-found now links to the dashboard |
| `command-palette.spec.ts` | 7 | Unchanged |
| `reflow.spec.ts` | 6 | Adds the dashboard at 320 px and 200 % zoom, EN and UR |
| `overlays.spec.ts` | 6 | Unchanged |
| `locale.spec.ts` | 5 | Unchanged |
| `customer-shell.spec.ts` | 5 | Unchanged; the customer app picks up the new tokens |
| `forms-keyboard.spec.ts` | 4 | Diagnostic added; see note |
| `permissions.spec.ts` | 4 | Now waits for the rail before reading link names |

**Note on `forms-keyboard › the whole form can be completed with the keyboard only`**

This test is **intermittent under full-suite load**. Results so far:

| Run | Outcome |
|---|---|
| Full runs (excluding an invalid first run against stale dev servers) | Failed 1 of 3, at the final submit (no success toast) |
| Alone | Passed 3 of 3 |
| Four parallel workers | Passed 8 of 8 |

- It passed in every Stage 1 run.
- It does not touch the dashboard.
- I added a diagnostic: if validation blocks the submit, the test now fails with the validation summary text, which names the field. The run after that passed, so the root cause is **not yet identified**.
- My working assumption is keystroke timing in the segmented date field or the file chooser when the machine is saturated by the 321-route register test, but that is unconfirmed.

I will keep watching it rather than retrying it automatically.

## Accessibility scan matrix (142 scans)

**Route scans**
- **Backoffice:** 18 routes (17 Stage 1 routes plus the dashboard) × EN/UR × desktop/phone.
- **Customer:** 3 routes × EN/UR × desktop/phone.

**Interactive states** (EN/UR × desktop/phone)
- sign-in;
- welcome;
- six tour steps and completion;
- command palette;
- drawer;
- form errors.

**Dashboard specifics** (13 scans)
- EN/UR × 1440/390 (sales role, in the route matrix).
- Manager and finance × EN/UR, before and after opening every data table, the last action tab and the next project.
- The high-contrast preference.

Every scan uses the WCAG 2.0, 2.1 and 2.2 A+AA tags. Results are attached to the Playwright HTML report (`playwright-report/`).

**Not automated:** manual screen-reader testing (NVDA, VoiceOver, TalkBack) is still open. See `docs/status/ui-stage-1/manual-screen-reader-checklist.md`.
