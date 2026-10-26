# PropertyOS — Read Me First (V2.0, 26 October 2026)

**PropertyOS is a technical codename, not an approved company/brand name.** JOR and other names were discussed but not confirmed. Keep code and domain names neutral until branding is legally checked.

## Your one action
Upload this ZIP to your current Claude Fable session and paste the instructions from `02_CLAUDE_FABLE_START_HERE.md`.

## New decisions in V2
1. **UI-first development is authorized immediately.** Build a genuinely navigable prototype with typed fixtures; no production backend migrations or real payment processing yet.
2. **One responsive customer web/PWA codebase for desktop, tablet, phone.** A native wrapper can be evaluated later. The backoffice itself is responsive too. The cinematic public website can be a separate branded frontend, but consumes shared services and design foundations.
3. **English + Urdu from day one**, with true RTL switching, not translated strings in an unchanged English layout; other languages become configuration.
4. **Accessibility is a release requirement:** target WCAG 2.2 AA, screen reader and keyboard journeys, 200% zoom, reduced motion, robust color contrast.
5. **Payments V1:** manual bank transfer with upload/verification plus one prospective gateway adapter (Safepay). Gateway onboarding and each payment rail's availability must be confirmed with the provider. No real money in UI prototype.
6. **Connected workspace:** consistent tabs, breadcrumb, Related drawer, Ctrl+K for record/route/action search, quick actions, loading, error recovery, help, saved filters, permission-aware UI.
7. **Company finance is in scope:** GL, AR/AP, supplier bills, utility bills, expenses, payroll accounting, budgets, cost centers, reconciliation and reports. Some operational modules come after the first vertical slice.

## V2.1 addition — Guided Onboarding
9. **Game-style spotlight tours and interactive training** are a core platform UX feature: accessible first-login opt-in, role-aware module walkthroughs, mobile/desktop adaptation, EN/Urdu RTL, skip/resume/replay, and demo-only practice transactions. Read `09_INTERACTIVE_GUIDED_ONBOARDING.md`.

## What to read
- `01_MASTER_BLUEPRINT_V2.md` — comprehensive self-contained product/UX/architecture Markdown, including full screen map
- `02_CLAUDE_FABLE_START_HERE.md` — prompt to paste into Claude
- `03_UI_FIRST_EXECUTION_STAGES.md` — staged implementation with proof-of-done
- `04_ACCESSIBILITY_I18N_QA.md` — test checklist for English, Urdu, desktop, mobile, screen readers
- `05_PAYMENT_AND_FINANCE_RULES.md` — business and payment integrity specifications
- `06_SCREEN_REGISTER.csv` — screen inventory to build routes and track coverage
- `07_DESIGN_TOKENS_AND_PATTERNS.md` — reusable design tokens and component architecture
- `08_IMPLEMENTATION_NOTES_AND_DECISIONS.md` — what has/hasn't been decided
- `09_INTERACTIVE_GUIDED_ONBOARDING.md` — official first-login spotlight tours, module guides, training mode and QA

## How to work with Claude
Do **not** send 15 separate chat replies. Send this single ZIP. Start with **Stage 0** audit/shell and ask Claude to report the actual files, routes, screenshots, checks. Approve each stage before the next. It can implement UI files on Stage 1 onward, but must not touch real payment/financial persistence, tenancy migrations, or production business logic without explicit later authorization.

## Definition of UI-complete
UI-complete is not “a few beautiful dashboards.” It means **all routes on the screen register have a usable representation; all high-priority journeys run end-to-end with deterministic mock data; each representative template is fully responsive, in English and Urdu RTL, and keyboard/screen-reader tested; no dead buttons**. Backend hookup is a later stage.
