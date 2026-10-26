# Stage 1 Plan — Accessible, localized component system, responsive shells and guided-onboarding foundation

**Starts only after you approve Stage 0** (ADR-0001, ADR-0002, and decisions 1–3 in the Stage 0 report §8).

**Stage 1 goal (03 + 09 §10):**
- Design tokens; EN/Urdu typography; locale manager with true LTR/RTL.
- Responsive backoffice and customer shells.
- Accessible controls, overlays and feedback states.
- Command palette, permission-aware demo personas and component showcase.
- The reusable guided-tour engine with first-login welcome, `GLOBAL-TOUR-001`, Help → Take a tour, progress per persona, text-only alternative and practice-mode foundation.

**Not in Stage 1:**
- Business screens (dashboards, lists, workspaces), mock login (AUTH-*), PWA manifest/service worker, public site.
- Sales/Inventory/Finance/Project tours (Stage 3) and the resident tour (Stage 4).
- Anything backend, payment or persistence related.

---

## 1. Build order (internal checkpoints, one report at the end)

| Step | Delivers | Checkpoint |
|---|---|---|
| **1A Foundation** | Workspaces on Laragon Node 20, tokens, fonts, i18n + locale switch, backoffice shell (header/sidebar/phone menu sheet), customer shell (bottom nav ↔ side nav), register sync, Planned-screen route for all 321 register URLs | Both apps run; EN↔UR flips `lang`/`dir` in place |
| **1B Controls** | Forms, data display, overlays, feedback states, tabs, breadcrumbs, workspace header, related drawer; Tokens/Components/Forms/Workspace/States labs | Keyboard-only form completion works |
| **1C Global** | Fixtures, mock transport, demo personas, permissions, Ctrl+K palette, Quick create, Notifications, Help drawer, Preferences (language, accessibility, sound, guided tours) | Sales vs Finance see different nav, palette and actions |
| **1D Onboarding** | Tour engine, welcome, `GLOBAL-TOUR-001`, tour library, text-only guide, practice sandbox + `LAB-TOUR-001`, progress store, auto-offer guard | Tour runs at 1440 and 390 in EN and UR |
| **1E QA and evidence** | Full test run, axe scans, reflow/zoom checks, screenshot matrix, Stage 1 report | Report in `docs/status/ui-stage-1/` |

---

## 2. Exact file checklist

### 2.1 Root and tooling

- [ ] `package.json` — workspaces `apps/*`, `packages/*`; scripts listed in Stage 0 report §7; `engines.node >=20.19.0`
- [ ] `package-lock.json`
- [ ] `.node-version` (`20.20.1`), `.gitignore`, `.gitattributes` (LF; CSV as text), `.editorconfig`, `.prettierrc.json`
- [ ] `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), `tsconfig.json` (project references)
- [ ] `eslint.config.js` with:
  - typescript-eslint;
  - `i18next/no-literal-string` (JSX) on `packages/ui`, `apps/*/src`;
  - jsx-a11y (if ESLint 10 compatible);
  - `no-restricted-imports` banning `react-router` in `packages/ui` and `apps/*/src/pages`.
- [ ] `vitest.config.ts` (projects: tokens, i18n, contracts, fixtures, ui)
- [ ] `playwright.config.ts` (Chromium; `webServer` for both preview builds; viewports from `tests/support/viewports.ts`)
- [ ] `README.md` (setup on Laragon/Windows incl. PATH line, commands, demo personas, where evidence lives)
- [ ] `scripts/sync-screen-register.mjs` — quote-aware CSV parse of `docs/ui/screen-register.csv` → `packages/contracts/src/screens/register.generated.ts`
- [ ] `scripts/check-i18n.mjs` — en-PK/ur-PK key parity, empty values, unused keys report
- [ ] `scripts/check-logical-css.mjs` — fails on physical left/right classes and CSS properties

### 2.2 Docs

- [ ] `docs/blueprint/v2.1/00…09` and `docs/blueprint/archive/…V2_1….zip` (moved, if approved)
- [ ] `docs/ui/screen-register.csv` — owner CSV plus the columns `status`, `ui_template`, `stage`, `canonical_route`, `notes`
- [ ] `docs/ui/onboarding-tours.md` — shipped tour scripts EN/UR, anchor map, permissions per step
- [ ] `docs/status/ui-stage-1/STAGE_1_REPORT.md`, `test-results.md`, `manual-screen-reader-checklist.md`, `screenshots/`

### 2.3 `packages/tokens`

- [ ] `package.json`
- [ ] `src/tokens.css`:
  - colour, space (4 px rhythm), radius, motion and type tokens, with `--color-border-control` (C1) and focus ring (C2);
  - `[data-contrast="more"]` overrides;
  - `[data-motion="reduce"]` and `prefers-reduced-motion`;
  - `:lang(ur)` line-heights;
  - tokens structured so dark mode can be added later without refactoring.
- [ ] `src/theme.css` — Tailwind v4 `@theme` mapping to the CSS variables
- [ ] `src/fonts.css` — Inter Variable + Noto Naskh Arabic Variable (self-hosted)
- [ ] `src/tokens.ts` — typed tokens + declared foreground/background pairs with required ratio
- [ ] `src/contrast.ts`, `src/contrast.test.ts` — every declared pair meets 4.5:1 text / 3:1 large-text and non-text

### 2.4 `packages/i18n`

- [ ] `package.json`, `src/index.ts`
- [ ] `src/locales.ts` — `en-PK`, `ur-PK`; direction from `Intl.Locale` text info with fallback map; adding a locale is configuration only
- [ ] `src/i18n.ts` — i18next init, namespaces, missing-key handler (collected and shown in a dev panel, never rendered as raw keys in production builds)
- [ ] `src/LocaleProvider.tsx`, `src/useLocale.ts` — sets `html[lang][dir]`, React Aria `I18nProvider`, persists preference; switching does not remount the tree
- [ ] `src/boot-script.ts` — inline pre-paint script source for each `index.html`
- [ ] `src/i18next.d.ts` — typed keys
- [ ] `src/format/money.ts` — always 2 decimals (C4); decimal-string input
- [ ] `src/format/date.ts` — explicit patterns, `Asia/Karachi` (C5)
- [ ] `src/format/number.ts`
- [ ] `src/format/phone.ts` — PK mobile/landline display
- [ ] `src/format/cnic.ts` — `#####-#######-#` mask + validation
- [ ] `src/format/iban.ts` — PK IBAN grouping + mod-97 check
- [ ] `src/format/*.test.ts` — one per formatter; EN and UR outputs pinned
- [ ] `locales/en-PK/{common,nav,forms,errors,status,help,onboarding,a11y,lab}.json`
- [ ] `locales/ur-PK/{common,nav,forms,errors,status,help,onboarding,a11y,lab}.json`

### 2.5 `packages/contracts`

- [ ] `package.json`, `src/index.ts`
- [ ] `src/money.ts` (Money type, zod, decimal-string helpers), `src/ids.ts`
- [ ] `src/persona.ts`
- [ ] `src/permissions.ts` (illustrative catalogue, marked non-authoritative — C17)
- [ ] `src/entities/{project,unit,party,lead,invoice,notification,activity}.ts`
- [ ] `src/api/transport.ts` (`ApiTransport` interface)
- [ ] `src/api/errors.ts` + `errors.test.ts` (error contract; Laravel-422 mapper)
- [ ] `src/search.ts` (Ctrl+K contract)
- [ ] `src/onboarding.ts` (`TourProgressRecord`, mirrors future `user_tour_progress`)
- [ ] `src/screens/types.ts`, `src/screens/register.generated.ts`

### 2.6 `packages/fixtures`

- [ ] `package.json`, `src/index.ts`
- [ ] `src/seed.ts` (seeded PRNG)
- [ ] `src/names.ts` (fictional Latin- and Urdu-script name parts)
- [ ] `src/tenant.ts`
- [ ] `src/personas.ts` (Manager, Sales [one project], Finance, Resident)
- [ ] `src/inventory.ts` (2 projects → 5 towers → floors → ~600 units)
- [ ] `src/parties.ts`, `src/leads.ts`, `src/invoices.ts`, `src/notifications.ts`
- [ ] `src/mock-transport.ts` — seeded latency, `slow|error|offline` switch, persona scope filtering, mutation log
- [ ] `src/training-store.ts` — separate store for practice writes
- [ ] `src/handlers/{search,inventory,parties,leads,notifications,practice}.ts`
- [ ] `src/fixtures.test.ts` — determinism; fictional-data rules (`DEMO` IBAN bank code, CNIC/phone patterns)
- [ ] `src/mock-transport.test.ts` — scope filtering; training writes never touch the main store

### 2.7 `packages/ui/src`

- [ ] `index.ts`
- [ ] **providers/** `AppProviders.tsx`
- [ ] **navigation/** `RouterAdapter.tsx` (React Aria `RouterProvider` + `UrlState` context)
- [ ] **a11y/** `LiveAnnouncer.tsx`, `SkipLink.tsx`, `VisuallyHidden.tsx`, `useRouteFocus.ts` (focus H1 + announce title on route change), `useReducedMotion.ts`
- [ ] **preferences/** `PreferencesProvider.tsx` (reduced motion, contrast, sound OFF, text-only guide, tour auto-offer), `PreferencesForm.tsx`, `sound.ts`
- [ ] **primitives/** `Button.tsx` (local loading, duplicate-submit guard), `IconButton.tsx` (required label), `Link.tsx`, `DirectionalIcon.tsx`, `Spinner.tsx`
- [ ] **forms/**
  - `Form.tsx` (react-hook-form + zod bridge, focus first error);
  - basic fields: `TextField.tsx`, `TextArea.tsx`, `Checkbox.tsx`, `RadioGroup.tsx`, `Switch.tsx`, `Select.tsx`, `ComboBox.tsx`;
  - `AsyncSelect.tsx` (shows context: name + ID + phone);
  - `MultiSelect.tsx`;
  - `UnitPicker.tsx` (project → tower → floor → unit, shows availability and price, constraints explained);
  - `CurrencyInput.tsx`, `DateField.tsx`, `PhoneInput.tsx`, `CnicInput.tsx`;
  - `FileUpload.tsx` (native picker/camera, no drag-only path);
  - `ValidationSummary.tsx`, `FieldHelp.tsx`;
  - `useDraft.ts` (in-memory; survives back/forward and validation errors);
  - `serverErrors.ts`.
- [ ] **data/** `Money.tsx`, `DateTime.tsx`, `Reference.tsx` (bidi-isolated IDs/IBAN/phone), `StatusLabel.tsx` (icon + text), `EntityReference.tsx`, `ActivityTimeline.tsx`, `KeyValueList.tsx`
- [ ] **overlays/**
  - `Dialog.tsx`, `ConfirmDialog.tsx` (states exact effect; optional reason);
  - `Drawer.tsx` (side drawer → full-height sheet on phone);
  - `BottomSheet.tsx`, `Popover.tsx`, `Menu.tsx`, `Tooltip.tsx`.
- [ ] **feedback/**
  - `Toast.tsx` (visual + live announcement, optional reference);
  - `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx` (what happened / changed? / recovery / reference);
  - `ForbiddenState.tsx`, `OfflineState.tsx`, `NotFoundState.tsx`, `InlineAlert.tsx`, `DemoBadge.tsx`.
- [ ] **layout/**
  - `Tabs.tsx` (URL-synced; overflow "More"; RTL arrow keys);
  - `Breadcrumbs.tsx`, `PageHeader.tsx`, `WorkspaceHeader.tsx`, `Panel.tsx`;
  - `RelatedDrawer.tsx`.
- [ ] **shell/**
  - frame: `AppShell.tsx` (landmarks), `AppHeader.tsx`, `Sidebar.tsx` (256 / 72 px, collapsible);
  - navigation: `MobileNavSheet.tsx`, `MobileBottomNav.tsx`;
  - header controls: `LocaleSwitcher.tsx`, `ProjectSwitcher.tsx`, `QuickCreateMenu.tsx`, `NotificationsPanel.tsx`, `HelpMenu.tsx`, `HelpDrawer.tsx`, `UserMenu.tsx`;
  - demo only: `DemoPersonaSwitcher.tsx` (simulated sign-in; "Reset demo onboarding").
- [ ] **command/** `CommandPalette.tsx` (React Aria Autocomplete; routes + records + actions), `useCommandHotkey.ts` (Ctrl/⌘+K by `event.code`, so it works with an Urdu keyboard layout), `providers.ts`
- [ ] **permissions/** `PermissionProvider.tsx`, `PermissionGate.tsx`, `can.ts`, `can.test.ts`
- [ ] **onboarding/**
  - engine and state: `GuidedTourProvider.tsx`, `tourMachine.ts`, `tourTypes.ts`, `useGuidedTour.ts`, `tourGuard.ts`, `accessibility.ts`;
  - rendering: `TourOverlay.tsx`, `TourPopover.tsx`, `TourControls.tsx`;
  - anchors, registry and progress: `TourRegistry.ts`, `TourAnchor.tsx`, `TourProgressStore.ts`;
  - surfaces: `FirstLoginWelcome.tsx`, `TourCompletion.tsx`, `TextOnlyTour.tsx`, `PracticeModeBanner.tsx`, `TrainingProvider.tsx`;
  - tour definitions: `tours/backoffice.ts`, `tours/lab.ts`;
  - tests: `tourMachine.test.ts`, `TourProgressStore.test.ts`.
- [ ] **test/** `setup.ts`; component tests `forms/forms.test.tsx`, `layout/Tabs.test.tsx`, `overlays/Dialog.test.tsx`

### 2.8 `apps/backoffice`

- [ ] `package.json`, `index.html` (boot script), `vite.config.ts`, `tsconfig.json`
- [ ] `src/main.tsx`, `src/styles.css`
- [ ] `src/prototype/router.tsx` (React Router 7 data router, lazy routes), `navigation.tsx` (adapter), `registerRoutes.ts` (register URL → built page or Planned screen), `loaders.ts`
- [ ] `src/layouts/BackofficeLayout.tsx`, `src/nav.config.ts` (Home · Sales · Projects · Customers · Finance · Procurement · HR · Operations · Residents · Reports · Administration, permission-filtered)
- [ ] `src/pages/lab/{LabHome,TokensLab,ComponentsLab,FormsLab,WorkspaceLab,StatesLab}.tsx`
- [ ] `src/pages/help/{TourLibrary,TourLauncher,TextOnlyGuide,PracticeSandbox}.tsx`
- [ ] `src/pages/settings/PreferencesPage.tsx`
- [ ] `src/pages/system/{PlannedScreen,NotFound,RouteError}.tsx`

### 2.9 `apps/customer-web`

- [ ] `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- [ ] `src/main.tsx`, `src/styles.css`
- [ ] `src/prototype/{router,navigation}.tsx`
- [ ] `src/layouts/CustomerLayout.tsx` (bottom nav `Home | Property | Payments | Services | Profile` on phone; side/top nav on desktop), `src/nav.config.ts`
- [ ] `src/pages/{CustomerLab,AccessibilityPreferencesPage,PlannedScreen,NotFound}.tsx`

### 2.10 `tests`

- [ ] `support/fixtures.ts` (persona, locale, clean storage), `support/axe.ts` (WCAG 2.2 A/AA tags), `support/viewports.ts`, `support/tour.ts`
- [ ] `e2e/{shell,locale,forms-keyboard,overlays,command-palette,permissions,onboarding,a11y,reflow,register,customer-shell}.spec.ts`
- [ ] `evidence/stage1.evidence.spec.ts`

---

## 3. Routes live at the end of Stage 1

| URL | Content | Register |
|---|---|---|
| `/backoffice` | → `/backoffice/lab` until HOME-001 exists (Stage 2) | GUIDE-001 shows here on first entry |
| `/backoffice/lab` (+ `/tokens`, `/components`, `/forms`, `/workspace`, `/states`) | Component showcase; dev-only, excluded from coverage | — |
| `/backoffice/global/command-palette` | Palette opened over start page | GLOBAL-001 |
| `/backoffice/global/quick-create` | Quick-create menu opened. Actions whose screens don't exist yet are visibly disabled with "Available from Stage 2". "New lead (practice)" works. | GLOBAL-003 |
| `/backoffice/global/notifications` | Notifications panel opened | GLOBAL-004 |
| `/backoffice/global/context-help` | Help drawer opened | GLOBAL-007 |
| `/backoffice/global/profile--preferences` | Preferences (profile section is Stage 2) | GLOBAL-008 (partial) |
| `/backoffice/global/language-switcher` | Preferences → Language | GLOBAL-009 |
| `/backoffice/global/accessibility-preferences` | Preferences → Accessibility | GLOBAL-010 |
| `/backoffice/settings/onboarding` | Preferences → Guided tours | GUIDE-006 |
| `/backoffice/help/tours` | Tour library: start / resume / replay / text version | GUIDE-003 |
| `/backoffice/help/tours/GLOBAL-TOUR-001` | Launches the spotlight tour | GUIDE-002 |
| `/backoffice/help/tours/:tourId/text` | Text-only guide | GUIDE-002 alt |
| `/backoffice/help/practice` | Practice sandbox with one demo task | GUIDE-004 (foundation) |
| `/customer/portal/lab` | Customer-personality showcase in the customer shell | — |
| `/customer/portal/accessibility-preferences` | Same preferences component, customer shell | PORTAL-027 |
| Every other register URL (≈ 307) | Intentional **Planned screen**: ID, name, template, target stage, links back | Resolves, not 404 |

**Coverage after Stage 1:** 321 of 321 register URLs resolve. About 13 screens are implemented or partially implemented; the rest are intentional Planned-screen states.

---

## 4. Tour scripts shipped in Stage 1

### `GLOBAL-TOUR-001` — Backoffice essentials (v1, doc 09 §3)

| # | Step | Kind | Anchor (desktop / phone) | Permission |
|---|---|---|---|---|
| 1 | Welcome | EXPLAIN | none | — |
| 2 | Sidebar | EXPLAIN | `nav-primary` / `nav-menu-button` | — |
| 3 | Current project | EXPLAIN | `project-switcher` / `project-switcher` (header chip) | `project.context.use` |
| 4 | Command search | GUIDED_ACTION, optional: open it, or press Next | `command-search` | — |
| 5 | Quick Create | EXPLAIN | `quick-create` | `quickcreate.use` |
| 6 | Related and Help | EXPLAIN | `global-help` | — |
| ✓ | Completion | — | Try a practice task · Open Help · Go to start page | — |

### `LAB-TOUR-001` — Practice demonstration (exists to prove the module-tour mechanism)

| # | Step | Kind | Anchor | Permission |
|---|---|---|---|---|
| 1 | What practice mode is | EXPLAIN | none | — |
| 2 | Open Quick Create → New lead (practice) | GUIDED_ACTION, completes on `quickCreate.practiceLead.opened` | `quick-create` | `lead.create` |
| 3 | Fill and submit a fictional lead, incl. project → unit picker | SIMULATED_TASK, completes on `practice.lead.submitted` | `practice-lead-form` | `lead.create` |
| 4 | Where transfer-proof review will live | EXPLAIN | `nav-finance` | `finance.evidence.review` (**Finance only**; Sales never sees it) |
| 5 | Replay any time from Help | EXPLAIN | `global-help` | — |

The module-first-use trigger (09 §2B) is implemented and unit-tested. The real module tours register against it in Stage 3.

---

## 5. Tests and what each proves

**Unit (Vitest):**
- Formatters, with C4/C5 pinned for EN and UR.
- Token contrast pairs (C1/C2).
- i18n parity.
- Permission filter.
- Tour state machine: next/back/skip/pause/resume, permission filtering, missing-anchor fallback, version keys.
- Progress store: key shape, no PII fields, storage failure falls back to memory.
- Fixture determinism and fictional-data rules.
- Mock transport scope filtering and training isolation.
- Laravel-422 error mapping.

**E2E (Playwright, Chromium), mapped to acceptance criteria:**

| Spec | Proves | Source |
|---|---|---|
| `shell` | Landmarks, one H1, skip link, sidebar collapse, phone menu sheet traps and returns focus, breadcrumbs are links | 01 §4, 03 |
| `locale` | EN↔UR flips `html[lang][dir]` without reload; typed form values, open drawer and current tab survive; references stay LTR-isolated; preference survives reload | 03 S1, 04, J7 |
| `forms-keyboard` | Forms lab completed with keyboard only (async select, unit picker, currency, date, phone, CNIC, file picker); errors linked by `aria-describedby`; summary focused on submit; draft survives back/forward | 03 S1, 01 §2 |
| `overlays` | Drawer/dialog focus trap, Escape, focus return; confirm dialog states effect; toast reaches live region | 04 |
| `command-palette` | Ctrl+K and ⌘+K (also with Urdu locale); search button on phone; keyboard selection navigates; results differ for Sales vs Finance | 01 §2, J9 |
| `permissions` | Persona switch changes nav, quick create, palette; `PermissionGate` fallback | J9 |
| `onboarding` | Doc 09 §11 tests 1–9, 11, 13 in full; 10 and 12 partially (see §6) | 09 §11 |
| `a11y` | axe with zero violations on every Stage 1 route × EN/UR × 1440/390, plus open palette, drawer, welcome and each tour step | 04 |
| `reflow` | 320 px and 200 % zoom: no page-level horizontal scroll; tour controls and header actions reachable | 01 §4, 09 §7 |
| `register` | All 321 register URLs render a page (built or Planned) with an H1 and no console errors | 01 §16 |
| `customer-shell` | Bottom nav on 390, side nav on 1440, same component tree; locale switch | 01 §5 |

**Stage 1 is done when:**
- `typecheck`, `lint`, `test` and `test:e2e` all pass. Outputs are recorded verbatim in `test-results.md`; failures are reported, not hidden.
- Contrast and i18n parity show zero failures.
- Every axe violation is fixed, or documented with a reason in the report.

---

## 6. Honest limits of Stage 1 evidence

- **Screen readers:** I can't run NVDA, VoiceOver or TalkBack from this environment. Automated ARIA snapshots and axe are a proxy only. `manual-screen-reader-checklist.md` gives the exact steps for a human tester, covering both the modal and non-modal tour step patterns (doc 09 §4). Doc 09 test 10 stays "pending manual" until someone runs it.
- **Doc 09 test 12** (simulated *payment* tutorial) is proven only in its general form in Stage 1: no non-training mutation during practice. The payment-specific tutorial comes in Stages 3–4.
- **Browsers:** Chromium only in Stage 1. WebKit/Firefox and real iOS/Android devices come in Stage 6.
- **WCAG:** no conformance claim is made at any stage without independent evaluation.

---

## 7. Evidence produced (`docs/status/ui-stage-1/screenshots/`)

| Subject | 1440 EN | 1440 UR | 390 EN | 390 UR | Other |
|---|:-:|:-:|:-:|:-:|---|
| Backoffice shell (start page) | ✓ | ✓ | ✓ | ✓ | 768 tablet, 320 reflow, 200 % zoom |
| Phone menu sheet | | | ✓ | ✓ | |
| Forms lab with validation errors | ✓ | ✓ | ✓ | ✓ | |
| Unit picker open | ✓ | ✓ | | | |
| Drawer + toast | ✓ | ✓ | ✓ | | |
| Command palette (Sales vs Finance) | ✓ | ✓ | ✓ | | |
| First-login welcome | ✓ | ✓ | ✓ | ✓ | |
| Tour step 3 (project switcher) | ✓ | ✓ | ✓ | ✓ | high-contrast + reduced-motion variants |
| Tour completion | ✓ | ✓ | | | |
| Text-only guide | ✓ | ✓ | | | |
| Practice banner during `LAB-TOUR-001` | ✓ | ✓ | ✓ | | |
| Tokens lab (contrast table, EN/UR type specimens) | ✓ | ✓ | | | for native Urdu review (C26) |
| Customer shell | ✓ | ✓ | ✓ | ✓ | |

---

## 8. Risks I'll watch in Stage 1

| Risk | Mitigation |
|---|---|
| ESLint 10 plugin compatibility (jsx-a11y, react-hooks) | Check at install; substitute or drop with a note |
| Urdu line-height and Naskh rendering in dense controls | Tokens lab specimens; adjust `:lang(ur)` metrics; native-reader review |
| Spotlight positioning across scroll containers, sticky header, RTL | ResizeObserver + scroll listeners; e2e checks that the anchor box sits inside the cut-out at 1440/390/320 in both directions |
| Playwright Chromium download (~170 MB) | One-time; noted in README |
| Scope creep into Stage 2 screens | Anything outside this checklist goes to the Stage 2 backlog in the report |
