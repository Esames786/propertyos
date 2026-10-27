# Stage 1.5R: First-use and functional UX overhaul — gap matrix and plan

**Status: milestone 1 delivered on 2026-10-27; see `STAGE_1_5R_REPORT.md`.** The owner's follow-up message asked for slices A–D as one first milestone, so all four were built together. Slice E (the QA report) is `STAGE_1_5R_REPORT.md`, `FLOW_MATRIX.md` and `test-results.md`.

**Inputs**
- The owner's review pack, `PropertyOS_vs_Nizam_Claude_Review.zip` (22 screenshots and 5 instruction files).
- A live, read-only walkthrough of Nizam (`docs/design/reference/NIZAM_WALKTHROUGH.md`).
- The current code on `feature/stage-1.5-premium-design` at commit `81dbbfa`.

**The owner's decision**: Stage 1.5 Step 1 is **not approved**. No Stage 2 and no other reference screens until 1.5R is reviewed.

## 1. What the current code already has (verified in the repo, not only reported)

| Area | Current state | Keep? |
|---|---|---|
| Tour engine | `packages/ui/src/onboarding/`. A real spotlight cut-out with ring and pulse (`TourOverlay.tsx`), an anchored popover with collision handling (`placement.ts`), a state machine, progress store, text-only mode, practice mode and reduced motion | **Yes.** Extend it rather than rebuild |
| Tours defined | `GLOBAL-TOUR-001` (welcome, sidebar, project switcher, search, quick create, help) and `LAB-TOUR-001` | Extend with dashboard, sales and customer tours |
| Entry | `DemoSignIn` persona picker, then a welcome dialog | Replace with a real get-started page |
| Management dashboard | Built in Stage 1.5 (`HOME-001`) | Keep; restructure for clarity (see 3.A) |
| Sales home `/backoffice/crm/sales-home` | **Planned placeholder** (pack P04) | Build |
| Customer portal home `/customer/portal/home` | **Planned placeholder** (pack P01, P06) | Build |
| Practice lead drawer | Works, but is disconnected: the lead goes nowhere (pack P05) | Connect it to the lead list and timeline |
| Signup / workspace setup | None | Build as a labelled simulation |
| Forms keyboard test | Intermittent (1 of 3 full runs) | Find the root cause |

## 2. Gap matrix (call to action → expected → today)

| # | Entry or call to action | Expected (owner pack / Nizam benchmark) | Today | Gap |
|---|---|---|---|---|
| 1 | First visit to the app | Get-started: **Explore demo** or **Set up my developer workspace**, with language and accessibility controls | Persona sign-in card | **Missing** |
| 2 | Explore demo | Short real preparation, then "Demo ready" explaining what you can try, with **Start tour** or **Explore freely** | Sign-in goes straight to the dashboard | **Missing** |
| 3 | Set up workspace | Wizard: account → simulated verification → organisation → first project → invite (optional) → done | None | **Missing** |
| 4 | Tour on the dashboard | Spotlights the real KPI cards, action centre, quick create, charts and project switcher, each scrolled into view | The tour covers the shell only (sidebar, switcher, search, quick create) | **Partial**: add dashboard steps and role variants |
| 5 | Tour behaviour | Back, Next, Skip, Pause, Resume, Replay; progress per identity + tenant + version; missing-target fallback; RTL; 200 % zoom | Most exist; check pause/resume, per-tenant keys and the RTL anchor | **Verify, then fill gaps** |
| 6 | Sidebar → Sales | Sales workspace: KPIs, pipeline, follow-ups, site visits, lead list, quick actions | Placeholder card | **Missing** |
| 7 | Quick create → New lead (practice) | The saved demo lead appears in the lead list, search and activity timeline | Toast only; the lead disappears | **Missing link** |
| 8 | Lead → unit | Lead workspace opens the unit quick view and returns with filters kept | None | **Missing** |
| 9 | Customer app home | Property photo, unit, next instalment, receipts, construction progress, maintenance and visitor actions | Placeholder card | **Missing** |
| 10 | Customer → Pay / upload proof | Simulated; ends at "Awaiting verification", never "Paid" | None | **Missing** |
| 11 | Phone navigation | Bottom bar with a raised centre action; a "More" page of icon cards | Bottom bar plus "More" sheet | **Refine** |
| 12 | Visual clarity | Large bold figures, icon tiles, colour plus label for status, quick-action row | Editorial style; small muted text in places | **Refine within Limestone & Evergreen** |

## 3. Plan: bounded slices, each with its own review

Each slice ends with:
- tests, axe scans and a production build;
- EN/UR × desktop/phone screenshots and a short video;
- a click-by-click matrix (call to action → expected → observed → pass/fail).

I stop for review after each slice.

**A. First five minutes**
- Get-started page (EN/UR, language and accessibility controls).
- Demo preparation and "Demo ready" screens. The preparation step is real: it seeds the demo store, with no fake progress bar.
- Persistent `Demo environment · fictional records · no real transactions` badge.
- Manager tour extended to spotlight real dashboard widgets: KPIs, action centre, quick create, collections chart, project switcher.
- Clarity pass on the shell and dashboard within Limestone & Evergreen:
  - lighter page tone;
  - quick-action tiles;
  - bolder figures;
  - status always with an icon and label;
  - raised centre action on the phone bar;
  - "More" as a page.
- **Root-cause fix for the forms keyboard test.**

**B. Workspace setup simulation**
- Validated wizard with Back, Next and Skip; entries survive a language change.
- Every step is labelled as simulated, and nothing claims an email was sent.

**C. Sales workspace and a linked practice journey**
- Sales home, lead list (search and filters in the URL), lead workspace, and unit quick view.
- Create Lead → appears in the list, search and timeline.
- Sales tour.

**D. Customer app home**
- Mobile-first property home, instalments and receipts.
- Simulated proof upload ending at "Awaiting verification".
- Construction updates, maintenance and visitor actions.
- Customer tour.

**E. QA report**
- Route/function matrix marking each item working / mock working / planned.
- Videos and the screen-reader checklist (manual testing still required).
- Bundle-split plan.

## 4. Rules carried forward
- Fictional data only. No real payments, gateways or accounting changes.
- `main` stays untouched.
- No mass placeholder screens. "Route resolves" does not mean "screen built".
- Zero axe violations does not mean full WCAG conformance.
- No copying of Nizam branding, colours, images, copy or exact layouts.
