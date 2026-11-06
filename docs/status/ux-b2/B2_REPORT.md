# UX repair batch B2: accessibility blockers and one-line shared fixes

**Branch:** `fix/ux-b2-accessibility`. Code commit `a0897b9`, on the accepted S.1 hotfix `04b6fde` (Issue #18, closed).
**Source:** the GPT-accepted UX backlog, `docs/ux-backlog` at `90c2b0a`, §8 batch B2. That backlog triages the audit `docs/frontend-ux-audit` at `1a0779e`.
**Scope:** the eight B2 findings: SH-01, OPS-01, SH-02, SH-04, RES-06, SH-10, SH-11 and SH-12. Frontend only. No visual redesign; shared-component changes are additive.
**Status:** pushed and stopped for GPT and owner review. This is not a WCAG certification: no screen reader has been run (see [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).

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
| N-B2-1 | **Keyboard focus rings are not drawn across most of the product.** In Tailwind 4, `outline-none` sets `--tw-outline-style: none`, which `focus-visible:outline-2` and `data-focus-visible:outline-2` then use. The pattern is in 87 class strings across 88 files: header Search, bottom bar, menus, drawer body, tabs, pill tabs, stat tiles, metric and record cards, calendar cells. Header Search focused by keyboard draws no outline (measured). Only the SH-10 panel and the new Cancel button are fixed here. | Suggested priority P1 (WCAG 2.4.7). Batch B9, or a separate approval. A candidate one-rule fix is `:focus-visible, [data-focus-visible] { --tw-outline-style: solid; }` in `theme.css`, unlayered. It changes every focus state, so it needs approval. |
| N-B2-2 | At 320 px / 200 % the society dashboard scrolls sideways (21 px EN, 6 px UR) because of the "Waiting for checking" pill and the "Open ANR-RUN-202611" link (nowrap). | B10 |
| N-B2-3 | At 320 px / 200 % a drawer's fixed header and footer leave about 110 px for its body. The OPS-01 refusal is focused and scrolled into that space but only partly visible at once (Urdu triage). Residual risk for OPS-01. | B10 |
| N-B2-4 | Stat tile labels are clamped to two lines ("Billed for November…" at 200 %). | B10 |
| N-B2-5 | A linked `MetricCard` with a non-string caption (resident "Paid to date") leaves the caption out of its name. | B9 |
| X-09 | Other `ConfirmDialog` callers still lose a refused reason. Already in the backlog. | B3 |

## 3. Integration notes

- **StatTile names change everywhere:** they now include the context line.
  - In S.3 Rentals, the `LeasesPage` tiles `rent-kpi-rent`, `rent-kpi-due` and `rent-kpi-payable` have contexts that repeat the amount, so the amount will be read twice once B2 and S.3 are combined. Either drop the amount from those contexts, or simplify the payable tile's `accessibleValue`.
  - `rent-kpi-pending` gains its hint in the name.
  - S.3's tests do not assert StatTile names.
- **`SelectControl`:** invalid when it has an `errorKey`. S.3 passes no `errorKey` and is unaffected.
- **`ConfirmDialog`:** the new props are optional, so S.3's six uses are unaffected. Footer buttons can now wrap at narrow widths, and the reason box is `w-full`.
- **`MetricCard`:** adds an `sr-only` value, in the non-link branch only.
- **`CommandPalette`:** new `data-testid="command-palette-cancel"`. The search row is wrapped in a new div.
- **Files B1 also touches:**
  - `apps/customer-web/src/pages/dues/DuesPages.tsx`: B2 adds one attribute on the re-send file input.
  - `CollectionsPanel.tsx` and `SocietyDashboard.tsx`: B2 changes the `accessibleValue` lines of the KPI tiles. A conflict is possible only if B1 edits the same lines.
- **`common.json` EN/UR:** a new `calendar` block between `actions` and `state`.
- **`tests/e2e/dashboard.spec.ts:167`:** S.3 has the same unchanged line, so the B2 edit should merge cleanly.
