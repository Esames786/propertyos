# Stage 1.5R milestone 1: review handoff

**For:** the project reviewer (owner / GPT), to approve or correct before anything else is built.
**Date:** 27 Oct 2026.
**Status:** milestone 1 delivered and pushed. **Stage 2 and the remaining reference screens have not been started**; they wait for your approval.

## 1. Where it is

- **Repository:** https://github.com/Esames786/propertyos
- **Branch:** `feature/stage-1.5-premium-design` (`main` is untouched; nothing merged).
- **Commits:**
  - `11de1a8`: Stage 1.5R milestone 1 (first-use experience, Sales CRM workflow, customer portal).
  - `accce5b` and later: report and documentation only.
- **Size of the change since Stage 1.5 step 1 (`81dbbfa`):** 326 files, about 15,500 lines added (including tests, docs and evidence).
- **Run it locally:** Node 20, `npm install`, `npm run dev`, then:
  - backoffice: http://localhost:5173/backoffice (use a private window to see the first-visit experience);
  - customer portal: http://localhost:5174/customer/portal.

**Documents in the repository** (folder `docs/status/ui-stage-1.5R/`):

| File | What it holds |
|---|---|
| `STAGE_1_5R_REPORT.md` | The milestone report |
| `FLOW_MATRIX.md` | 36 calls to action: expected vs observed, status (working / mock working / simulated / planned) and the test that proves each |
| `test-results.md` | Every check, the flaky-test root cause, bundle sizes |
| `STAGE_1_5R_PLAN.md` | The gap matrix the work was planned from |
| `screenshots/` | 158 images, English + Urdu × desktop 1440 px + phone 390 px |
| `before-after/` | 8 side-by-side sheets (Sales home and portal against the owner's P04 / P06, dashboard EN / UR / phone, entry, tour, phone navigation) |
| `video/` | 3 recordings (see section 5) |
| `docs/design/stage-1.5R/DESIGN_SYSTEM_V3.md` | What changed visually and why |
| `docs/design/reference/NIZAM_WALKTHROUGH.md` | What was learned from Nizam and what was deliberately not copied |

## 2. Your requirements, item by item

| # | Requirement (from the Stage 1.5R message) | Delivered | Status |
|---|---|---|---|
| 1 | Get Started with **Explore Demo** and **Set Up My Developer Workspace** | A Get started page with the two choices as equals, plus language and accessibility controls. Deep links are kept and resumed after entry | Done |
| 2 | Complete EN/UR **signup and organisation setup** prototype | Six-step validated wizard: account → verify → organisation → first project (skippable) → team (skippable) → review with Edit → done. Entries survive Back and a language switch; the password is never stored. Verification is simulated (the code 246810 is shown on screen) and the final screen states that nothing was created or sent | Done (labelled simulation) |
| 3 | A **useful fictional developer demo** | Choose Manager, Sales or Finance. Preparation is real: it signs in and prefetches that role's start page, ticking each item as its request resolves (no fake progress bar). "Demo ready" lists what is inside and what to try, then offers **Start the guided tour** or **Explore on my own** | Done |
| 4 | A **genuine spotlight walkthrough** | Highlights the real widgets with the rest dimmed, scrolls the target to the centre, anchors the explanation beside it. Back, Next, Skip, **Pause → Resume chip**, Replay from Help. Progress saved per user + tenant + app + tour version. Works in English and Urdu (mirrored), on desktop and phone (phone-specific anchors), with keyboard only and with reduced motion. Three tours: essentials (10 steps for manager, 9 for sales), Sales (8 steps; its guided step completes only when you actually create a lead), customer portal (8 steps) | Done; manual screen-reader pass still open |
| 5 | A **functional Sales Home** with interconnected CRM screens and working mock actions | Sales home (figures, quick actions, follow-ups due, upcoming site visits, pipeline by stage, recent leads) → lead list (search, stage, sort and page in the URL, restored after visiting a lead) → lead workspace (overview, activity timeline, visits, matching units) → unit quick view → **48-hour hold**. A new lead appears at once on Sales home, in the list, in global search and in its own timeline. Call / WhatsApp / note / follow-up / stage change / visit book-confirm-complete all write to the timeline and every connected screen | Done (mock working) |
| 6 | A **premium customer portal home**, mobile and desktop | Property photo, unit and owner, **Next instalment** card (Pay online / Upload proof), action needed, paid / outstanding / construction / documents, quick actions, receipts, construction progress. Plus payments, proof upload, receipt, construction updates, maintenance requests, visitor passes with a gate code, documents | Done |
| 7 | Proper navigation, contextual actions, animations, responsiveness, accessibility | Role-aware dashboard quick actions (no dead ends). Phone: floating top bar, floating bottom bar with a **raised centre "+"**, and a **More** page (all areas as icon cards, switch demo role, reset demo data). Motion: staggered entrances, hover lift, sliding filter pills, page settle, pop-in; all off under reduced motion. Reflow tested at 320 px and 200 % zoom | Done |

## 3. Your constraints

| Constraint | How it was kept |
|---|---|
| Preserve the architecture, reusable components and tests | Same monorepo, packages and patterns. The existing tour engine was **extended** (step art, pause/resume, mobile anchors, completion events), not rebuilt. All earlier tests still run, updated where the UI changed |
| Keep Limestone & Evergreen where appropriate | Evergreen stays the action colour; the serif and property photography are kept for brand moments. The page tone was lightened and a 9-hue icon-tile palette was added (all colour pairs contrast-tested). See section 6 for the open design question |
| Do not create 321 placeholder screens | 24 screens are built, 8 are partial (aliases to a built screen), 289 remain planned. The planned addresses show one honest "planned" page; "the route resolves" is not counted as built |
| No production payments, real accounting or live backend | None. Every action goes through an in-browser mock API over fictional fixtures. Proof upload ends at **Awaiting verification** and is never marked Paid. "Pay online" is a labelled simulation with no gateway |
| Do not merge into `main` | Not merged |
| Show the full first-time experience and one connected CRM workflow before more screens | Both are shown in the videos and covered by end-to-end tests |
| Screenshots, videos, passing tests, accessibility evidence, honest implemented-vs-simulated list | Sections 4 and 5, and `FLOW_MATRIX.md` |
| Stage 2 unauthorised until approved | Not started |
| Fix the intermittent forms test at its root (owner pack) | Done; see section 4 |
| Track the bundle (owner pack) | Tracked; it grew (section 7) |
| Do not clone Nizam (owner pack) | No Nizam branding, logo, purple, illustrations, copy, code or images are used |

## 4. Tests and accessibility

All results are from production builds (`vite build` + `vite preview`), Chromium, with retries **off**.

| Check | Result | Before (Stage 1.5) |
|---|---|---|
| Typecheck and lint (including the RTL logical-CSS guard and i18n parity) | Clean; 13 namespaces, 1,673 keys in each language | 10 namespaces, 799 keys |
| Unit tests | **303 / 303** | 202 |
| End-to-end | **134 / 134 on three consecutive full runs** | 102 |
| Automated accessibility (axe) | **262 scans, 7,057 rule passes, 0 violations**, covering every new screen and overlay in English and Urdu at desktop and phone | 142 scans |
| Production build | Both apps build | — |

**The intermittent keyboard test was fixed at its cause, not retried.**
- It reproduced at 1 failure in 24 under heavy load (6 workers, 4× CPU throttle).
- The trace showed that React Aria returns focus to a popup's trigger one animation frame after Escape. The test's next Tab arrived inside that frame while focus was on the page body, Tab restarted from the top, and a loose matcher then landed on the Email field instead of a contact-method radio.
- It was a race in the test, not a product defect: a person cannot press Tab within one frame.
- Fix: wait until the popup is gone and focus is back on a control, and match radio buttons only. Result: 40 / 40 under the same load, then three full suites at 134 / 134.

**Other defects found and fixed during this work:** a command-palette crash (duplicate destination), lead-list filters overwriting each other, practice leads not refreshing lists, a definition-list error on lead cards, 320 px overflow in the lead workspace, drawers that scrolled but were not keyboard-scrollable, a dev-mode image-preview error, and a resident name that differed between the two apps.

**Not automated, still required**
- Manual screen-reader testing (NVDA, VoiceOver, TalkBack). Zero axe violations is **not** a claim of WCAG 2.2 AA conformance.
- WebKit and Firefox runs (planned for Stage 6; this run is Chromium only).

## 5. Evidence

- **Videos** (`video/`):
  - `first-run-and-crm-desktop-en.mp4` (63 s): first visit → demo → 10-step tour → Sales → new lead → call logged → note → unit hold.
  - `first-run-and-new-lead-phone-ur.mp4` (41 s): Urdu, phone, first run → tour → centre "+" → new lead.
  - `customer-portal-phone-en.mp4` (19 s): home → upload proof → Awaiting verification → services.
- **Screenshots** (`screenshots/`, 158): the entry flow (Get started, role choice, preparing, ready, every wizard step and its errors), **every tour step at desktop and phone (44)**, the Sales tour's guided step, the portal tour, Sales home, lead list, lead overview and activity, unit quick view, contact sheet, New lead drawer, dashboard, More, the centre "+", and portal home / payments / upload / awaiting verification / services / construction / documents / receipt.
- **Tour placement** is also verified automatically at 1440, 390 and 320 px: every step must frame its real control.

## 6. Design direction: please decide

- The owner told us directly that they **love Nizam's design** and want it matched "with more animation and placements".
- The owner's review pack also says **do not clone Nizam** and keep Limestone & Evergreen unless a revision is approved.
- **What was done to satisfy both:**
  - Took Nizam's clarity and placement: white cards with coloured icon tiles, solid quick-action tiles, big bold colour-coded money with labels, record cards with call/WhatsApp buttons, filter pills, a floating phone top bar, a bottom bar with a raised centre action, and a More page.
  - Added more motion than Nizam.
  - Kept our own identity: evergreen as the action colour, our serif, property photography; none of Nizam's assets, copy or exact layouts.
- **Decision needed:** is this the right balance? If the owner wants a different primary colour, it is a single token change; I recommend keeping a distinct identity for legal and brand reasons.

## 7. Known limitations

- **Bundle growth.**
  - Backoffice shared chunk: 1,342 kB (397 kB gzip), up from 1,258 kB (377 kB gzip).
  - Customer app first load: 1,581 kB (462 kB gzip), up from 882 kB (260 kB gzip). It now carries portal fixtures, both languages' dictionaries and the motion library; portal pages themselves are code-split.
  - Planned for Stage 6: load each language on demand, put fixtures behind a dynamic import (they disappear once a real API exists), split a vendor chunk.
- **Demo data lives in the browser tab** (`sessionStorage`). It survives a reload, ends when the tab closes, and More → Reset demo data clears it.
- **Mixed clocks.** Fixtures are fixed at 26 Oct 2026, 09:00 so screenshots are deterministic; things you create use the real clock, so they can look a day apart.
- **The workspace wizard creates no tenant.** "Open the demo workspace" shows the fictional Larkspur sample data and says so.
- **Not committed on purpose:** the owner's review pack files in the repository root, and the Nizam walkthrough captures (`docs/design/reference/nizam/`, git-ignored because they show a real account's phone number).

## 8. Implemented vs simulated vs planned (summary of `FLOW_MATRIX.md`)

- **Working:** every screen listed in section 2, navigation, URL filters, the three tours, role scoping.
- **Mock working** (really changes the demo session; all connected screens update): new lead; call/WhatsApp outcome logging; notes; follow-up set and done; stage change; site visit book / confirm / complete; unit hold and release; proof upload (→ Awaiting verification); maintenance request; visitor pass; isolated practice leads.
- **Simulated and labelled on screen:** the workspace wizard and its verification code; the phone call and WhatsApp themselves (nothing is dialled or sent); Pay online; document previews.
- **Planned (not built):**
  - modules: Projects, Customers, Finance, Procurement, HR, Operations, Residents, Reports, Administration;
  - inventory screens (unit matrix and others);
  - real authentication and tenancy, email or SMS, payment gateways, accounting.
  - Quick create's Hold a unit / Receive payment / New expense are visible but disabled with "Available from Stage 2".

## 9. Technical notes for the next stage

- **Monorepo:** npm workspaces.
  - Apps: `apps/backoffice` and `apps/customer-web` (Vite, React 19, React Router 7).
  - Packages: `tokens`, `i18n`, `contracts`, `fixtures`, `ui`, `assets`.
  - Stack: Tailwind v4 tokens, React Aria Components, TanStack Query, motion, react-hook-form + zod, i18next.
- **Mock API.** All screens call typed endpoints (`packages/contracts`) through a mock transport (`packages/fixtures`). Handlers are grouped as core, CRM, portal and workspace. A **DemoStore** layers session changes over immutable fixtures. Replacing the transport with a real API later should not require screen rewrites.
- **New contracts:** CRM (pipeline, leads, visits, follow-ups, units, sales summary), workspace setup, portal, demo overview.
- **Tours** are data (`packages/ui/src/tours/`). Each step names a target, an optional phone target, a route, header art, a fallback, and optional completion / suspend / resume events.

## 10. What I need from you

1. **Approve milestone 1, or list the changes you want.**
2. **The design decision** in section 6.
3. **The next milestone's scope.** My suggestion, not started: inventory (unit matrix) → booking → payment plan, because the lead → unit hold flow already leads into it. I will build nothing new until you choose.
4. **Who runs the manual screen-reader pass,** or whether I should prepare a scripted checklist session for it.
