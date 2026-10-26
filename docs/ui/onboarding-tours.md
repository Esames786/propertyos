# Guided tours shipped in Stage 1

Source of truth: `packages/ui/src/onboarding/tours/*.ts` (definitions) and
`packages/i18n/locales/{en-PK,ur-PK}/onboarding.json` (text). This page summarises them for review.

## Anchors

Tours point at stable `data-tour-id` attributes, never CSS classes or element positions.

| Anchor | Element | Shown on |
|---|---|---|
| `nav-primary` | Sidebar navigation landmark | Tablet and desktop (≥ 768 px) |
| `nav-menu-button` | Header menu button | Phone (< 768 px); opens the navigation sheet |
| `nav-<id>` / `mnav-<id>` | Each sidebar / phone-menu item (e.g. `nav-finance`) | Where the item is visible to the persona |
| `project-switcher` | Header project context | All widths (icon-only below 360 px) |
| `command-search` | Header search (Ctrl+K) | All widths |
| `quick-create` | Header Quick create | All widths |
| `global-help` | Header Help menu | All widths |
| `practice-lead-form` | Practice "New lead" form inside its drawer | When the practice drawer is open |

## GLOBAL-TOUR-001: Backoffice essentials (v1)

Offered by the first-login welcome to every backoffice persona. Replay from Help → Take a tour.

| # | Step | Kind | Anchor (desktop / phone) | Permission | English title | Urdu title |
|---|---|---|---|---|---|---|
| 1 | welcome | EXPLAIN | none | none | Welcome to your workspace | آپ کی ورک اسپیس میں خوش آمدید |
| 2 | sidebar | EXPLAIN | `nav-primary` / `nav-menu-button` | none | Main areas | مرکزی شعبے |
| 3 | project | EXPLAIN | `project-switcher` | `project.context.use` | Current project | موجودہ پروجیکٹ |
| 4 | search | GUIDED_ACTION, optional | `command-search` | none | Search anything | کچھ بھی تلاش کریں |
| 5 | quickCreate | EXPLAIN | `quick-create` | `quickcreate.use` | Quick create | فوری اندراج |
| 6 | help | EXPLAIN | `global-help` | none | Related records and help | متعلقہ ریکارڈز اور مدد |

- **Step 4:** opening the palette suspends the overlay. Closing it advances the tour, and Next also works.
- **Step 2 on phones:** the step highlights the menu button and uses phone-specific wording.

## LAB-TOUR-001: Practice: create a fictional lead (v1)

Demonstrates the module-tour mechanism. It is offered once on the first visit to the design system lab (module `lab`), when automatic offers are on. It runs in practice mode.

| # | Step | Kind | Anchor | Permission | Notes |
|---|---|---|---|---|---|
| 1 | intro | EXPLAIN | none | none | Practice mode starts (TRAINING banner) |
| 2 | openQuickCreate | GUIDED_ACTION | `quick-create` | `lead.create` | Suspends while the menu is open; completes when the practice drawer opens |
| 3 | fillForm | SIMULATED_TASK | `practice-lead-form` (inline in the drawer) | `lead.create` | Completes when the practice lead is created (training store only) |
| 4 | financeReview | EXPLAIN | `nav-finance` | `finance.evidence.review` | Finance only. On phones the anchor is in the closed menu, so it explains without a highlight |
| 5 | replay | EXPLAIN | `global-help` | none | Practice ends and training records are discarded |

Resolved step counts:

| Persona | Steps |
|---|---|
| Sales | 4 (no Finance step) |
| Manager | 5 |
| Finance | 3 (no `lead.create` steps) |

## Progress record

Stored per `tenant + persona + app + tour + version` (`localStorage` in the prototype). It mirrors the future `user_tour_progress` columns:

- `tenantId`, `personaId`, `app`, `tourId`, `tourVersion`
- `status`: `in_progress | paused | completed | dismissed`
- `lastStepId`
- `startedAt`, `completedAt`, `dismissedAt`, `updatedAt`

No personal or business data is stored.

## Text-only version

`/backoffice/help/tours/<tourId>/text` lists the same permitted steps, each with "Show me", which focuses the real control. Turning on "Use the text guide instead of the spotlight" in Preferences → Guided tours makes Help → Take a tour open this page.
