# PropertyOS UI-first — Work Breakdown & Acceptance

## Stage 0 — Repository read/audit + reusable architecture
Output: architecture decision record; actual repo status; routes and data contracts; no code if conflicts.
Acceptance: developer can articulate where backoffice/customer/public code lives and how components are reused; multilingual/RTL/accessibility non-negotiables acknowledged.

## Stage 1 — Accessible, localized component system
Build: tokens; color/contrast; typography EN/Urdu; locale manager; dir/LTR/RTL; responsive header/sidebar/bottom nav; buttons/forms/async selects/tabs/drawers/dialogs/toasts/skeleton/empty/error; `Money`, `Date`, `Phone`, `CNIC`, upload; focus and live announcements; command palette; permissions demo; component showcase; **GuidedTourProvider, accessible spotlight overlay, popover, tour registry, opt-in first-login welcome, 6-step Backoffice Essentials Tour, Help replay, demo-persona progress**.
Acceptance: 390px/1440px, locale toggle in-place, keyboard-only forms and drawer, no lost state, no untranslated demo strings in key primitives; first-login tour works at 390px and 1440px with keyboard and Urdu RTL and is fully skippable.

## Stage 2 — All routes and shared templates
Build route manifest from `06_SCREEN_REGISTER.csv`; template families `dashboard`, `index`, `workspace`, `form`, `wizard`, `calendar`, `matrix`, `report`, `public-story`; fixture models; lifecycle display; Related drawer links; durable `data-tour-id` anchors and tour registration across templates.
Acceptance: 100% of register listed as implemented/intentional scaffold (not 404). Screens have relevant heading/records/next action, even if not individually polished. Track status columns in a copied project-local CSV.

## Stage 3 — Business UX complete connected demo
Build signature desktop/tablet/mobile workflows:
1 Lead→visit→unit→quote→hold→reservation→booking
2 Booking→invoice→manual evidence→verified by finance→receipt→ledger (all mock and clearly flagged)
3 Project→expense→supplier bill→approval→payment→bank→GL
4 Construction→inspection→snags→handover→occupancy
5 Resident→maintenance→work order→close→optional charge
6 Visitor QR→security check-in/out
7 Role scope: Sales/Finance/Manager
8 Ctrl+K relevant records and commands
9 EN↔Urdu mid-form
10 Device resize same customer task
11 Role-aware Spotlight Tour (Sales/Inventory/Finance/Project/Operations) with mock practice mode
Acceptance: automated Playwright E2E for top workflows; no dead buttons; clear state timelines.

## Stage 4 — Customer web/PWA
Build in one responsive React tree: home, property, payments, invoices, bank transfer evidence, receipts, documents, progress, handover, maintenance, visitor passes, parking, amenities, settings, install prompt where appropriate.
Acceptance: phone + desktop same source and data; manifest/service worker configured safely; no actual financial transactions; accessibility tests; Resident PWA guided first-use tour.

## Stage 5 — Luxury public project frontend
One complete polished example project: cinematic hero, story, amenities, towers, units, gallery/floorplan, location, lead capture; read-only mocked published inventory; accessible list route and reduced motion.
Acceptance: professional typography/art direction; 16:9 and mobile assets; no scroll traps; text accessible over imagery; form creates mock CRM lead; mobile performance reasonable.

## Stage 6 — QA and UI sign-off
Execute checklist in `04_ACCESSIBILITY_I18N_QA.md` on all core flows. Axe automated + manual NVDA/VoiceOver/TalkBack/keyboard; screenshots at dimensions; guided tour keyboard/screen-reader/reduced-motion/RTL tests; large numbers, long Urdu strings, slow-network mock, empty/permission error states.
Acceptance: no known critical accessibility/functionality/tenant-scope leaks; documented exceptions and remediation plan.

## Stage 7 — Backend contracts
Inventory screens → entities → events → permission scopes → API contracts → state machines → storage; reconcile inconsistencies with owner. Only then request separate authorization to implement central/tenant DB, domain models, workflows and gateway sandbox integration.

## Out of scope of UI-first phases
Real credit card handling, real bank account transfers, Safepay production keys, payroll disbursements, live accounting postings, legal document signing, real QR access control, tenant production datasets, deployment to production.
