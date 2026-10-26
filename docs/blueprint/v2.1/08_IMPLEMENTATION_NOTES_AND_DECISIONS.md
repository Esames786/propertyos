# PropertyOS — Architecture Decisions, Assumptions and Risks

## Decisions accepted for UI-first implementation
- Multi-tenant property developer platform with deep lifecycle and full developer finance.
- React/TypeScript frontend design system; mobile-responsive backoffice.
- One responsive customer web/PWA codebase; native app is not V1.
- Separate SEO/cinematic public marketing frontend is acceptable; it is responsive too and shares contracts.
- English + Urdu (RTL) in V1, extensible i18n.
- WCAG 2.2 AA is the accessibility target; validation required.
- Connected workspaces, contextual tabs, related drawer, command search, reliable feedback, advanced forms.
- Guided onboarding is a mandatory reusable Stage 1 component: spotlight/dimmed overlay, accessible tour controls, first-login opt-in, module tours, Help replay, EN/Urdu RTL, role-aware steps and safe training mode.
- One proposed gateway (Safepay) plus manual bank verification, not five independent integrations.
- UI-first prototypes with fixtures and simulated actions now; authoritative backend later.

## Working assumptions (can be adjusted by repo inspection)
- Laravel modular monolith eventually owns business domain/tenancy/accounting.
- Backoffice likely uses Inertia + React + TypeScript; customer web is PWA/API-driven.
- Central tenant platform DB plus operational DB per developer is the proposed starting tenancy architecture.
- Project hierarchy flexible across towers/floors and villas/plots.
- Public brand name not decided; do not rename everything to JOR without explicit decision.

## Risks to flag before coding
- Trying to make all products literally one single React runtime sacrifices public SEO and enterprise ERP UX. Share components/contracts, but allow different app shells.
- A PWA is not automatically a native App Store application; push/camera/offline features vary by browser/platform.
- Urdu RTL touches diagrams, tables, dates, phone numbers, money, help and PDFs, not merely component text.
- WCAG 2.2 AA cannot be claimed without accessibility testing on complete workflows and third-party payment screens.
- Payment merchant/settlement model and gateway product/merchant contract must be confirmed before live integration.
- Screen CSV contains intended concepts, including later-phase screens. Do not interpret it as Phase 1 production build scope.
- AI agents must not invent domain state transitions from a pretty mocked UI.

## Agent change control
If blueprint conflicts with actual architecture, write an ADR with alternatives, reasons and impact, request explicit owner approval. No silent redesign.

## What to present to owner after each stage
- Working preview route and credentials for clearly fictional demo personas
- Screens completed and remaining
- Desktop/mobile/Urdu screenshots
- Executed test results, accessibility caveats
- What data is mocked vs real
- What changed in repo
- Next stage choices, no invented production claims
