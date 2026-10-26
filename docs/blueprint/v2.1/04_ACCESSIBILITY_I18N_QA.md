# PropertyOS — Accessibility, Internationalization, Responsive QA

Target: WCAG 2.2 AA across public, backoffice, authenticated customer app, documents and payment flows; claim compliance only after evidence-based evaluation.

## Core UI checks
- [ ] EN/Urdu language switch visible and keyboard accessible.
- [ ] Locale switch changes `html.lang` and `html.dir` correctly.
- [ ] RTL sidebar, breadcrumbs, input adornments, tabs, stepper, drawers and main reading order mirror as intended.
- [ ] Latin reference IDs, IBAN, phone, email, amounts and URLs render correctly in Urdu.
- [ ] User-typed form values persist during locale change.
- [ ] Urdu fonts support all glyphs and readable line heights; no overlapping form text.
- [ ] All core translations exist; missing keys are tracked, not silently shown as cryptic IDs.
- [ ] Translation of validation, toast and help content included.
- [ ] Dates, times and PKR formats localized correctly; financial amounts do not change.
- [ ] Keyboard-only user can reach command palette, open a record, change tabs, use data grid, open drawer, submit simulated proof.
- [ ] Visible focus; modal focus trap and restoration; skip link; meaningful page titles.
- [ ] Screen readers announce name, role, state and result of form/dialog/listbox/table controls.
- [ ] ARIA live announcements for async success/error without unnecessary noise.
- [ ] No important action communicated by color alone, sound alone or hover alone.
- [ ] Text contrast ≥4.5:1; large text ≥3:1; essential non-text indicators ≥3:1 (test exact pairs).
- [ ] Text at 200% zoom remains usable, including Urdu and forms; no essential content clipped.
- [ ] At 320px mobile width, content reflows or labeled data table scrolls internally where genuinely tabular.
- [ ] Touch targets comfortably ~44x44 where feasible; meet applicable WCAG 2.2 target spacing/minimum requirements.
- [ ] Input errors associated to controls; accessible summary on submit as needed.
- [ ] No keyboard traps in animated story/3D/unit map/drag board.
- [ ] User can turn motion off; reduced-motion content equivalent.
- [ ] Photos/maps/3D tours have descriptions/list alternatives; not needed to navigate through a visual floor map to book.
- [ ] Captions/transcripts on meaningful media.
- [ ] Optional success/error sounds OFF by default with visible preference; never sole feedback.
- [ ] No misleading `Payment successful` on screenshot submission. Uses `Awaiting verification`.
- [ ] Provide customer app payment proof upload without drag-only input; native picker/camera works.
- [ ] Checkout hosted by provider tested as third-party accessibility; accessible bank transfer alternative if problems.
- [ ] Test user roles: Developer Owner, Sales, Finance, Maintenance, Security, Customer/Resident.
- [ ] Unauthorized routes/actions/search results inaccessible after mocked role switch; later require backend tests.

## Guided onboarding / spotlight tour test cases
- [ ] First login offers an optional tour with clear Skip; no forced blocking tutorial.
- [ ] Spotlight target and guide card are visible at desktop and mobile widths.
- [ ] Urdu guide, Step x/y, buttons and arrow positioning work with RTL.
- [ ] No visual cue is required to use the text-only guide.
- [ ] Keyboard focus movement, Escape and restoration are correct.
- [ ] Guided-action and explanatory-modal steps are tested separately for screen-reader behavior.
- [ ] Missing/unauthorized targets are skipped safely, with no permission leaks.
- [ ] New tenant/user/persona sees appropriate first-use status; completed tours do not repeat on every login.
- [ ] Help menu can replay/resume tour.
- [ ] Reduced-motion disables pulse/smooth movement without losing context.
- [ ] EN ↔ Urdu and desktop ↔ phone transitions preserve tour step.
- [ ] Practice Mode makes no real business/financial changes and visibly indicates demo data.

## Test matrix
| Scenario | 390 phone | 768 tablet | 1440 desktop | Urdu RTL | Keyboard | Screen reader |
|---|---:|---:|---:|---:|---:|---:|
| Lead lookup → details | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project/unit explorer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create booking demo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invoice/pay/manual proof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Supplier expense | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Resident maintenance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Visitor pass | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Public site visit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Check 360, 430, 1024, 1920 additional widths; 200% zoom; iOS Safari, Android Chrome, desktop Chrome/Firefox/Safari if possible.

## Tools
Playwright; axe-core integration; Lighthouse accessibility/performance; manual NVDA, VoiceOver, TalkBack; actual disability user-testing when practical. Automated scores alone do not establish accessibility conformance.

## Evidence
Store screenshots/tests/known issues under `docs/status/ui-stage-N/`, describe environment and test date; do not fabricate passing tests.
