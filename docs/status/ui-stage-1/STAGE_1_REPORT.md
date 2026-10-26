# Stage 1 Report: Accessible, localized component system, shells and guided-onboarding foundation

| | |
|---|---|
| **Date** | 2026-10-26 |
| **Blueprint** | V2.1 (`docs/blueprint/v2.1/`) |
| **Decisions applied** | ADR-0001 (as amended: Laragon Node 20), ADR-0002 (own tour engine) |
| **Status** | Complete, awaiting owner review before Stage 2 |
| **Backend / migrations / payments** | None. All data is fictional and in-memory. |

---

## 1. Scope finished

**Workspace and quality gates**
- npm-workspaces repo: 2 Vite + React 19 apps and 5 shared packages.
- Strict TypeScript.
- ESLint, which rejects hard-coded JSX text, router imports in shared UI or pages, and fixture imports in pages.
- An RTL guard that rejects physical left/right CSS.
- An i18n key-parity check.
- A typed screen manifest generated from the register CSV.

**Design tokens**
- Colour, radius, type and motion tokens in one Tailwind v4 theme.
- High-contrast and reduced-motion variants.
- Urdu line-height tuned separately.
- 26 colour pairs, each checked by test in both contrast modes.
- Blueprint conflicts C1 (control border 1.48 → 4.76:1) and C2 (focus ring offset) resolved.

**Internationalisation**
- en-PK and ur-PK: 9 namespaces, 619 keys each, parity enforced.
- In-place language switch: `<html lang dir>` updates and nothing remounts, so typed values, open tab and tour step are kept.
- Pre-paint boot script, so Urdu users never see an LTR flash.
- Formatters for money (always 2 decimals, fixing C4), dates (explicit patterns, Asia/Karachi, fixing C5), relative time, numbers, Pakistani phone, CNIC mask and IBAN mod-97.
- Bidi isolation for every Latin reference.

**Components (React Aria based)**
- **Controls:** Button (local loading, duplicate-submit guard, visible disabled reason), IconButton (accessible name required), Link, DirectionalIcon.
- **Form fields:**
  - text, textarea, phone, CNIC;
  - checkbox, radio, switch, select;
  - async customer search, multi-select;
  - dependent project → tower → floor → unit picker (plots: project → phase → plot);
  - PKR currency, locale-aware date with calendar, file upload (native picker or camera; drop optional).
- **Form behaviour:** validation summary that takes focus, errors as translation keys, in-memory drafts that survive back/forward.
- **Display:** Money, DateTime, Reference, StatusLabel (icon + text), Badge, KeyValueList, ActivityTimeline.
- **Overlays and feedback:** Dialog, ConfirmDialog (exact effect + reason), Drawer (side panel or phone sheet), Menu, Tooltip, toasts announced politely or assertively with a reference, skeletons, empty/error/forbidden/offline/not-found states.
- **Layout:** URL-synced tabs with "More" overflow, breadcrumbs, page and workspace headers, panels, related drawer, planned-screen page.

**Shells**
- **Backoffice:** header (tenant · project context · Ctrl+K search · quick create · language · notifications · help · account), sidebar (256 / 72 px, remembered), phone menu sheet, skip link, focus to H1 and announcement on navigation.
- **Customer:** bottom navigation on phone, side navigation on desktop, same component tree.

**Global features**
- Ctrl+K palette over screens, records and actions. It uses the physical key, so it also works with an Urdu keyboard layout.
- Quick create.
- Notifications panel and page.
- Help menu and help drawer.
- Preferences: language, accessibility (motion, contrast, sound OFF by default), guided tours.
- Demo sign-in with 4 fictional personas and permission-aware navigation, actions and search.
- Simulated network modes (normal, instant, slow, error, offline).

**Data seam**
- `ApiTransport` interface with an in-memory `MockTransport`: seeded latency, persona scope enforced inside the transport, mutation log, isolated training store.
- Fictional dataset: 2 projects, 496 units, 150 parties, 120 leads, 60 invoices.
- Lifecycle states only from blueprint §9.

**Guided onboarding (doc 09 Stage 1 items, all delivered)**
- **Engine:** pure tour state machine.
- **Visuals:** spotlight with dimmed scrim, high-contrast ring and restrained pulse.
- **Step card:** anchored, with logical placement (mirrors in RTL); becomes a top or bottom sheet on phones.
- **Step types:** `EXPLAIN` steps are true modal dialogs (page inert, focus contained). `GUIDED_ACTION` steps are non-modal and advance on events.
- **Inline steps:** steps can render inside a host drawer.
- **Robustness:**
  - missing or unauthorised anchors fall back to skip or explain;
  - anchors are re-found on breakpoint and route changes;
  - a language switch inside the step card;
  - an auto-offer guard while a form has unsaved entries.
- **Experience:** first-login welcome (once per tenant + persona + app), completion dialog, module first-use offer, Help → Take a tour / Show me how / All guided tours, tour library with start / resume / replay, text-only guide with "Show me".
- **Practice mode:** TRAINING banner and practice lead drawer whose writes go only to the training store.
- **Progress:** per tenant + persona + app + tour + version.
- **Tours:** `GLOBAL-TOUR-001` (6 steps) and `LAB-TOUR-001` (practice demo, role-filtered). See `docs/ui/onboarding-tours.md`.

**Customer app**
- Shell, a customer-personality preview page, and PORTAL-027 accessibility preferences.
- Tour engine wired with no tours yet (the resident tour is Stage 4).

---

## 2. Screens and paths

**Register coverage:** 321 of 321 register URLs resolve, verified by test. Built screens open their page. The other 308 open an intentional planned-screen page showing screen ID, template, target stage and register address.

| Register | Status | Address |
|---|---|---|
| GLOBAL-001 Command palette | Built (opens palette) | `/backoffice/global/command-palette` |
| GLOBAL-003 Quick create | Built (page + header menu) | `/backoffice/global/quick-create` |
| GLOBAL-004 Notifications | Built (page + header panel) | `/backoffice/global/notifications` |
| GLOBAL-007 Context help | Built (page + drawer `?help=open`) | `/backoffice/global/context-help` |
| GLOBAL-008 Profile & preferences | Partial: preferences only; profile is Stage 2 | `/backoffice/global/profile--preferences` |
| GLOBAL-009 Language switcher | Built | `/backoffice/global/language-switcher` |
| GLOBAL-010 Accessibility preferences | Built | `/backoffice/global/accessibility-preferences` |
| GUIDE-001 First-login invitation | Built | `/backoffice` (any first page) |
| GUIDE-002 Spotlight walkthrough | Built | `/backoffice/help/tours/GLOBAL-TOUR-001` |
| GUIDE-003 Tour library and replay | Built | `/backoffice/help/tours` |
| GUIDE-004 Practice mode | Partial: foundation + 1 task | `/backoffice/help/practice` |
| GUIDE-006 Tour preferences | Built | `/backoffice/settings/onboarding` |
| PORTAL-027 Accessibility preferences | Built | `/customer/portal/accessibility-preferences` |

**Lab pages** (dev showcase, not register screens):
- `/backoffice/lab`, plus `tokens`, `components`, `forms`, `workspace` and `states`;
- `/backoffice/help/tours/:tourId/text`;
- `/customer/portal/lab`.

Run with `npm run dev`, or `npm run build && npm run preview`, then open http://localhost:5173/backoffice and http://localhost:5174/customer/portal. Pick a demo identity; no password is needed.

---

## 3. Test and accessibility results

All commands were run on 2026-10-26 on this machine (Windows 11, Node 20.20.1, Chromium from Playwright 1.64.1). Full output is in `test-results.md`.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (0 errors) |
| `npm run lint` | Pass. ESLint 0 problems; logical CSS: no physical left/right; i18n: 2 locales × 9 namespaces, 619 keys each, parity OK |
| `npm run test` (Vitest) | **126 passed / 126** in 11 files: token contrast (54), formatters (26), contracts, fixtures and mock transport (13), tour machine, progress store, placement, permissions (24), components in jsdom (9) |
| `npm run test:e2e` (Playwright vs production builds) | **88 passed / 88**, 0 flaky, 0 skipped (4.3 min). A previous run had 1 test-selector failure, recorded in `test-results.md` |
| axe-core WCAG 2.0/2.1/2.2 A+AA | **0 violations** across 129 scans (3,067 rule checks passed): 17 backoffice + 3 customer routes × EN/UR × 1440/390, overlays, all tour steps, high contrast |
| Doc 09 §11 acceptance | Tests 1–9, 11 and 13 automated and passing; 12 and 14 partially (§5); 10 automated for ARIA semantics only, manual screen-reader test pending; 15 is this report |

**Doc 09 §11 mapping** (`tests/e2e/onboarding.spec.ts`):

| # | Requirement | Test | Result |
|---|---|---|---|
| 1 | New Sales identity offered the tour once; skip without penalty | `1: …` | Pass |
| 2 | Tour points at the real control at 1440, 390 and 320 | `2 + 4: … at 1440/390/320 px` | Pass |
| 3 | EN→Urdu at step 3 keeps progress and mirrors layout | `3: …` | Pass |
| 4 | Phone highlights the menu button, not the hidden sidebar | `2 + 4` at 390/320 | Pass |
| 5 | Finance-only steps excluded for Sales | `5`, `5b` | Pass |
| 6 | Replay from Help after skip | `6: …` | Pass |
| 7 | Completion recorded for exact version / persona / tenant / app | `7: …` | Pass |
| 8 | Missing target recovers without a dead overlay | `8: …` | Pass |
| 9 | Keyboard start, navigate, pause; focus restored | `9: …` | Pass |
| 10 | Screen-reader user gets useful step text | `10: …` checks name, "Step x of y", aria-modal, inert | Automated part passes; **manual test pending** |
| 11 | Reduced motion removes pulse and travel, keeps highlight | `11: …` | Pass |
| 12 | Practice never fires a real mutation; shows DEMO | `12: …` (0 live mutations, training record created) | Pass for the lead task; payment tutorial is Stage 3–4 |
| 13 | No auto-open over unsaved form entry | `13: …` | Pass |
| 14 | No dependence on audio, hover, drag, flashing or colour alone | `14: …` sound OFF by default, text guide; axe colour checks | Partly automated; hover/drag review is manual |

---

## 4. Problems found and fixed during Stage 1

The tests caught real defects. Each was fixed at the cause:

1. **Workspace stuck loading:** clearing the query cache on mount orphaned queries that child components had just subscribed to. It is now cleared only on a real identity change.
2. **Validation summary not appearing:** react-hook-form only re-renders for `formState` fields read earlier. `Form` now reads `errors` on every render. Caught by a jsdom component test.
3. **Summary focus lost to the first field:** react-hook-form's own error focusing raced it, so it is disabled inside `Form`.
4. **Focus fell to `<body>` after pausing a tour** started from the welcome: focus is now restored after `inert` is removed, with the page heading as fallback.
5. **1 px horizontal scroll in Urdu at 320 px:** screen-reader-only elements use a −1 px margin, and so does React Aria's hidden native select. In RTL that pushes past the scroll origin. Both are neutralised.
6. **Header controls overlapping on phones:** conflicting utility classes (`hidden` vs `inline-flex`). `tailwind-merge` now resolves conflicts.
7. **Latin text rendered in Naskh's Latin glyphs in Urdu:** the font stack is now Inter-first, so Urdu falls through to Naskh.
8. **Module offer popped up right after "Explore on my own":** the current module now counts as seen.
9. **Announcements overwriting each other** ("page loaded" vs "entries restored"): the announcer merges messages within 700 ms.
10. **Language switch unreachable during modal tour steps** (page inert): the step card now has its own switch.
11. **Urdu-script names right-aligned in English result lists:** isolation kept, alignment fixed.
12. **Select placeholder showed "Select an item" in Urdu:** React Aria's built-in string. A translated placeholder ("منتخب کریں…") is now always passed.
13. **Unit areas read "feet" in Urdu instead of square feet:** `Intl` has no square-foot unit. The area formatter now carries the label per locale (sq ft / مربع فٹ), pinned by a unit test.

---

## 5. Known limitations and honest caveats

- **Screen readers not tested.** I cannot run NVDA, VoiceOver or TalkBack here. `manual-screen-reader-checklist.md` lists 30 checks. Until a person runs them, doc 09 test 10 and the screen-reader column of blueprint 04 are open. No WCAG conformance is claimed.
- **Chromium only.** WebKit, Firefox and real iOS/Android devices are Stage 6.
- **Urdu text and typography need a native reviewer.** I wrote the translations; terms like "لیڈ" and "مرحلہ" and the Naskh line-heights should be checked. Specimens are in `tokens-1440-ur.png`.
- **React Aria has no Urdu translations of its own built-in strings.** We pass our own text for every visible label we control. Some built-ins still fall back to English for Urdu users:
  - the screen-reader announcement of result counts in comboboxes;
  - "Empty" names of date segments;
  - "Remove" on tags where a label isn't supplied.

  Stage 6 should either supply Urdu strings to React Aria or wrap these, and a native screen-reader user should confirm the impact.
- **Planned-screen titles stay English in Urdu UI.** They are register data until each screen is built, and are marked `lang="en"` so screen readers pronounce them correctly.
- **Bundle size.** The main shared-library chunk is 1.04 MB minified (303 kB gzip). Code splitting and performance budgets are Stage 6.
- **Node 20 is past end-of-life** (owner decision). It pins React Router 7, Vitest 4 and ESLint without `eslint-plugin-jsx-a11y`, which does not support ESLint 10. Accessibility linting is covered by axe instead.
- **Prototype-only conveniences** to remove before any production build:
  - the inspection hook `window.__prototype`, which exposes the mock transport's mutation log for tests;
  - demo sign-in;
  - the simulated-network menu.
- **`Form` sets react-hook-form's `shouldFocusError` through its control options.** This is documented in code; re-check when upgrading that library.
- **Tour progress is device-local** (`localStorage`) in the prototype, by design (doc 09 §8). A server-backed store replaces it at the backend stage.
- **Drafts are memory-only**, so they do not survive a full reload. This is intentional (assumption A10, no personal data at rest).

### Deviations from the Stage 1 file plan

The plan named files. These changed, with no change in scope:

| Plan | Delivered | Why |
|---|---|---|
| Node 24, React Router 8, Vitest 5, ESLint with jsx-a11y | Node 20, React Router 7.18.4, Vitest 4.1.12, ESLint 10 without jsx-a11y | Owner decision to use Laragon's Node |
| `@hookform/resolvers` | Own 15-line `zodResolver` in `forms/Form.tsx` | Unresolvable optional-peer conflict; ours returns translation keys directly |
| React Aria Toast | Own `feedback/Toast.tsx` | React Aria Toast is still `UNSTABLE_` and uses `role="alert"`, which is too noisy for routine success |
| `tokens.css` + `theme.css` | Single `theme.css` | One source; the contrast test parses it |
| `i18n/src/boot-script.ts` | Inline script in each `index.html` | Vite config on Node 20 cannot import TS package source; same 12 lines in both apps |
| One file per state / field / overlay | Grouped: `feedback/States.tsx`, `forms/TextFields.tsx`, `forms/ChoiceFields.tsx`, `overlays/Menu.tsx` (popover styles) | Smaller surface; same components |
| `BottomSheet.tsx`, `MobileBottomNav.tsx`, `DemoPersonaSwitcher.tsx` | Drawer becomes a sheet on phones; bottom nav inside `CustomerShell.tsx`; identity switching via `DemoSignIn.tsx` + account menu | Same behaviour, fewer components |
| `onboarding/accessibility.ts` | Anchor helpers in `TourAnchor.tsx`; added `placement.ts`, `TourLayer.tsx`, `TourDialogs.tsx`, `PracticeLeadDrawer.tsx` | Clearer split |
| (not planned) | `tailwind-merge`, `PlannedScreenView`, `NotificationList`, global pages for GLOBAL-003/004/007 | Needed to make those register pages real |

---

## 6. Files

**Changed since the baseline commit:** 240 files plus 66 screenshots.

**Root**
- `package.json`, `package-lock.json`, `.node-version`, `.editorconfig`
- `.prettierrc.json`, `.prettierignore`, `tsconfig.json`
- `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `README.md`

**Scripts**
- `scripts/sync-screen-register.mjs`, `check-i18n.mjs`, `check-logical-css.mjs`

**Docs**
- Edited: `docs/adr/ADR-000{1,2}` (status, Node 20 amendment), `docs/status/ui-stage-0/*` (Node 20 notes)
- New: `docs/ui/screen-register.csv`, `docs/ui/onboarding-tours.md`
- New: `docs/status/ui-stage-1/` (this report, `test-results.md`, `manual-screen-reader-checklist.md`, `screenshots/`)

**`packages/tokens`**
- `src/theme.css`, `fonts.css`, `tokens.ts`, `contrast.ts`, `contrast.test.ts`

**`packages/i18n`**
- `src/locales.ts`, `i18n.ts`, `resources.ts`, `i18next.d.ts`, `LocaleProvider.tsx`, `index.ts`
- `src/format/{money,date,number,phone,cnic,iban,index}.ts` + `format.test.ts`
- `locales/{en-PK,ur-PK}/{common,nav,forms,errors,status,help,onboarding,a11y,lab}.json`

**`packages/contracts`**
- `src/{money,permissions,persona,entities,api,search,onboarding,index}.ts`, `api.test.ts`
- `src/screens/{types,index,register.generated}.ts`

**`packages/fixtures`**
- `src/{seed,people,inventory,records,handlers,mock-transport,training-store,index}.ts`, `fixtures.test.ts`

**`packages/ui/src`**

| Folder | Files |
|---|---|
| `lib/` | `cn`, `useT`, `useMediaQuery`, `storage` |
| `a11y/` | `LiveAnnouncer`, `SkipLink`, `VisuallyHidden`, `useRouteFocus` |
| `preferences/` | `PreferencesProvider`, `PreferencesForm`, `sound` |
| `permissions/` | `SessionProvider`, `PermissionGate`, `can` (+test) |
| `data/` | `TransportProvider`, `Money`, `DateTime`, `Reference`, `StatusLabel`, `KeyValueList`, `ActivityTimeline` |
| `feedback/` | `Toast`, `Skeleton`, `States`, `InlineAlert` |
| `primitives/` | `Button`, `IconButton`, `Link`, `DirectionalIcon`, `Spinner` |
| `overlays/` | `Dialog`, `ConfirmDialog`, `Drawer`, `Menu`, `Tooltip` (+`Dialog.test`) |
| `layout/` | `Tabs` (+test), `Breadcrumbs`, `PageHeader`, `WorkspaceHeader`, `Panel`, `RelatedDrawer`, `PlannedScreenView` |
| `navigation/` | `RouterAdapter` |
| `forms/` | `Form`, `useDraft`, `fieldStyles`, `FieldParts`, `TextFields`, `ChoiceFields`, `AsyncSelectField`, `MultiSelectField`, `UnitPickerField`, `CurrencyField`, `DateField`, `FileUploadField` (+`forms.test`) |
| `shell/` | `AppShell`, `AppHeader`, `Sidebar`, `NavList`, `MobileNavSheet`, `CustomerShell`, `LocaleSwitcher`, `ProjectSwitcher`, `QuickCreateMenu`, `NotificationsPanel`, `HelpMenu`, `HelpDrawer`, `UserMenu`, `DemoSignIn`, `ShellContext`, `types`, `mockModes` |
| `command/` | `CommandPalette`, `useCommandHotkey` |
| `onboarding/` | see breakdown below |
| `providers/` | `AppProviders` |
| `test/` | `setup`, `render` |
| root | `index.ts` |

`onboarding/` contains:
- engine and state: `GuidedTourProvider`, `tourMachine` (+test), `tourTypes`, `TourRegistry`, `TourProgressStore` (+test), `tourGuard`;
- rendering: `TourLayer`, `TourOverlay`, `TourPopover`, `TourControls`, `TourDialogs`, `placement` (+test);
- anchors and alternatives: `TourAnchor`, `TextOnlyTour`;
- practice: `TrainingProvider`, `PracticeModeBanner`, `PracticeLeadDrawer`;
- `tours/{backoffice,lab}.ts`, `index.ts`.

**`apps/backoffice`**
- `index.html`, `vite.config.ts`, `src/{main.tsx,styles.css,nav.config.ts}`
- `src/prototype/{routes,register,RootLayout,StandaloneLayout,CommandPaletteRoute,RouteError,handle}`
- `src/pages/lab/{LabHome,TokensLab,ComponentsLab,FormsLab,WorkspaceLab,StatesLab}`
- `src/pages/help/{TourLibrary,TextGuidePage,PracticeSandbox}`
- `src/pages/settings/PreferencesPage`
- `src/pages/global/{QuickCreatePage,NotificationsPage,HelpPage}`
- `src/pages/system/{PlannedScreen,NotFoundPage}`

**`apps/customer-web`**
- `index.html`, `vite.config.ts`, `src/{main.tsx,styles.css,nav.config.ts}`
- `src/prototype/{routes,RootLayout}`
- `src/pages/{CustomerLab,AccessibilityPreferencesPage}`

**`tests`**
- `support/{fixtures,axe,viewports}.ts`
- `e2e/{onboarding,shell,locale,forms-keyboard,overlays,command-palette,permissions,a11y,reflow,register,customer-shell}.spec.ts`
- `evidence/stage1.evidence.spec.ts`

---

## 7. Screenshots (`docs/status/ui-stage-1/screenshots/`)

66 images, regenerated by `npm run evidence`. Key ones:

| Subject | English | Urdu |
|---|---|---|
| Shell, desktop / phone | `shell-1440-en`, `shell-390-en` | `shell-1440-ur`, `shell-390-ur` |
| Tablet, 320 px, 200 % zoom | `shell-tablet-en`, `shell-reflow-en`, `shell-zoom200-en` | `shell-reflow-ur` |
| Phone menu sheet | `mobile-menu-390-en` | `mobile-menu-390-ur` |
| First-login welcome | `welcome-1440-en`, `welcome-390-en` | `welcome-1440-ur`, `welcome-390-ur` |
| Tour steps 2–4, desktop and phone | `tour-step{2,3,4}-{1440,390}-en` | `tour-step{2,3,4}-{1440,390}-ur` |
| Tour, high contrast + reduced motion | `tour-step3-1440-en-high-contrast-reduced-motion` | none |
| Tour completion / text guide | `tour-complete-1440-en`, `text-guide-1440-en` | `tour-complete-1440-ur`, `text-guide-1440-ur` |
| Practice mode (intro, quick create, drawer with inline step) | `practice-{intro,quick-create,drawer}-1440-en` | `practice-…-ur` |
| Forms with validation summary | `forms-errors-{1440,390}-en` | `forms-errors-{1440,390}-ur` |
| Unit picker open | `unit-picker-open-1440-en` | `unit-picker-open-1440-ur` |
| Drawer + toast | `drawer-toast-1440-en` | `drawer-toast-1440-ur` |
| Ctrl+K: Sales vs Finance, phone | `palette-sales-1440-en`, `palette-finance-1440-en`, `palette-390-en` | same with `-ur` |
| Workspace pattern | `workspace-1440-en`, `workspace-390-en` | `workspace-1440-ur`, `workspace-390-ur` |
| Tokens and type specimens | `tokens-1440-en` | `tokens-1440-ur` |
| Planned screen | `planned-screen-1440-en` | `planned-screen-1440-ur` |
| Customer portal | `customer-1440-en`, `customer-390-en` | `customer-1440-ur`, `customer-390-ur` |

---

## 8. Next: Stage 2 plan (needs your approval)

**Goal:** every register screen becomes a real page built from shared templates with realistic fixtures. None stays a planned placeholder.

1. **Template families:**
   - list and record views: `dashboard`, `index`, `workspace`;
   - task flows: `form`, `wizard`, `approval`;
   - visual and analytical views: `calendar`, `matrix` (with list alternative), `report` (chart + accessible table), `reconciliation`;
   - other: `settings`, `auth`.

   Refine `ui_template` for all 321 rows in `docs/ui/screen-register.csv`.
2. **Fixtures for every entity** in blueprint §9, with consistent cross-links so the related drawer and breadcrumbs connect.
3. **Record routes with ids** (`/backoffice/{area}/{collection}/:id/:tab?`), keeping each register URL as an entry point (C9). Drawers as URL state (C10).
4. **Mock sign-in screens** (AUTH-001…006) replacing the demo picker, plus SaaS HQ shell screens.
5. **Tour anchors** (`data-tour-id`) built into every template, plus a typed, route-aware tour manifest (doc 09 Stage 2).
6. **The same gates:** axe on every route in EN/UR × desktop/phone, register coverage at 100 % "built", reflow, keyboard paths for each template.

**Still out of scope:** the 24 signature screens' full polish and the 11 connected journeys (Stage 3), the customer PWA (Stage 4), the public site (Stage 5).

**Decisions that would help before or during Stage 2:**
- Amount grouping: million or lakh/crore.
- Urdu digits as an option.
- Native Urdu review of the Stage 1 screenshots.
- Who runs the manual screen-reader checklist.
