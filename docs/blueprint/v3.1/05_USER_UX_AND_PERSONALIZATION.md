# V3.1 — User appearance, accessibility and connected UX

## Every user controls their experience
Available to Resident, Tenant Admin, Staff and Platform Supreme Admin:
- Font size preset 100, 112, 125, 150, 175 and 200 percent; responsive reflow, independent of browser zoom.
- English and Urdu one-click locale switch; full RTL including layout, menus, forms and dialogs, with numeric values and mixed-language text properly handled.
- Font choices appropriate to script; a readable Urdu alternative to Nastaliq where practical.
- Light, Dark, System and High Contrast; validated palette presets Evergreen, Ocean, Indigo, Warm Neutral and optional tenant brand.
- Comfortable/Compact density; large touch targets, simplified reading mode, fewer distractions.
- Reduce motion / turn off unnecessary animation; optional interface sounds default OFF; optional haptics.
- Screen reader semantics, keyboard traversal, visible focus, alternative data tables for charts and 2D/list alternative for interactive 3D.
- Live preview, reset to default, preferences persist across navigation and future authenticated devices. Mock prototype persistence must be honestly labeled.

Priority order: accessibility/legibility override cosmetic branding; allowed tenant palette overrides platform defaults; user preferences may override eligible appearance tokens. No user setting grants unauthorized data or features.

## Global UX foundation
Compact sidebar; role/module-aware menu; Ctrl+K permission/scoped search; 360° workspaces; contextual tabs; related records drawer; deep-link routes; low-friction drawers for quick actions; large wizards for complex work; saved filters; async searchable selects; form validation; skeleton states; descriptive empty/error/success; receipt and authorization consequence confirmations; human-readable activity timelines and contextual help.
Design theme: Limestone & Evergreen plus readable finance figures. Real property visuals where relevant; do not add 3D to invoice/accounting just for decoration.

## Nizam benchmark
Learn product discovery, real-control spotlight, readable onboarding, welcome + demo path and step-by-step feature guidance. Do NOT copy branding/assets/layout exactly. Provide guided tour anchored to *working* controls, dimmed background, auto-scroll, keyboard/screen-reader text path, Back/Next/Skip/Pause/Replay, RTL/reduced motion and safe fictional practice tasks.

## First-run
Supreme Admin: configure tenant → sites → modules → price/quote → simulated activation → preview as tenant role.
Building Manager: import units/payers → set rates → run mock monthly invoices → verify mock transfer → inspect collection summary.
Resident: select language/font/theme → view bill and verified payee → online demo or bank transfer proof → see Pending Verification → receipt only after confirmed mock settlement.
Developer team: existing Lead → Visit → Quote → Unit Hold → Reservation → Booking → Payment → Handover → Resident journey is retained for subsequent phases.

## Accessibility acceptance
WCAG 2.2 AA target, not automatically certified by axe. Manual NVDA/VoiceOver/TalkBack, keyboard, zoom 200%, high contrast, motion off, Urdu native-language review and browser/device checks needed for final sign-off.
