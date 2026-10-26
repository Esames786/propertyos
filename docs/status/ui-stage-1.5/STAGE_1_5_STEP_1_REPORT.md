# Stage 1.5, step 1: Limestone & Evergreen, restyled shell, management dashboard

**Status:** ready for your review.

**Branch and merge:** branch `feature/stage-1.5-premium-design`, not merged to `main`.

**Not started**, as instructed:
- the other seven reference screens;
- Stage 2.

**Unchanged:**
- no backend, payments, migrations or real gateways;
- all data is fictional;
- the tenant is still *Larkspur Estates (Demo)* and *PropertyOS* is still the codename.

## 1. Start here

| What | Where |
|---|---|
| **Videos** | |
| Interaction video, desktop (47 s) | [`video/dashboard-desktop.mp4`](video/dashboard-desktop.mp4) |
| Interaction video, phone (20 s) | [`video/dashboard-phone.mp4`](video/dashboard-phone.mp4) |
| **Dashboard** | |
| Desktop, English | [`screenshots/dashboard-1440-en.png`](screenshots/dashboard-1440-en.png), full page [`…-en-full.png`](screenshots/dashboard-1440-en-full.png) |
| Desktop, Urdu (RTL) | [`screenshots/dashboard-1440-ur.png`](screenshots/dashboard-1440-ur.png), full page [`…-ur-full.png`](screenshots/dashboard-1440-ur-full.png) |
| Phone, English and Urdu, section by section | `screenshots/dashboard-390-en-1-hero.png` … `-8-residences.png`, and the same eight for `-ur-` |
| Tablet | [`screenshots/dashboard-768-en.png`](screenshots/dashboard-768-en.png), [`…-768-ur.png`](screenshots/dashboard-768-ur.png) |
| **Comparisons** | |
| Before/after (Stage 1 → 1.5) | [`before-after/`](before-after/): start page EN/UR at 1440 and 390, the same page re-skinned, tour step, menu sheet |
| **Design system** | |
| Design-system decisions | [`../../design/stage-1.5/DESIGN_SYSTEM_V2.md`](../../design/stage-1.5/DESIGN_SYSTEM_V2.md) |
| Image licences | [`../../design/ASSET_REGISTRY.md`](../../design/ASSET_REGISTRY.md) |
| **Results** | |
| Test and accessibility results | [`test-results.md`](test-results.md) |

**To try it yourself:** run `npm run dev` and open http://localhost:5173/backoffice. Sign in as Nadia (manager); the dashboard is now the start page. Sign in as Bilal (sales) or Farah (finance) to see the role-aware versions.

## 2. What was built

### 2.1 Limestone & Evergreen tokens (`packages/tokens`)

**Colour**
- A limestone canvas frames white content surfaces.
- Ink and muted text use warm greys.
- Evergreen is the single action colour.
- Bronze is for accent text; brass is decorative only.
- Status, demo and training colours were recalibrated for the warm palette.
- Every pair is contrast-tested in standard, more-contrast and the authored **night palette** (from Direction C, not exposed in the UI yet).

**Chart colours.** A five-hue categorical set and two ordinal ramps (evergreen for the unit lifecycle, bronze for funnel stages). All are validated for colour-blind separation, lightness, chroma and contrast in light and dark.

**Type.**
- Newsreader for headings and names.
- Geist for the interface and financial figures (Direction B's tabular-figure discipline).
- Geist Mono for references.
- Gulzar for Urdu headings.
- Noto Naskh Arabic for Urdu interface text.

All fonts are self-hosted, and Urdu files load only when Urdu is on screen. Inter was removed.

**Shape and depth.** Radii 6/10/14/20, soft warm layered shadows, hairlines instead of boxes, motion durations and easings.

**Text on photos.**
- A text block over a photo carries its own scrim, which is never lighter than the tested minimum behind any text.
- Chips on photos use a tested dark background.
- Both are proven at 4.5:1 against a pure-white pixel, the worst case for any photo.

### 2.2 Restyled backoffice shell (shared, `packages/ui/src/shell`)

**Desktop and tablet**
- A floating white rail with:
  - the tenant monogram (evergreen with a brass hairline) and the name in Newsreader;
  - grouped navigation (Workspace · Operations · Insights · Prototype) with a **sliding inset marker** on the current item;
  - a collapse control to an 80 px icon rail with tooltips.
- A header with no heavy bar: it gains a hairline only when content scrolls under it. It holds the project pill, a search pill with Ctrl K, an evergreen quick-create pill, the language toggle, notifications, help and the avatar.

**Phone**
- An app-style top bar.
- A **bottom bar** with the four most-used destinations the role may open, plus "More" (opens the full menu sheet).
- Thumb-size targets and safe-area insets.

**What did not change:** every guided-tour anchor, test ID, landmark and keyboard path. All 18 onboarding tests pass unchanged.

**Global component restyles**
- Panels lose their border; page titles use the display face.
- The `/backoffice` start page now opens the dashboard.
- Not-found and planned pages link back to the dashboard.

### 2.3 Management dashboard (HOME-001, `/backoffice/home/role-aware-dashboard`)

| Section | What it shows | Interaction |
|---|---|---|
| Greeting | "Good afternoon, Nadia", role eyebrow, tenant, data date | — |
| **Project showcase** | Photo with an *Illustrative image* label. Location, units, completion date, progress ring, sold/available/sales/from-price, and a milestone track (done, in progress with %, upcoming) | Arrows, dots, **swipe on touch**, crossfade; each change is announced; no auto-rotation |
| **Action centre** | Payment proofs awaiting verification, follow-ups due, expiring holds, overdue instalments. Only the kinds the role can act on | Tabs with counts and a sliding pill; each row opens the record; urgency shown as icon plus word |
| **Reporting period** | 3 months · 6 months · year to date · 12 months, stored in the URL (`?range=`) | Arrow keys work; scopes every figure below it; refetch keeps the previous frame dimmed; the update is announced |
| **KPI tiles** | Four per role: value, change against the comparison period (good/bad tone plus arrow plus words), context line, 12-month sparkline | Count-up; each tile is one link to the screen behind the number |
| **Collections against schedule** | Columns for amount collected and a tick for the scheduled amount, per month; current month marked "to date" | Hover or keyboard (one tab stop, arrows, Home/End) shows a tooltip; **Data table** toggle; columns grow on load and morph between periods; mirrored in Urdu |
| **Sales funnel** | Enquiries → contacted → site visits → qualified → booked, with step conversion | Direct labels; hover emphasis; data table |
| **Inventory by building** | Towers A–C and Phases 1–2, stacked by available / on hold / sold / handed over | Each row is a link to the unit matrix; hover or focus shows the breakdown; data table |
| **Construction update** | Site photo, report headline and body, overall-progress ring | Link to all updates |
| **Residences** | Image-led cards per residence type: availability meter, starting price, average area. Plots use a drawn site plan, not a photo | Horizontal rail with scroll-snap, swipe, and arrow buttons that disable at the ends; image zoom on hover |

**Header project switcher.** It now scopes the whole dashboard; choosing Larkspur Gardens changes every section.

**Role awareness.** One read model composes the page by permission:

| Role | KPI tiles | Charts | Action centre |
|---|---|---|---|
| Manager | sales booked, collected, units available, conversion | collections + funnel, inventory | proofs, follow-ups, holds, overdue |
| Sales (Heights only) | sales booked, conversion, open pipeline, units available | funnel, inventory | follow-ups, holds |
| Finance | collected, receivables, proofs to verify, sales booked | collections | proofs, overdue |

**The "never paid" rule.** Proofs are always "Awaiting verification". The action centre states that rule, and a test asserts the word "Paid" never appears there.

### 2.4 Data and imagery

**Dashboard data.** `GET /dashboard/summary?range=` is served by the mock transport and scoped by role and project.
- Snapshot figures come from the existing fixtures: inventory, prices, holds, follow-ups and proofs.
- Flows over time come from a deterministic 24-month fictional history, so every period has a comparison.

**Photography.** Seven CC0 photographs, each with its source page recorded:
- the sources were StockSnap, rawpixel and the WordPress Photo Directory;
- each image is converted to WebP at 480 and 960 px;
- each carries translated alt text and the visible "Illustrative image" label.

Recognisable landmarks, faces and hotel rooms were rejected.

## 3. English and Urdu

- **Mirroring.** The whole layout mirrors in Urdu: rail on the right, time axis running right to left, y-axis on the reading side, bars growing from the right, arrows flipped, swipe direction reversed.
- **Numbers and references.** Money abbreviates by locale: "Rs 1.24B" in English, "Rs 12.4 کروڑ" (lakh, crore, arab) in Urdu. Amounts, references and codes are isolated left to right. I measured the rendered glyph positions to confirm "Rs" sits before the Urdu unit.
- **Typography.** Urdu headings use Gulzar (Nastaliq-style); Latin names inside Urdu stay in Newsreader.
- **Translations.** 799 keys per locale, with full parity; there is a new `dashboard` namespace.

## 4. Accessibility

| Check | Result |
|---|---|
| axe-core 4.13, WCAG 2.0/2.1/2.2 A+AA | **142 scans, 3,565 rule passes, 0 violations**. This includes 13 dashboard scans: EN/UR × 1440/390; manager and finance with data tables, tabs and the second project open; high contrast |
| Keyboard | Every dashboard control is reachable. Charts use one tab stop with arrow keys. Tabs, segmented control and carousel follow standard patterns. Focus moves to the H1 after navigation |
| Screen-reader semantics | Charts are labelled groups described by their takeaway, and every column has a full spoken name. Tiles and inventory rows are links with complete names. Count-ups expose only the final value. Carousel changes and period updates are announced |
| Reflow and zoom | No horizontal scroll at 320 px or 200 % zoom, in English or Urdu |
| Reduced motion and more contrast | All Motion animations and CSS durations switch off; figures render final immediately (tested). The more-contrast palette passes every pair |
| Colour | Status is never shown by colour alone (icon plus word). Chart identity has a legend plus direct labels plus a data table |

**Fixed during this step**
- Tab panels kept a stale ID after switching tabs: an ARIA reference to a missing element. This also affected the shared workspace tabs.
- The data table's scroll area could not be reached by keyboard.
- The Tokens lab previewed non-text colours as text.

**Still open from Stage 1:** manual screen-reader testing (NVDA, VoiceOver, TalkBack). I cannot run screen readers here. No WCAG conformance claim is made.

## 5. Tests and build

| Check | Result |
|---|---|
| Typecheck (TypeScript 6.0.3) | clean |
| Lint: ESLint 10, RTL logical-CSS guard, i18n parity | clean |
| Unit tests (Vitest) | **202 / 202** (Stage 1: 126). New tests cover the night palette, ordinal ramps, image scrims, compact money, the dashboard read model, and chart keyboard, RTL and table behaviour |
| End-to-end (Playwright, Chromium, production builds) | **102 / 102** on the final run (Stage 1: 88). One test is intermittent under full-suite load (details in test-results.md) |
| Production build | Both apps build. The backoffice dashboard is its own 38.6 kB chunk (11.7 kB gzip) |
| Bundle growth | The shared chunk grew from 1.04 MB to **1.26 MB** (303 → 377 kB gzip), mostly from Motion and d3. The customer app also pulls these in through the shared barrel. Code-splitting and performance budgets were already scheduled for Stage 6; I recommend splitting the chart kit and Motion out of the shared chunk then |

## 6. Decisions to confirm

1. **KPI figures use the interface sans (Geist), not the serif.** The approved board showed serif numerals. I followed your instruction to borrow B's clear financial typography, which is also the data-viz rule for headline numbers. The serif carries headings and names. Easy to change if you prefer serif numerals.
2. **Photography.** The sources only serve about 960 px images to anonymous downloads, which is sharp on standard screens and slightly soft on high-density screens. Every photo is labelled illustrative. Real projects would use tenant photography (white-label, Stage 2+). Renders of the fictional towers can come with the 3D explorer in Stage 1.5c.
3. **The start page is now the dashboard.** The design-system lab stays in the rail under *Prototype*.
4. **Next.js for the public site** is recorded in ADR-0003. Nothing is built for it in step 1.

## 7. Known limitations

- Dashboard figures are fictional and computed client-side by the mock transport. Some trend series (pipeline, verifications) are illustrative.
- KPI and chart links open intentional planned pages until those screens are built.
- Prettier formatting is not enforced repo-wide; this was already true at Stage 1. New code follows the existing style.

## 8. Changed files

**New packages and docs**
- `packages/assets` (image registry and 14 WebP files);
- `docs/design/ASSET_REGISTRY.md`;
- `docs/design/stage-1.5/DESIGN_SYSTEM_V2.md`;
- `docs/adr/ADR-0003-public-site-nextjs.md`, plus an amendment to ADR-0001.

**Tokens** (`packages/tokens`)
- `theme.css`, `fonts.css`, `tokens.ts`, `contrast.test.ts`;
- dependencies: Geist, Geist Mono, Newsreader and Gulzar added; Inter removed.

**Shared UI** (`packages/ui`)

New:
- chart kit: `charts/*`;
- `data/AnimatedNumber`, `data/StatTile`;
- `property/Photo`, `property/PlotIllustration`;
- `layout/SegmentedControl`, `layout/PillTabs`;
- `shell/BottomNav`, `shell/BrandBlock`.

Restyled:
- `AppShell`, `AppHeader`, `Sidebar`, `NavList`, `MobileNavSheet`;
- `ProjectSwitcher`, `QuickCreateMenu`, `LocaleSwitcher`, `UserMenu`;
- `Panel`, `PageHeader`.

Fixed: tab panel ID in `Tabs`.

**Contracts, fixtures and i18n**
- Contracts: `dashboard.ts`, `isMoneyAmount`.
- Fixtures: `dashboard.ts`, its tests, and the handler.
- i18n:
  - `formatMoneyCompact` and `formatNumberCompact`;
  - the `dashboard` namespace in EN and UR;
  - nav and image strings.

**Backoffice app**
- `pages/home/*` (the dashboard: 8 files);
- routes, nav groups, start link, not-found and planned links, Tokens lab.

**Register:** `HOME-001` marked implemented (stage 1.5); the generated register was refreshed.

**Tests**
- New: `e2e/dashboard.spec.ts` (12 tests), `evidence/stage15.evidence.spec.ts`.
- Updated:
  - `a11y.spec.ts`: dashboard and roles;
  - `reflow.spec.ts`: dashboard;
  - `shell.spec.ts`: new start page;
  - `permissions.spec.ts`: waits for the nav;
  - `forms-keyboard.spec.ts`: diagnostic on failure.

**Evidence:** 56 screenshots, 7 before/after sheets and 2 videos under `docs/status/ui-stage-1.5/`.

## 9. What I need from you

Please review the dashboard and either **approve it** or tell me what to change.

On approval, I will continue with the other seven reference screens:
- 1.5b: project, inventory and unit, customer 360, pipeline;
- 1.5c: customer PWA home, Next.js public homepage, 3D explorer.

Stage 2 does not start until you approve the full set.
