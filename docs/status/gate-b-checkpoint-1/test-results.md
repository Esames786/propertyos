# Gate B checkpoint 1: test and accessibility results

**Run date:** 2026-10-27.

**Environment**
- Production builds (`vite build` + `vite preview`) of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Chromium (Playwright 1.64.1), axe-core 4.13.0.
- Retries are **off**; nothing below was retried.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 14 namespaces, 2,347 keys each (Stage 1.5R: 13 namespaces, 1,673 keys) |
| Unit tests | `npm test` | **388 / 388** in 18 files (Stage 1.5R: 303 in 15), plus the 2 new announcer tests, run on their own (2 / 2) |
| Register | `npm run register:sync -- --check` | 390 rows, 331 distinct screens (34 built, 13 partial, 284 planned); all 321 V2.1 IDs and addresses preserved |
| End-to-end | `npm run test:e2e` | **158 / 158 on two consecutive full runs** (runs 3 and 4: 11.1 and 12.1 min, 4 workers). Stage 1.5R: 134 |
| Accessibility (inside E2E) | `a11y`, `get-started`, `portal`, `hq` specs | Runs 3 and 4: **330 axe scans per run, 8,993 rule passes, 0 violations** (HQ: 68 scans). Stage 1.5R: 262 / 7,057 / 0 |
| After runs 3 and 4 | `hq.spec.ts` axe tests | Three more scans per HQ sweep (dependency problem, activation confirmation, done screen); they found the announcer defect below. After the fix: **4 / 4, 80 HQ scans, 0 violations** |
| Final full runs | `npm run test:e2e` | Runs 5 and 6 on the final code were **still running when this was pushed**. Their results follow in the next commit |
| Evidence | `npx playwright test --project=evidence tests/evidence/gateb1.evidence.spec.ts` | 11 / 11; 126 screenshots, 3 videos |

## New unit tests

| File | Tests | Covers |
|---|---|---|
| `packages/contracts/src/access.test.ts` | 37 vectors | `decide()`: every layer and reason, suspension classes (history read, settlement per D-20, operational block), future-dated grants, maker ≠ checker, error-to-status mapping |
| `packages/fixtures/src/platform/pricing.test.ts` | 23 vectors | The pricing engine. Al-Noor 18,700 / 3,700; 3,540 occupied; mid-month start; scheduled price change to 4,100; graduated and volume tiers; usage with allowance; discounts; free and trial; minimum and cap; tax per line; quarterly; rounding; every commercial-policy rule |
| `packages/fixtures/src/platform/platform.test.ts` | 18 | Module catalogue and dependency check; mock handlers: create and activate, idempotency, reset, approvals (maker ≠ checker, comment to return), incomplete drafts refused, the simulator never writes, tenant records refused without a support grant, permissions before handlers, dashboard figures, search without tenant people |

## End-to-end by spec (158)

| Spec | Tests | Change in this checkpoint |
|---|---|---|
| `hq.spec.ts` | 21 | **New.** See the next table |
| `onboarding.spec.ts` | 18 | Unchanged |
| `register.spec.ts` | 16 | **Updated for the V3.1 register** (was 13): the register keeps every V2.1 screen and adds the V3.1 families; all 355 openable addresses across the three apps, 25 per test |
| `a11y.spec.ts` | 15 | Unchanged except one time budget (see below) |
| `dashboard.spec.ts` | 13 | Unchanged |
| `portal.spec.ts` | 11 | Unchanged |
| `get-started.spec.ts` | 10 | Unchanged |
| `crm.spec.ts` | 9 | Unchanged |
| `shell.spec.ts` | 8 | Unchanged |
| `command-palette.spec.ts` | 7 | Unchanged |
| `reflow.spec.ts` | 6 | Unchanged |
| `overlays.spec.ts` | 6 | Unchanged |
| `locale.spec.ts` | 5 | Unchanged |
| `customer-shell.spec.ts` | 5 | Unchanged |
| `permissions.spec.ts` | 4 | Unchanged |
| `forms-keyboard.spec.ts` | 4 | Unchanged |

**Regression (AB-11).** The Stage 1.5R tests pass, and Larkspur's backoffice navigation is unchanged. Only two existing spec files changed:
- the register spec, which had to move to the V3.1 register;
- one time budget in the a11y spec.

**Shared UI changes the backoffice and portal also receive**
- The shell accepts HQ's slots (context chip, Create button). The backoffice and portal keep their defaults.
- The quick-actions grid now wraps long labels, and phones use four columns (flaw F-5).
- The tour library and text guide are shared views.
- The planned-screen page shows the V3.1 gate and module.
- The announcer fix above.

### `hq.spec.ts` (21)

| Test | Acceptance check |
|---|---|
| Create Al-Noor: 18,700 first invoice, 3,700 after, first year 59,400; activated; summary; **Simulate pricing** opens the simulator on this tenant | AB-1, AB-2 |
| Wizard entries survive Back and a refresh (server draft) | B.5b |
| **Review → Edit → Continue** returns to the review with the change | B.5b |
| A missing hard requirement blocks Continue, is explained, and one click adds it | AB-3 |
| A 20 % discount waits for approval; the requester cannot approve; an approver can | AB-15 |
| The simulator re-prices what-ifs and never writes | AB-6 |
| Platform support: no Create tenant, no simulator, tenant records → 403 `support_grant_required` | AB-9 |
| Dashboard figures; attention item opens the approval | B.5b |
| Tenant filters in the address survive a reload; requests tab | B.5b |
| Urdu mid-wizard keeps entries and mirrors the layout | AB-12 |
| Phone: bottom bar, centre Create, More, no sideways scrolling | B.5b |
| **Phone: the live price stays in view while pricing; the simulator jumps to its results** | UX |
| **Reflow at 320 × 640 and 720 × 450 (200 % zoom):** every HQ screen, the tenant summary, and every wizard step through to *Waiting for approval* | AB-12 |
| axe (EN/UR × 1440/390, 4 tests, 20 scans each): dashboard, tenants, summary with an approval, requests, simulator, More, preferences, a planned page, then every wizard step including the organisation errors, the dependency problem, the activation confirmation and the done screen | AB-1 (axe) |
| HQ tour frames the real control at every step at **1440, 390 and 320 px** | AB-13 |

## Defects found and fixed during this checkpoint

**Found by the new tests and the visual review**
- **Empty screen-reader announcement after a busy button disappears** (all three apps).
  - **Found by** the axe scan of the done screen (`role-img-alt`).
  - **What happened:** when a focused button goes busy, React Aria announces it by pointing at the button's ID. When the button then disappears, the announcement points at nothing for seven seconds. This happens when a confirmation dialog closes or a wizard step moves on.
  - **Fix:** the shared live-announcer provider turns each by-reference announcement into the referenced text the moment it is added. It reads the same and never dangles. Unit-tested in `LiveAnnouncer.test.tsx`.
- **Live price out of sight on phones and tablets.** In the wizard and the simulator, the live price sat below long forms. A compact price bar now stays pinned under the header; the simulator adds "See the results".
- **Sideways scrolling at 320 px.**
  - The modules step's "Show 10 more modules…" button did not wrap (65 px too wide).
  - The review step's "Edit …" buttons did not wrap (32 px).
  - Both now wrap. Before this, the reflow test only opened the first wizard step; it now walks every step.
- **Tour at 320 px.** The attention panel is taller than a 320 × 640 screen, so the spotlight could not frame it. Phones now spotlight the first attention item, as the figures step already does with the first figure.
- **Overflow at 390 px.** Found earlier in the visual pass and fixed before these runs:
  - Urdu dashboard: 559 px wide on a 390 px screen;
  - simulator: 429 px;
  - 320 px tenant card;
  - simulator source select.
- **Pricing engine** (found while writing the vectors):
  - quarterly billing did not scale monthly prices;
  - the minimum and cap were not scaled to the billing period;
  - the first-year value counted periods, not months.

**Test-only issues (not product defects)**
- **HQ tour test** read the spotlight while it was still moving between controls (run 1). It now waits until the spotlight covers the step's control, the same check the backoffice tour test uses.
- **a11y overlays test** (19 scans in one test) takes about 106 s, against a 120 s budget. In run 2 it went over the budget twice while other work ran on the machine; both runs had finished every scan with 0 violations. The budget is now 240 s, the same as the register tests.

## Bundle (production, minified)

| App | Chunk | Size | gzip | Stage 1.5R |
|---|---|---|---|---|
| Backoffice | shared (`src-*.js`) | 1,610 kB | 443 kB | 1,342 kB / 397 kB |
| Backoffice | entry | 385 kB | 120 kB | 457 kB / 128 kB |
| Customer | shared + entry | 1,402 kB + 373 kB | 384 + 116 kB | 1,139 kB + 442 kB / 339 + 123 kB |
| Platform HQ | shared + entry | 1,418 kB + 366 kB | 398 + 113 kB | new |
| Platform HQ | pages (code-split) | create tenant 52 kB, simulator 25 kB, pricing builder 23 kB, tenants 20 kB, dashboard 17 kB | — | new |

**Growth.** The V3.1 register (390 rows with more fields) and the new `platform` dictionary in both languages ship in all three apps. The platform fixtures do not: they are a separate entry and stay out of the backoffice and customer bundles (checked in the built files).

**Stage 6 plan, unchanged:** load dictionaries per app and per language, move fixtures behind a dynamic import, and split a vendor chunk.

## Not automated (still required)
- **AB-14:** a manual NVDA + Chrome pass of the wizard and the quote. Automated axe checks cover only part of WCAG.
- Browsers other than Chromium.
- Two links are covered by code review only:
  - Tenant summary → Tenant 360 (a parameterised planned route);
  - the onboarding-policy panel's text.
