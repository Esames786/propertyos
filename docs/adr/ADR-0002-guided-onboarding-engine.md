# ADR-0002 — Guided onboarding engine: own React engine on React Aria, not Driver.js

| | |
|---|---|
| **Status** | Accepted 2026-10-26 |
| **Date** | 2026-10-26 |
| **Blueprint** | `09_INTERACTIVE_GUIDED_ONBOARDING.md` §8 suggests Driver.js "after verifying behavior with React route transitions and accessibility" |

## 1. Context

Doc 09 needs four kinds of interaction from the tour system:

- **`EXPLAIN` steps** behave as WAI-ARIA modal dialogs: focus moves in, the page is inert, Escape closes and focus is restored.
- **`GUIDED_ACTION` steps** are deliberately *non-modal*: the user operates the highlighted control and the tour advances on a completion event.
- **`SIMULATED_TASK` steps** run in training mode with a DEMO banner.
- **All steps** must:
  - translate live when EN↔اردو is switched mid-step;
  - mirror placement in RTL;
  - switch anchors between sidebar and phone menu;
  - skip unauthorized or missing targets without leaking names;
  - respect reduced motion;
  - never hijack typing.

## 2. Evidence: Driver.js 1.10.2 (MIT), inspected from the published `dist/driver.js.mjs`

| Finding | Conflict with doc 09 |
|---|---|
| Global `keydown` handler maps `ArrowRight`→next and `ArrowLeft`→previous whenever `allowKeyboardControl` is on (the default), with no check of the focused element | Hijacks caret movement in text fields during `GUIDED_ACTION` steps (doc 09 §7 "not hijack typing"). The physical direction is backwards in RTL (§6). |
| Title, description and button labels are assigned with `innerHTML` | Content is HTML strings, not React. Doc 09 §9 forbids arbitrary HTML in tour content. |
| Popover DOM is created imperatively outside the React tree | Does not re-render when the i18next language changes. Every locale switch needs a manual teardown and re-highlight, so the step state lives outside our store. |
| Writes `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` onto the **application's** highlighted element | Mutates attributes React owns and misdescribes ordinary buttons to screen readers. |
| Focus is kept by a Tab-key handler cycling between popover and active element; the page is not made inert | Doesn't fit either required pattern: not a real modal for `EXPLAIN`, and not a clean non-modal for `GUIDED_ACTION`. |
| Popover sides are physical `left`/`right` | Needs a mapping layer for RTL. |

With keyboard control off, content kept out of `innerHTML` and its ARIA handling replaced, what is left of Driver.js is the SVG cutout and the positioning. Both are small, and React Aria already provides RTL-aware positioning.

Shepherd.js is not considered further: doc 09 flags its commercial licensing.

## 3. Decision

Build the engine in `packages/ui/src/onboarding/` with the file layout doc 09 §8 proposes. It is composed from parts already in the design system:

| Part | Implementation |
|---|---|
| State | Pure reducer `tourMachine.ts`: `idle → offered → running(step) ⇄ paused → completed / dismissed`. Events: start, next, back, skip, close, resume, targetFound, targetMissing, routeChanged, breakpointChanged. Unit-tested without a DOM. |
| Step resolution | Filter by `requiredPermission` for the active demo persona. Choose `mobileTargetId` below the `md` breakpoint, otherwise `targetId`. Look the anchor up in a `TourAnchor` registry (`data-tour-id`, registered by React ref). Wait up to 3 s for an anchor that is not yet rendered, then apply the step's `fallback`: `skip` or `explain` (text explanation with no highlight). Never highlight an element that is hidden, has a zero-size box or is inert. |
| `EXPLAIN` rendering | React Aria `ModalOverlay` + `Modal` + `Dialog`: real modal semantics, inert page, Escape, focus restore. Scrim is an SVG with a cut-out around the target. The card is positioned next to the target with React Aria's overlay positioning (logical `start`/`end`, auto-flip). |
| `GUIDED_ACTION` rendering | Non-modal `Popover` (`isNonModal`) labelled as a dialog. Pointer input is blocked outside the cut-out by four scrim panels; the page is **not** claimed inert. The card includes a "Go to highlighted control" button. Advances on a typed `completionEvent` emitted by app code. |
| `SIMULATED_TASK` | `GUIDED_ACTION` + `TrainingProvider`: writes are routed to the training store and `PracticeModeBanner` stays visible ("TRAINING / DEMO — no real transaction"). |
| Phone layout | Below 640 px the card becomes a bottom or top sheet, whichever side does not cover the target. |
| Announcements | One polite live-region message per step change ("Step 3 of 6: Current project"). Pointer and pulse are `aria-hidden`. |
| Keyboard | Tab/Shift+Tab within the card, Enter/Space on buttons, Escape pauses (resumable from Help). No global arrow-key bindings. |
| Locale/RTL | The card is ordinary React with `useTranslation`, so it re-renders on language change. Position is recomputed on `dir` change and on resize. "Next" always means index + 1; only its arrow icon mirrors. |
| Motion | `prefers-reduced-motion` or the in-app setting turns off spotlight travel and pulse; the ring and scrim stay. High-contrast setting: 65 % scrim and a 3 px solid ring. |
| Text-only guide | Route `/backoffice/help/tours/:tourId/text`: an ordered list of the same steps, each with a "Show me" action that focuses or opens the real control. No overlay is needed. |
| Auto-offer guard | Pages and forms register a "busy" lock (dirty form, payment, reconciliation, any route flagged `noAutoTour`). The welcome offer waits until no lock is held. Tours never auto-start over a critical flow. |
| Progress | `TourProgressStore` interface. Prototype `LocalTourProgressStore` uses `localStorage` with an in-memory fallback, keyed `{tenant}:{persona}:{app}:{tourId}:v{version}`. It stores only status, last step id and timestamps, mirroring the future `user_tour_progress` columns. An `ApiTourProgressStore` replaces it at the backend stage. |

Tour definitions follow doc 09's `TourDefinition`/`TourStep` types. Two additions:

- `fallback: 'skip' | 'explain'` on each step.
- `minVersionSeen` for future "What's new" tours.

Strings live in the `onboarding` namespace of `@repo/i18n` (`locales/{en-PK,ur-PK}/onboarding.json`), not in `packages/ui/src/onboarding/locales/` as doc 09's example shows. That keeps one dictionary system and one parity check.

## 4. Consequences

- About 600–800 lines of our own code to own and test, in exchange for:
  - one focus and dialog model shared with the rest of the UI;
  - live translation;
  - RTL placement for free;
  - no attribute mutation of app elements;
  - a progress model that maps one-to-one to the future backend table.
- Driver.js stays a documented fallback (MIT) if the custom positioning turns out weaker in testing.
- Manual NVDA/VoiceOver checks of both the modal and non-modal step patterns are still required (doc 09 §4). Automated tests cannot establish them.

## 5. Approval needed

Approve the custom engine instead of the Driver.js suggestion.
