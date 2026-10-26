# Stage 1: test results

**Environment**
- Date: 2026-10-26.
- Machine: Windows 11 Pro 10.0.26200.
- Runtime: Node 20.20.1 (Laragon), npm 10.8.2.
- Browser: Playwright 1.64.1 with Chromium.
- E2E and accessibility runs target **production builds** served by `vite preview` (ports 5173/5174).

These results are exactly what the commands printed (summary lines). Nothing was re-run selectively to hide failures. One E2E run failed and is recorded below.

## Static checks

```
$ npm run typecheck
> tsc -p tsconfig.json --noEmit
exit=0

$ npm run lint
> eslint . && node scripts/check-logical-css.mjs && node scripts/check-i18n.mjs
logical CSS: no physical left/right utilities or properties
i18n: 2 locales × 9 namespaces, 619 keys each, parity OK
exit=0
```

## Unit and component tests (Vitest 4.1.12)

```
$ npm run test
 Test Files  11 passed (11)
      Tests  126 passed (126)
exit=0
```

| File | Tests | What it proves |
|---|---:|---|
| `packages/tokens/src/contrast.test.ts` | 54 | 26 colour pairs × standard and more-contrast meet WCAG thresholds; C1/C2 resolved |
| `packages/i18n/src/format/format.test.ts` | 26 | PKR always 2 decimals (C4), Karachi dates (C5), Latin digits in Urdu, sq ft / مربع فٹ, phone, CNIC, IBAN mod-97 |
| `packages/contracts/src/api.test.ts` | 1 | Laravel 422 → error contract |
| `packages/fixtures/src/fixtures.test.ts` | 12 | Fictional-data rules, determinism, §9 states only, persona scope enforced in transport, training isolation, offline/error modes |
| `packages/ui/src/onboarding/tourMachine.test.ts` | 10 | Next/Back/Skip/Pause, missing-target fallback both directions, suspend/resume/complete events |
| `packages/ui/src/onboarding/TourProgressStore.test.ts` | 5 | Key = tenant + persona + app + tour + version, no PII, reset scope, storage failure fallback |
| `packages/ui/src/onboarding/placement.test.ts` | 6 | Card placement mirrors in RTL, stays in viewport, phone sheet edge |
| `packages/ui/src/permissions/can.test.ts` | 3 | Permission filtering |
| `packages/ui/src/forms/forms.test.tsx` | 4 | Summary focus + links, errors bound to inputs, values kept and errors re-translated on EN→UR, CNIC mask, LTR data inputs |
| `packages/ui/src/layout/Tabs.test.tsx` | 3 | Row + More, URL deep link, arrow keys, overflow tab from URL |
| `packages/ui/src/overlays/Dialog.test.tsx` | 2 | Effect text, required reason, Escape, focus return |

## End-to-end, accessibility, reflow and register coverage (Playwright)

**Recorded run:**

```
$ npm run test:e2e
  88 passed (4.3m)
exit=0
```

JSON report (`test-results/results.json`): `expected: 88, unexpected: 0, flaky: 0, skipped: 0`.

**Previous run, for transparency:** 87 passed, 1 failed. The failing test was `forms-keyboard › the whole form can be completed with the keyboard only`.

```
Error: strict mode violation: getByText('cnic-front.png') resolved to 2 elements
```

**Cause:** the uploaded file name also appears in the screen-reader live announcement, and whether it had arrived yet depended on timing. This was a test-selector ambiguity, not a product defect. The assertion now checks the file list item and, separately, the announcement. The suite was then re-run in full (above).

| Spec | Tests | Covers |
|---|---:|---|
| `onboarding.spec.ts` | 18 | Doc 09 §11 acceptance 1–14 (see report §3) |
| `shell.spec.ts` | 7 | Landmarks, single H1, skip link, focus on navigation, sidebar collapse, phone menu focus trap/return, breadcrumbs, planned and not-found pages |
| `locale.spec.ts` | 5 | In-place EN⇄UR keeps typed values and tab, persists, references isolated LTR, amounts unchanged, **zero missing translation keys** on Stage 1 pages in both languages |
| `forms-keyboard.spec.ts` | 4 | Summary focus and links, **complete form by keyboard only**, in-memory draft survives back (nothing personal written to storage), dependent picker clearing |
| `overlays.spec.ts` | 6 | Drawer focus trap/return, phone sheet, confirm with reason, toasts announced polite/assertive, pending button blocks double submit, related drawer |
| `command-palette.spec.ts` | 7 | Ctrl+K (also in Urdu), keyboard navigation to a record, Sales vs Finance scope, out-of-project scope, actions, phone full-screen, GLOBAL-001 URL |
| `permissions.spec.ts` | 4 | Nav, project options, quick create per persona; forbidden workspace for Finance; identity switch shows that persona's welcome |
| `a11y.spec.ts` | 9 | axe on all Stage 1 routes, EN/UR × desktop/phone, overlays and every tour step; high-contrast mode |
| `reflow.spec.ts` | 6 | 320 px and 200 % zoom: no page-level horizontal scroll (EN and UR), header and tour controls reachable |
| `register.spec.ts` | 13 | **All 321 register URLs** render a page with an H1; planned ones show the planned page with the right screen ID; no console errors |
| `customer-shell.spec.ts` | 5 | Bottom nav (phone) and side nav (desktop) from one tree, awaiting-verification status in Urdu, PORTAL-027, GUIDE-005 alias |

### axe-core 4.13.0 (via @axe-core/playwright 4.13.0)

Rule tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.

| Metric | Value |
|---|---:|
| Scans | 129 |
| Rule checks passed (sum over scans) | 3,067 |
| Fewest rules passed in one scan | 18 |
| **Violations** | **0** |

**Scope of the scans**
- 17 backoffice routes and 3 customer routes;
- en-PK and ur-PK, at 1440 × 900 and 390 × 844;
- overlays: sign-in, welcome, tour steps 1–6, tour completion, command palette, drawer, form with validation errors;
- one high-contrast scan.

Each scan's JSON is attached to the Playwright HTML report (`playwright-report/`).

> Automated checks cover only part of WCAG 2.2. Manual screen-reader testing is listed in `manual-screen-reader-checklist.md` and has **not** been executed.

## Evidence capture

```
$ npm run evidence
  14 passed (58.8s)
exit=0
```

66 screenshots written to `docs/status/ui-stage-1/screenshots/`.
