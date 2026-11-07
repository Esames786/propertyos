# UX repair batch B2: accessibility blockers and one-line shared fixes

**Branch:** `fix/ux-b2-accessibility`. Code commit `a0897b9`, on the accepted S.1 hotfix `04b6fde` (Issue #18, closed).
**Source:** the GPT-accepted UX backlog, `docs/ux-backlog` at `90c2b0a`, §8 batch B2. That backlog triages the audit `docs/frontend-ux-audit` at `1a0779e`.
**Scope:** the eight B2 findings: SH-01, OPS-01, SH-02, SH-04, RES-06, SH-10, SH-11 and SH-12. Frontend only. No visual redesign; shared-component changes are additive.
**Status:** pushed and stopped for GPT and owner review. Follow-up for GitHub Issue #20 (focus rings, Rentals KPI names): §4. This is not a WCAG certification: no screen reader has been run (see [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).

Test totals and every interim failure are in [`test-results.md`](test-results.md). The short version:
- Vitest 1,531 / 1,531.
- Complete combined Chromium run with retries off: 445 / 446. The one failure is `identity.spec.ts:327`; it was not reproduced in 90 repeats, and it has not been shown to fail on the base.
- Axe: 1,458 scans, 0 violations.
- Firefox smoke 27 / 27.
- WebKit smoke 26 / 27. The failure is `s2a.smoke.spec.ts:52`, already failing on the base: 12 / 20 on `04b6fde` against 8 / 20 here.
- 30 screenshots.

## 1. Findings

| ID | Priority | What was wrong | Fix | Files | Status |
|---|---|---|---|---|---|
| SH-01 | P1 | Below 640 px the command palette fills the screen with no visible way to close it: the Esc hint is hidden and there is no overlay to tap. | A visible "Cancel" / "منسوخ کریں" button (reusing `common:actions.cancel`) at the end of the search row, below `sm`. It is at least 44 × 44 px, sits at the inline end in each direction, closes the palette and returns focus to the opener. Escape is unchanged; desktop is unchanged. | `packages/ui/src/command/CommandPalette.tsx` | Fixed |
| OPS-01 | P1 | A refused Request 360 drawer action showed its reason on the page behind the modal. The close, cancel and hide dialogs closed and lost the typed reason. | `run()` records which drawer or dialog sent the request. A refusal is shown inside it as a focused `ProblemAlert` (`role=alert`), and inputs are kept. The alert clears when the drawer opens or closes. Actions started on the page still report on the page. `ConfirmDialog` gains two optional props, used only by the three Request 360 dialogs: `problem`, and `onConfirm` may resolve `false` to stay open. | `apps/backoffice/src/pages/society/operations/RequestWorkspace.tsx`, `packages/ui/src/overlays/ConfirmDialog.tsx` | Fixed (residual: N-B2-3) |
| SH-02 | P1 | `MetricCard` without a link hid its value from screen readers (HQ ARR, CRM budget). `StatTile` left `context` out of its accessible name. | `MetricCard` renders `accessibleValue` as `sr-only` text in the non-link branch. The `StatTile` name is label, value, change, context; the context is skipped when `accessibleValue` already contains it, and a non-string context becomes `aria-describedby`. The call sites that had folded the context into `accessibleValue` now pass the amount only. | `MetricCard.tsx`, `StatTile.tsx`, `CollectionsPanel.tsx` (4 tiles), `SocietyDashboard.tsx` (3), `FinanceDashboard.tsx` (1) | Fixed |
| SH-04 | P2 | `SelectControl` with an `errorKey` never marked itself invalid, so its error never showed. | `isInvalid ?? !!errorKey`. Only the two household fields pass `errorKey` without `isInvalid`, and only while invalid. | `packages/ui/src/forms/ChoiceFields.tsx` | Fixed. The Flat select (needs a resident with several flats) uses the same code path but was not exercised in a browser. |
| RES-06 | P2 | The hidden file inputs on the proof form and the re-send form were invisible Tab stops. | `tabIndex={-1}` (attribute only). | `apps/customer-web/src/pages/dues/DuesPay.tsx`, `DuesPages.tsx` | Fixed |
| SH-10 | P3 | Keyboard focus on a tab panel was invisible. | Focus-visible classes on the panel plus `outline-solid`. The classes the backlog proposed draw nothing in Tailwind 4 (see N-B2-1). | `packages/ui/src/layout/Tabs.tsx` | Fixed |
| SH-11 | P3 | Calendar month buttons were named "Back" and "Next". | New keys `common:calendar.previousMonth` / `nextMonth`: "Previous month" / "Next month", Urdu "پچھلا مہینہ" / "اگلا مہینہ" (Urdu to a native reader). | `packages/ui/src/forms/DateField.tsx`, `apps/platform-hq/src/components/inputs.tsx`, `common.json` EN/UR | Fixed |
| SH-12 | P3 | `CheckboxField`'s description and error were not tied to the checkbox. | React Aria `CheckboxField` + `CheckboxButton`, with a `Text slot="description"` and `FieldError`. The DOM wrapper changed; the classes did not. | `packages/ui/src/forms/ChoiceFields.tsx` | Fixed |

**Two layout defects in the same components, fixed while testing:**
- **StatTile value clipped at 320 px / 200 %.** This was residual 5 in the S.1 hotfix report: values such as "Rs 355.8k" or "Rs 12.6 ہزا" were cut off. The value's size is now capped at `min(var(--text-3xl), 19cqi)`, so it only shrinks when it would not fit, and nowrap is kept. A first attempt that let the value wrap broke tokens mid-word and was replaced. The test now measures the value directly, because `layoutProblems` skips aria-hidden text.
- **ConfirmDialog 409 px wide at 320 px / 200 %, even with no refusal.** Its Close button was off screen. The footer buttons may now wrap and the reason box is `w-full`. Nothing changes at ordinary sizes.

**One existing test changed:** `tests/e2e/dashboard.spec.ts:167`. The `kpi-collected` name pattern now ends with the tile's context ("…% of Rs … scheduled"), which is the correct name under SH-02. Nothing else was loosened. No test was skipped, retry-wrapped or given a longer timeout.

## 2. Observed, not fixed

| Ref | Observation | Suggested home |
|---|---|---|
| N-B2-1 | **Fixed in §4 (Issue #20).** **Keyboard focus rings are not drawn across most of the product.** In Tailwind 4, `outline-none` sets `--tw-outline-style: none`, which `focus-visible:outline-2` and `data-focus-visible:outline-2` then use. The pattern is in 87 class strings across 88 files: header Search, bottom bar, menus, drawer body, tabs, pill tabs, stat tiles, metric and record cards, calendar cells. Header Search focused by keyboard draws no outline (measured). Only the SH-10 panel and the new Cancel button are fixed here. | Suggested priority P1 (WCAG 2.4.7). Batch B9, or a separate approval. A candidate one-rule fix is `:focus-visible, [data-focus-visible] { --tw-outline-style: solid; }` in `theme.css`, unlayered. It changes every focus state, so it needs approval. |
| N-B2-2 | At 320 px / 200 % the society dashboard scrolls sideways (21 px EN, 6 px UR) because of the "Waiting for checking" pill and the "Open ANR-RUN-202611" link (nowrap). | B10 |
| N-B2-3 | At 320 px / 200 % a drawer's fixed header and footer leave about 110 px for its body. The OPS-01 refusal is focused and scrolled into that space but only partly visible at once (Urdu triage). Residual risk for OPS-01. | B10 |
| N-B2-4 | Stat tile labels are clamped to two lines ("Billed for November…" at 200 %). | B10 |
| N-B2-5 | **Fixed in §4 (Issue #20).** A linked `MetricCard` with a non-string caption (resident "Paid to date") leaves the caption out of its name. | B9 |
| X-09 | Other `ConfirmDialog` callers still lose a refused reason. Already in the backlog. | B3 |

## 3. Integration notes

- **StatTile names change everywhere:** they now include the context line.
  - In S.3 Rentals, the `LeasesPage` tiles `rent-kpi-rent`, `rent-kpi-due` and `rent-kpi-payable` have contexts that repeat the amount. **Issue #20 (§4.2): StatTile now reads such a context from after the repeated figure, so no S.3 change is needed**; the names become e.g. "Monthly rent under management, Rs 1,234,500.00, a contract figure, not money received".
  - `rent-kpi-pending` gains its hint in the name.
  - S.3's tests do not assert StatTile names.
- **`SelectControl`:** invalid when it has an `errorKey`. S.3 passes no `errorKey` and is unaffected.
- **`ConfirmDialog`:** the new props are optional, so S.3's six uses are unaffected. Footer buttons can now wrap at narrow widths, and the reason box is `w-full`.
- **`MetricCard`:** adds an `sr-only` value, in the non-link branch only. Issue #20: a linked card with a markup caption gets `aria-describedby`.
- **Issue #20, `theme.css`:** one unlayered rule restores `--tw-outline-style: solid` under `:focus-visible` / `[data-focus-visible]`, and a base-layer rule removes the second ring a React Aria container drew around a focused control. Every keyboard focus ring in the product changes (it appears); other gates' evidence screenshots were not re-run, so any that show keyboard focus are older than this.
- **Issue #20, `ChoiceFields`:** `outline-none` on the checkbox, radio and switch labels (their indicator draws the ring).
- **`CommandPalette`:** new `data-testid="command-palette-cancel"`. The search row is wrapped in a new div.
- **Files B1 also touches:**
  - `apps/customer-web/src/pages/dues/DuesPages.tsx`: B2 adds one attribute on the re-send file input.
  - `CollectionsPanel.tsx` and `SocietyDashboard.tsx`: B2 changes the `accessibleValue` lines of the KPI tiles. A conflict is possible only if B1 edits the same lines.
- **`common.json` EN/UR:** a new `calendar` block between `actions` and `state`.
- **`tests/e2e/dashboard.spec.ts:167`:** S.3 has the same unchanged line, so the B2 edit should merge cleanly.

## 4. Issue #20 closure (7 November 2026)

GitHub Issue #20 raised N-B2-1 to P1 and asked that the Rentals KPI names be safe before the merge.
Base of this follow-up: `0884f03`. Frontend only; no visual redesign beyond the focus rings themselves.
Not a WCAG certification: a sighted keyboard check and Windows forced colours by a person are still
open (MANUAL_VERIFICATION.md, F1–F9).

### 4.1 Keyboard focus rings restored product-wide (N-B2-1)

**Cause.** In Tailwind 4, `outline-none` sets `--tw-outline-style: none` on the element, and
`focus-visible:outline-2` / `data-focus-visible:outline-2` draw `outline-style: var(--tw-outline-style)`.
88 class strings in 66 files combine the two (`test-results-b2/ring-audit.json`, not committed), so the
ring each of those controls asks for was never drawn.

**Fix: three bounded changes.**

1. **The ring.** One unlayered rule in `packages/tokens/src/theme.css`:
   `:focus-visible, [data-focus-visible] { --tw-outline-style: solid; }`.
   - It sets only the style variable, and only while an element has keyboard-visible focus.
   - An element without a focus outline utility keeps `outline-style: none`. Pointer focus (no
     `:focus-visible`, no `data-focus-visible`) is untouched.
   - Checked in the built CSS of all three apps: the rule is at top level, outside every cascade
     layer; `.outline-none` and the focus utilities are in `@layer utilities`. An unlayered rule
     outranks any layered one.
2. **One ring, not two.** React Aria also marks containers (Tabs, the tab list, a Select, a radio
   group) with `data-focus-visible` while focus is inside them, and the base rule drew a ring around
   them too. With the controls' own rings back, that became a second ring (and the Select one was
   already doubled).
   - A base-layer rule now removes the container ring when a descendant has keyboard focus:
     `[data-focus-visible]:not(label, [role='group']):has(:focus-visible, [data-focus-visible])`.
   - Labels (checkbox, radio, switch) and groups (a date field's box) keep theirs.
   - Any utility ring still wins.
3. **`ChoiceFields`.** `outline-none` on the checkbox, radio and switch labels. Their box, circle and
   track already draw the ring; the label ring was a second one.

**Measured, not assumed.** New helper `tests/support/focus.ts` reads three things:
- the computed style of the focused control;
- the rendered pixels on the ring's path: each pixel's focused colour against its unfocused colour,
  ≥ 3:1. This is WCAG 2.4.13's "change of contrast", and it also catches a ring that is clipped,
  covered or off screen;
- every other element drawing an outline at the same moment.

Two harness lessons are built into the helper:
- A right-to-left page that overflows sideways is screenshotted shifted from client coordinates, so
  a marker locates the shift.
- The WebKit project renders at 2× pixel density, so geometry is scaled by `devicePixelRatio`.

**Results.**
- Survey: a Tab walk over 15 screens of the three apps found **0 double rings**, and every stop draws
  a ring. Chart columns show focus with their own outline stroke.
- New spec `tests/e2e/ux-b2-focus.spec.ts`, 24 tests:
  - Representative controls of all three apps: header Search, sidebar, bottom bars, user menu, stat
    tiles, tabs and the tab panel, pill tabs, the drawer body and its controls, a record card, metric
    cards, calendar cells and month buttons, HQ search, metric card and tenant row/card, and the
    resident bar, Pay action, header and repair card.
  - Each in EN and UR (RTL), at 1440 px, at 390 px in dark mode with high contrast, and at 320 px with
    200 % text.
  - Also: the mouse press negative, disabled controls (skipped by Tab, draw nothing), a list inside a
    drawer and a menu inside a popover (one indicator), and emulated forced colours.
- Office measurements (66 rows): **≥ 94 % of ring pixels change by ≥ 3:1, median 7.94–14.67:1**, no
  second ring, and nothing clipped except the case below.
- A mouse press focuses without a ring in Chromium, Firefox and WebKit.

**Limits, stated in the tests.**
- The resident **Pay** action's raised circle covers the top of its inset ring by design (75 % of the
  ring shows at 390 px, 57 % at 320 px / 200 %).
- At 320 px / 200 % a drawer's scrolling body is shorter than a technician choice (N-B2-3), so the
  body clips the top and bottom of that choice's ring (72 % in Urdu). The sides show at 100 % ≥ 3:1.
- Text boxes show their ring on any focus, as they already did.

### 4.2 Rentals KPI names (S.3, accepted at `ae3b3a1`)

**Chosen: StatTile itself handles it**, with no S.3 call-site change.
- The context line goes into the name from after its leading figure, when that figure equals the
  start of the accessible value or of the displayed value.
- A "figure" here must contain a digit and end at a boundary in both strings (end, space, or
  punctuation followed by a space).
- So "Rs 1,234,500.00 · a contract figure…" is read as "…, Rs 1,234,500.00, a contract figure…".
- For `rent-kpi-payable` (`accessibleValue` "Rs X. hint", context "Rs X · hint") the context is then
  already inside the value and is dropped, so the amount and the hint are each read once.

**Why it is not fragile.** It needs an identical leading figure. Contexts that only mention another
figure ("10 accounts late · Rs 392,300.00…", "81% of Rs 1.5B scheduled"), share only a word ("Not
billed yet" vs "No billing run yet"), or extend a number ("1,250" vs "1,250.5 m²") are untouched.

**Tests:**
- `MetricCard.test.tsx` rebuilds LeasesPage's exact five tiles with `formatMoney` /
  `formatMoneyCompact` and the S.3 hints, in EN and UR. Each amount and each hint appears exactly once.
- Every B2 tile pattern keeps its name.
- `dashboard.spec.ts:167` and all `ux-b2.spec.ts` name assertions pass unchanged.

### 4.3 Follow-ups

| Ref | Status after Issue #20 |
|---|---|
| N-B2-1 | **Fixed** (4.1). |
| N-B2-2 | Open (B10): the society dashboard scrolls sideways at 320 px / 200 % (21 px EN, 6 px UR). |
| N-B2-3 | Open (B10): drawer body about 110 px at 320 px / 200 %; it now also clips a tall control's focus ring there. |
| N-B2-4 | Open (B10): stat tile labels clamped to two lines at 200 %. |
| N-B2-5 | **Fixed**: same pattern as StatTile. A linked `MetricCard` whose caption is markup gets the caption as `aria-describedby`. |
| N-B2-7 | **New**, open (B10 / theme). In dark mode with high contrast, the society dashboard's aging bar labels are black on dark green (1.92:1, axe `color-contrast`, 2 nodes, EN and UR). Identical on the base `04b6fde`, so pre-existing. |

### 4.4 Final regression (the committed code)

Full numbers and every interim failure are in [`test-results.md`](test-results.md), "Issue #20".
- tsc and lint clean; i18n 10,296 keys × 2.
- Vitest **1,536 / 1,536**.
- Complete combined Chromium run (all gates + B2 e2e + focus spec + B2 evidence, 3 workers, retries
  off): **472 / 472** in 38.2 min.
- Axe: **1,464 scans, 0 violations**.
- Full smoke: **Firefox 28 / 28, WebKit 28 / 28**.
- 48 screenshots: 18 new keyboard-focus shots r01–r09 in EN and UR.
- The known intermittents (D.1 `identity.spec.ts:327`, WebKit S.2a "a new guard") did not fail in
  these runs. That proves nothing about them either way.
