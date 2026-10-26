# PropertyOS — Guided Onboarding, Spotlight Tours & Interactive Training

**Version:** 2.1 · **Status:** APPROVED FOR UI-FIRST PROTOTYPE · **Product name:** PropertyOS remains a codename.

## 1. Intent

Build a first-class, game-inspired **guided assistance system** that introduces PropertyOS one useful task at a time. The visual metaphor is a spotlight that focuses on the active control while the surroundings become gently dimmed, together with an anchored, animated explanatory card. Users must remain able to skip, revisit, use keyboard/screen readers, and take a text-only route. Avoid forced multi-minute tutorials, flashing highlights, or accessibility barriers.

**This is a cross-application product capability**, not one throwaway first-login component. It is shared by backoffice, customer web/PWA and—where applicable—the public website. Different tours and visual treatments can be registered per application.

## 2. Experience map

### A. First-login welcome (optional, never coercive)
1. When a new user enters for the first time, show a small, accessible welcome card with two equally discoverable choices: **Start 2-minute tour** / **Explore on my own**.
2. Explain the role-specific benefit in the selected language: "Find your customers, manage tasks and navigate anywhere quickly."
3. Tour begins only after explicit acceptance. Skip records a dismiss/resume decision but never blocks using the application.
4. If the user chooses the tour, a translucent scrim gently dims the surroundings, the selected element receives a **high-contrast focus ring and spotlight**, and a floating card explains what to do.
5. A visual pointer or restrained animation connects the guide to the focused element. Avoid cartoon characters by default; a future branded mascot/avatar is optional, never essential.
6. Provide **Back**, **Next**, **Skip**, **Step x/y**, and **Don't show automatically** where appropriate.
7. Finish with a brief completion confirmation and options **Try a practice task** / **Open Help** / **Go to dashboard**.

### B. Module-first-use tours
Launching Sales, Projects, Booking, Finance, Suppliers, HR, Operations, or Residents for the first time may offer a small opt-in tour **if the role has access**. Prefer 4–7 high-value steps and a clear goal, not 20 tooltips.

### C. Interactive learning (“Practice Mode”)
Contextual walkthroughs can offer a safely simulated exercise, e.g.:
- Sales: create a fictional lead, schedule a visit, open a unit, prepare a sample quotation.
- Finance: inspect a fictional invoice, select an allocation, review a **mock** transfer verification.
- Project manager: navigate Inventory Matrix → unit detail → pricing/history.
- Maintenance: create and assign a mock work order.
- Resident: locate a payment, submit a **demo-only** proof image, raise a mock request.

All practice actions are fixture-backed, clearly labeled **TRAINING / DEMO — no real transaction**, and cannot mutate production data. Training state is separate from normal work state. Do not trigger live SMS/WhatsApp, payment capture, final booking, accounting journal, visitor gate access, or other consequential effects.

### D. Contextual “?” help and feature hints
Every significant module includes `? Help → Take a tour`, `? Help → Show me how`, and inline field explanations. Small pulsing hint dots are *optional*, restrained, dismissible and not required to discover help.

### E. What's new (future)
When a module changes materially, offer a brief, **versioned** introduction just to the newly added capability, not the full first-use tour again.

## 3. Tour examples (initial approved scripts)

### GLOBAL-TOUR-001 — Backoffice essentials (six steps)
1. **Welcome** — “Your workspace, tasks, and connected records in one place.” No anchor required.
2. **Sidebar** — “Switch between major work areas here.” Spotlight `[data-tour-id="nav-primary"]`.
3. **Current project** — “Filter your work to a particular project. You can clear this at any time.” Target `project-switcher`.
4. **Command search** — “Press Ctrl+K or tap Search to find a customer, unit, invoice, screen, or action.” Target `command-search`.
5. **Quick Create** — “Start a lead, visit, or another authorized task without leaving your screen.” Target `quick-create`.
6. **Related and Help** — “Follow related records, or replay this guide from Help.” Target `global-help`.

### SALES-TOUR-001 — First day in Sales
1. Lead list and assigned leads
2. Saved filters and next follow-up
3. Lead workspace
4. Customer/Opportunity link
5. Schedule visit action
6. Related unit/quote links
7. Try a practice lead (opt-in)

### PROJECT-TOUR-001 — Explore inventory
1. Select a project and tower
2. Understand status labels, not colors alone
3. Filter by availability/type
4. Select a unit → quick preview
5. Open the full unit workspace
6. View related quotation/booking

### FINANCE-TOUR-001 — Collections overview
1. Explain due, overdue, collected and pending verification
2. Find an invoice with search
3. Inspect payment allocations
4. Open proof-verification queue (role authorized only)
5. Navigate to related customer/booking
6. Try a fake allocation in Practice Mode

### RESIDENT-TOUR-001 — Your property in your pocket
1. Property details
2. Upcoming payments
3. Documents and receipts
4. Maintenance/service request
5. Visitor pass and Help

## 4. UI states and interactions

### Spotlight styling
- Subtle dimmed overlay (e.g. 45–65% translucent neutral), not a heavy blur that makes visual context illegible.
- Spotlight cutout with visible outline/high contrast and breathing space around target.
- Popover auto-positions to avoid clipping; on narrow devices it uses a bottom sheet or top/bottom region that does not obscure the target.
- Pointer/arrow or very subtle pulse indicates anchor; no endless flashing animation.
- Do **not** allow accessibility to depend on visual spotlight or arrow.
- Offer `Reduce motion`, `High contrast`, and **Text-only guide**. Respect OS `prefers-reduced-motion`.
- Do not obscure emergency/security actions with an automatic tour.

### Controls
`Back` | `Next` | `Skip tour` | `x of y` | optional `Try this` | `Restart` | `Resume`.
On completion offer a path into the real workspace.

### Tour types
1. `EXPLAIN` — educational, no underlying interaction required; dialogue-like focus management.
2. `GUIDED_ACTION` — instructs the user to interact with a **safe** highlighted element, validates completion, then advances.
3. `SIMULATED_TASK` — deliberately uses mock/training data and displays a training banner.

**Accessibility warning:** do not claim the underlying page is inert while allowing arbitrary interaction with it. An `EXPLAIN` modal step should behave like a modal dialog (accessible focus and inert underlying UI); a `GUIDED_ACTION` step must use a deliberate nonmodal interaction design with predictable focus management. Test both patterns manually with screen readers.

### Dynamics
- Tour survives route navigation, scroll, drawer opening, responsive breakpoint changes, and EN↔Urdu switching where feasible.
- If the target is not rendered/authorized, **skip to the next valid step** or show a safe generic text explanation. Never highlight a ghost element or leak unauthorized feature names.
- If loading, wait for the real anchor with a timeout and fallback; do not use arbitrary giant delays.
- Tour may be paused/dismissed without losing unsaved forms.
- Responsive step anchors may differ for sidebar vs bottom navigation but refer to the same semantic tour ID.
- Avoid auto-starting a tour if a user is processing a payment, filling a long form, or using a critical workflow.

## 5. Roles, permissions and timing

Suggested tour selector:
`tenant / app / persona / module / tour_version / preferred_locale / device_context`.

Only return steps whose `requiredPermission` and `scope` requirements are satisfied. The backend must ultimately enforce record permissions; a client-side tour is never a permission boundary.

A first login means first login for the **specific organization and application/persona**, not necessarily first login to a global email account.

Never re-show a dismissed/completed tour on every login. Provide a Help menu entry to replay it deliberately. When a major feature changes, publish a new tour version with separate seen/progress state.

## 6. Internationalization and RTL

- All strings live in locale dictionaries; no hard-coded English within tour definitions.
- `html.lang` and `html.dir` reflect current locale; Urdu steps read right-to-left.
- Position anchored cards according to available geometry, not hard-coded `left: 20px` and other LTR assumptions.
- Labels `Next`, `Back`, `Skip`, progress, voiceover descriptions, help, and all practice feedback translate.
- Arrow icon direction is tested in RTL but semantic “Next” still means the next step (index + 1).
- The guide continues at its current step when the user changes languages.
- Unit numbers, invoice references, money, phone and IBAN remain bidi-safe.

## 7. Accessibility (WCAG 2.2 AA target)

- Use a real accessible heading/title, clear instructions, labeled controls.
- Keyboard: Tab and Shift+Tab operate tour controls, Enter/Space activate, Escape safely closes, visible focus always present. `Back/Next` keyboard support should be obvious and not hijack typing.
- In explanatory modal steps, follow WAI-ARIA modal dialog behavior: move initial focus inside, keep it inside while active, and restore logical focus on close.
- Screen-reader announcement for title and step number when transitioning; avoid repeatedly announcing every movement of a decorative arrow.
- Guide controls remain reachable at 320px and at 200% zoom.
- Contrast and target sizes tested; no color-only information.
- Offer nonvisual alternate walkthrough: accessible textual sequence with corresponding labeled routes/actions.
- Optional auditory narration can be developed later, OFF by default, with locale choice, pause and caption/visible equivalence. Do not synthesize or autoplay speech by default.
- Do not force an accessible user to complete a visual tutorial as a prerequisite to using the product.

Reference: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

## 8. Proposed React/TypeScript architecture

Shared package (example, adapt to actual repo):

```
packages/ui/src/onboarding/
  GuidedTourProvider.tsx
  TourOverlay.tsx
  TourPopover.tsx
  TourControls.tsx
  TourRegistry.ts
  TourAnchor.tsx
  TourProgressStore.ts
  useGuidedTour.ts
  tourTypes.ts
  accessibility.ts
  tours/
    backoffice.ts
    sales.ts
    inventory.ts
    finance.ts
    resident.ts
  locales/
    en.json
    ur.json
```

Use stable semantic anchors (`data-tour-id`) rather than generated CSS class names or nth-child selectors. The underlying engine can use **Driver.js** for spotlight, automatic positioning and steps, after verifying behavior with React route transitions and accessibility. Driver.js is MIT licensed; library choice is not permission to skip screen-reader/focus QA. Shepherd.js is another option but its commercial licensing must be evaluated before use.

Example typed definition (illustrative, adapt in repo):

```ts
export type TourKind = 'EXPLAIN' | 'GUIDED_ACTION' | 'SIMULATED_TASK';

export type TourStep = {
  id: string;
  targetId?: string;
  titleKey: string;
  bodyKey: string;
  kind: TourKind;
  route?: string;
  requiredPermission?: string;
  completionEvent?: string;
  mobileTargetId?: string;
};

export type TourDefinition = {
  id: string;
  version: number;
  app: 'backoffice' | 'customer' | 'public';
  applicablePersonas: string[];
  steps: TourStep[];
};
```

**Prototype progress store:** lightweight client store keyed by demo persona, app, tour ID and version. Store only progress/preferences, no financial or personally identifying information.

**Future backend model (conceptual, do NOT migrate during UI-first stage):**

`user_tour_progress`: `id`, `global_user_id`, `tenant_id`, `application`, `tour_id`, `tour_version`, `status`, `last_step_id`, `started_at`, `completed_at`, `dismissed_at`, `updated_at`.

Unique logical key: `tenant + user + app + tour + version`. Backend/API should later serve progress across devices. Define role-derived steps safely and allow user to reset/replay tour.

## 9. Admin/content authoring (later, not P0)

Later, authorized admins may select which approved tours display for roles, but they may not embed unsafe arbitrary HTML or unrestricted JS into content. Tour definitions and help translations should be reviewed/published through versioned content. Measure only privacy-safe aggregate adoption/completion metrics, with user consent/policies as applicable.

## 10. Stage allocation

### Stage 1 — Foundation (MUST DELIVER)
- Tour engine/provider, overlay, card, controls, localization, RTL, reduced motion, accessibility baseline.
- `GLOBAL-TOUR-001` with 6 real anchors; first-login opt-in with fictional demo identity.
- Help → Take a tour; skip/replay; progress persistence per persona.
- Accessible text-only tour alternative; mobile layout.

### Stage 2 — Screen registration
- Stable `data-tour-id` anchors in reusable workspace templates and key domain screens.
- Register tours in a manifest, typed and route aware.

### Stage 3 — Connected workflows
- Sales, Inventory, Finance, Project, Handover and Maintenance tours along with safe interactive training exercises.
- Critical actions in training can never call live services.

### Stage 4 — Customer PWA
- `RESIDENT-TOUR-001` in mobile and desktop layout, with payment/maintenance practice using demo fixtures.

### Stage 5 — Public site (optional)
- Nonintrusive tour of tower/floor explorer with accessible list alternative; no auto-overlay on cinematic hero.

### Stage 6 — Accessibility QA
- Manual keyboard, NVDA/VoiceOver/TalkBack; desktop/tablet/mobile, EN/Urdu, zoom/reflow, reduced motion, missing targets, role switch, interruptions, slow route.

## 11. Acceptance tests

1. New Sales demo account offered tour once, can skip without penalty.
2. Tour points to actual component at 1440 desktop, 390 phone, and 320 reflow.
3. Changing EN→Urdu during step 3 preserves progress and switches layout/content appropriately.
4. On mobile, tour highlights correct menu/search alternatives, not invisible desktop sidebar.
5. Tour excludes Finance-only steps for Sales persona and never hints private customer records outside scope.
6. After skip/replay, tour can be manually launched from Help.
7. Completing step 6 marks exact tour version complete for that persona/tenant/app.
8. Slow-loading/missing target recovers without freezing or exposing dead overlay.
9. Keyboard user can start, navigate, skip and close; focus restoration verified.
10. Screen-reader user receives useful step text and navigates same meaningful journey without spotlight.
11. Reduced-motion turns off animated pulse/smooth spotlight movement but preserves highlight semantics.
12. Simulated payment tutorial never fires a real gateway/bank/API mutation and states **DEMO ONLY**.
13. No guide unexpectedly opens during real billing/reconciliation or interrupts unsaved form entry.
14. No tour depends on optional audio, hover, drag, flashing or color alone.
15. Test results are reported; do not claim WCAG conformance without complete independent validation.

## 12. References / licensing

- WAI-ARIA modal dialog design: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Driver.js documentation: https://driverjs.com/docs/configuration
- Driver.js MIT license: https://github.com/nilbuild/driver.js/blob/master/license
- Shepherd.js licensing: https://www.shepherdjs.dev/about/
