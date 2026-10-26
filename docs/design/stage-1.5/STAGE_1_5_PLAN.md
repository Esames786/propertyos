# Stage 1.5 plan: premium visual design overhaul

**Starts after:** you choose a direction (A recommended) and answer the decisions in §9.

**Branch:** all work happens on `feature/stage-1.5-premium-design`. Nothing merges to `main` until you approve the reference screens.

**Out of scope:** backend, real payments, gateway integrations. Stage 2 screens are not built.

---

## 1. Principles

1. **Re-skin and recompose; don't fork.** Existing primitives, forms, palette search, tour engine, i18n and tests stay. Component APIs remain stable, so the 214 existing tests remain valid.
2. **Accessibility before style.**
   - Every new colour pair goes into the contrast test.
   - Every new screen gets axe scans in EN/UR at 1440 and 390, keyboard paths, 320 px reflow and reduced-motion checks.
   - No text over imagery without a guaranteed contrast scrim.
3. **Mobile is designed, not compressed.** Each reference screen has its own phone composition: bottom sheets, thumb-reach actions, image-led cards.
4. **Motion has a job.** It explains a change (where a drawer came from, which unit is selected, what just updated) and switches off under reduced motion.

## 2. Sequence with checkpoints

| Step | Delivers | Your checkpoint |
|---|---|---|
| **1.5a Design system v2 + shell + dashboard** | Tokens v2, fonts, chart kit, restyled shell and core components, **reference screen 1** | Approve the look on one real screen before it spreads (avoids rework) |
| **1.5b Backoffice references** | Screens 2–5: project, inventory + unit, customer 360, pipeline | Review |
| **1.5c Customer, public and 3D** | Screens 6–8: PWA home, public homepage, 3D explorer PoC | Review |
| **1.5d Motion polish + QA + evidence** | Page and tab transitions, onboarding spotlight refresh, full test and accessibility run, before/after comparisons, videos, report | **Final approval → merge to `main`** |

## 3. Design system v2 (step 1.5a)

**Tokens** (`packages/tokens`)
- **Colour scales:** stone, evergreen, bronze and status ramps (50–900).
- **Semantic roles:** canvas, surface levels 0–3, text, icon, border, control, focus, data-1…8.
- **Elevation:** shadow tokens.
- **Radii:** 6 / 10 / 14 / 20 / pill.
- **Spacing:** 4 px scale plus section rhythm.
- **Motion:** durations, easings and springs.
- **Dark theme:** the token set is authored and contrast-tested now but not exposed (future dark theme).

**Type scale**
- English: Display (Newsreader, optical sizes), headings, body 14/16, caption, mono.
- **Urdu:** Gulzar for display and headings, Noto Naskh for body, each with tuned sizes and line-heights.
- All fonts are self-hosted from fontsource (OFL). Urdu font files load only when Urdu is active.

**Chart kit** (new, `packages/ui/src/charts`)
- **Technology:** SVG on `d3-scale` and `d3-shape`, chosen over a charting library for full visual control and RTL-mirrored axes.
- **Charts:** area/line, bars, segmented availability bar, ring, sparkline.
- **Accessibility:** every chart has a "show data" accessible table and a text summary.
- **Animation:** an animated draw-in, switched off under reduced motion.

**Restyled components**
- **Shell and navigation:** shell (floating rail, header), buttons, inputs, select, tabs (animated indicator).
- **Data display:** cards and surfaces, StatusLabel, KPI/Stat, a new **DataTable** (sticky header, sort, density, responsive cards on phone).
- **Overlays and states:** drawers and sheets (spring motion), toasts; empty, loading and error states with architectural line illustrations; the tour spotlight (animated travel, soft glow ring).

**Property components** (new)
- PropertyCard, ProjectHero, ConstructionProgress (milestone timeline);
- AvailabilityBar, PaymentProgress (ring and schedule);
- FloorPlan (parametric SVG per unit type, selectable rooms and units), UnitChip;
- AreaFormatter, PriceTag.

## 4. The eight reference screens

All are clickable React + TypeScript pages using fictional data, built on the shared components. Each is a register screen, so it replaces its planned page.

| # | Screen | Register / route | Highlights | Mock functionality (labelled) |
|---|---|---|---|---|
| 1 | Backoffice shell + management dashboard | HOME-001 `/backoffice/home/role-aware-dashboard` | Project render hero, KPIs with count-up, collections vs target, availability bar, verification queue, today's activity; content varies by role | Data from fixtures; actions open existing drawers |
| 2 | Project workspace | PRJ-002 `/backoffice/prj/projects/prj_heights` (+ register URL) | Architectural hero, KPIs, construction milestone timeline with progress media, tower breakdown, linked module tiles (sales, bookings, collections, handover, maintenance), related drawer | Milestones and media are fictional |
| 3a | Interactive inventory matrix | INV-001 `/backoffice/inv/unit-matrix` | Tower/floor/unit grid with animated selection; filters (type, status, price, facing); quick-view sheet; **list/table alternative** with identical results | Holds are simulated (no real lock) |
| 3b | Unit workspace | INV-003 `/backoffice/inv/units/:id` | Floor-plan SVG, specs, price history chart, availability timeline, holds and quotes, related records | Price versions are fictional |
| 4 | Customer 360 | CUS-003 `/backoffice/cus/customers/:id` | Identity header with KYC status, owned properties cards, payment progress per booking, ledger preview, communications, documents, activity | Documents are placeholders with DEMO watermark |
| 5 | Sales pipeline | CRM-007 `/backoffice/crm/opportunities-pipeline` | Stage columns with value totals; drag **and** keyboard "Move to stage" menu (no drag-only); forecast strip; list alternative; opportunity quick view | Stage moves are local (DEMO) |
| 6 | Customer PWA home | PORTAL-001 `/customer/portal/home` | Image-led property card, payment ring and next installment ("Awaiting verification", never "Paid"), services grid, construction update, notices; desktop composition with side panel | Pay and upload stay disabled until Stage 4 |
| 7 | Luxury public homepage | WEB-001 `/public/web/cinematic-landing` (new `apps/public-site`) | Cinematic hero, scroll storytelling (pinned sections), residences, amenities, location, payment calculator teaser, enquiry; **static reduced-motion version** with the same content | Enquiry creates a mock CRM lead |
| 8 | 3D tower/floor/unit explorer (PoC) | WEB-005 `/public/web/tower-explorer` (+ embedded preview in inventory) | **React Three Fiber**: procedural towers built from floor slabs and unit volumes; hover/select a floor, highlight units by status; camera eases to the floor; a synced **2D floor plan + accessible unit list** that drives the same selection | Procedural model, not a production asset |

**Public site framework:** for this reference I recommend a new **Vite + React** `apps/public-site` sharing the packages. The pages are plain React, so they move to Next.js unchanged if the Stage 5 ADR chooses it for SEO. Decision in §9.

**Data:** I'll add fixtures needed by these screens only (project milestones, opportunities, price versions, ownerships, payment schedules), keeping all names, phones, CNICs and IBANs fictional. The full Stage 2 fixture set waits.

## 5. Imagery strategy

| Option | What | Licensing | Recommendation |
|---|---|---|---|
| 1. Generated architecture | Code-generated renders of the fictional Larkspur towers: SVG for cards and illustrations, Three.js-rendered stills for photographic depth, the same model as the 3D explorer | None (ours) | **Default.** Consistent across dashboard, app, site and 3D |
| 2. Free-licence photography | Interiors, lifestyle and city context from Unsplash/Pexels, logged in `docs/design/IMAGE_CREDITS.md` | Their licences permit commercial use; we keep the record | Optional. Adds realism for interiors; needs your OK |
| 3. Tenant brand photography | Real developer photos via white-label settings | Tenant-owned | Later (Stage 2+ configuration) |

## 6. Motion and interaction

| Library | Use |
|---|---|
| **Motion** 14 (MIT) | Route transitions (fade/slide with direction mirrored in RTL); tab indicator and workspace panel transitions; drawer and sheet springs; count-up figures; inventory selection (layout animation); tour spotlight travel |
| **GSAP** 3.15 (free standard licence) | Public-site scroll storytelling only |
| **React Three Fiber** 9.8 + drei 10.7 + Three r186 | The 3D explorer, lazy-loaded so other screens don't pay for it |

**Budgets**
- Animations: 150–300 ms, no layout thrash, transform and opacity only.
- 3D chunk loads only on explorer routes.
- Aim for LCP under 2.5 s on the public homepage over fast 3G emulation; measured and reported, not assumed.

**Reduced motion**
- One switch (OS setting or in-app preference) turns off transitions, count-ups, scroll scenes and camera easing.
- Content stays complete.

## 7. Accessibility and RTL guarantees for the new screens

- **Contrast:** every new token pair is checked by the contrast test, in standard, more-contrast and the authored dark set.
- **Charts:** a "show data" table and a text summary.
- **Kanban:** a keyboard move menu plus a list view; drag is never required.
- **Inventory grid:** a grid pattern with arrow keys plus an equivalent table.
- **3D canvas:** `aria-hidden`. All interaction is possible through the 2D plan and list, and there is a no-WebGL fallback.
- **Text on imagery:** always over a scrim with measured worst-case contrast.
- **RTL:**
  - mirrored layouts, transitions and chart axes;
  - Latin references, amounts, unit codes and phones bidi-isolated;
  - Urdu headings in Gulzar.
- **Onboarding:**
  - GLOBAL-TOUR-001 anchors are kept on the new shell;
  - the spotlight visuals get the new style;
  - tour e2e tests must pass unchanged.

## 8. Evidence for your approval (per reference screen)

- Screenshots: 1440 px and 390 px, English and Urdu.
- A short interaction video (Playwright recording, MP4 via Laragon's ffmpeg) for animations: selection, transitions, scroll story, 3D.
- axe results (EN/UR × 1440/390), keyboard path, reflow and reduced-motion results.
- A list of reused versus new components, and which actions are mocked.
- **Before/after sheets:** each Stage 1 screen next to its Stage 1.5 redesign.
- Full existing suite re-run: typecheck, lint, 126 unit, 88 E2E; all must stay green.

## 9. Decisions needed from you

1. **Art direction:** A (recommended), B, C, or a blend you describe.
2. **Imagery:** generated architecture only (default), or also allow logged free-licence photography for interiors and lifestyle.
3. **Public homepage app:** new Vite `apps/public-site` now, portable to Next.js later (recommended), or start the Next.js app now.
4. **Checkpoint after reference screen 1** (dashboard) before building the other seven (recommended: yes).
5. **Fictional brand in mockups:** keep "Larkspur Estates (Demo)" as the tenant, with PropertyOS as the small codename mark, or give me another placeholder name.
