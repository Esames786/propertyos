# Stage 1.5R: first-use and functional UX overhaul (milestone 1)

**What this milestone is**
- The bounded milestone the owner asked for after withholding approval of Stage 1.5 step 1.
- **Scope:** a complete first-time-user experience and at least one connected working CRM workflow, plus a real customer portal home.
- **Not done:** Stage 2 and the remaining reference screens have **not** been started.

**Branch.** `feature/stage-1.5-premium-design`, milestone commit `11de1a8` (report follow-up after it). `main` is untouched.

**Inputs**
- The owner's review pack `PropertyOS_vs_Nizam_Claude_Review.zip`.
- A read-only walkthrough of the Nizam app (`docs/design/reference/NIZAM_WALKTHROUGH.md`).
- The gap matrix and plan in `STAGE_1_5R_PLAN.md`.

## 1. What you can try now

| Where | What happens |
|---|---|
| `http://localhost:5173/backoffice` (first visit) | **Get started** with two equal choices: *Explore a live demo* or *Set up my developer workspace* |
| Explore a live demo | Choose Manager, Sales or Finance → **real preparation**: sign-in plus fetching the start page's data, ticking as each request resolves, with no fake progress bar → **Demo ready** (what's inside, things to try) → **Start the guided tour** or **Explore on my own** |
| Set up my workspace | A six-step **validated wizard**: account → verify (simulated, code 246810 shown) → organisation → first project (skippable) → team (skippable) → review with Edit → done. It survives Back and a language switch, never stores the password, and says plainly that nothing was created or sent |
| Guided tour | **Spotlights the real dashboard widgets**: navigation, project switcher, KPI cards, quick actions, action centre, collections chart (finance roles), search, quick create, help. The rest is dimmed, the target is scrolled to the centre and the explanation is anchored beside it. Controls: Back, Next, Skip, **Pause** (with a **Resume** chip) and Replay from Help. Progress is saved per user + tenant + app + tour version |
| Sales (sidebar, or the phone bar) | **Sales home**: four figures, quick actions, follow-ups due (call or WhatsApp, mark done), upcoming site visits (confirm, mark visited), pipeline by stage, recent leads |
| New lead (header, quick action, centre "+", Quick create) | The lead appears **at once** on Sales home and in the lead list (marked "New"), in global search, and with its own timeline |
| Lead workspace | Contact, a **timeline** (calls, WhatsApp, notes, visits, stage changes, holds), visits, **matching units → quick view → hold for 48 h**, set follow-up, change stage. "Back" restores the list's search, stage, sort and page |
| Sales tour | Offered on the first visit to Sales. Its guided step finishes **when you actually create a lead**, then spotlights the new lead |
| Phone | Floating top bar, floating bottom bar with a **raised centre "+"**, and a **More** page with every area as icon cards plus **View the demo as** (switch role) and **Reset demo data** |
| `http://localhost:5174/customer/portal` | **Customer home**: property photo, unit and owner chips, the **Next instalment** card (Pay online / Upload proof), action needed, paid / outstanding / construction / documents, quick actions, receipts, construction progress. Plus payments, proof upload, receipt, construction updates, services (maintenance requests, visitor passes with a gate code) and documents. It has its own guided tour |

## 2. Implemented vs simulated vs planned (honest list)
The full click-by-click matrix is in **`FLOW_MATRIX.md`**.

**Working.** Every screen above, its navigation, its filters in the URL, all three tours and the role scoping.

**Mock working.** The action really changes the demo session and every connected screen updates:
- new lead, call/WhatsApp **log**, note, follow-up set or done, stage change;
- site visit book, confirm and complete; unit hold and release;
- proof upload (→ **Awaiting verification**, never Paid); maintenance request; visitor pass.
- Changes are kept in this browser tab (`sessionStorage`); **More → Reset demo data** clears them.

**Simulated, and labelled on screen**
- the workspace wizard, including verification;
- the phone call and WhatsApp themselves (nothing is dialled or sent);
- "Pay online" (no gateway);
- document previews.

**Planned (not built here)**
- Projects, Customers, Finance, Procurement, HR, Operations, Residents, Reports, Administration and inventory screens.
- Real authentication and tenancy; email or SMS; payments; accounting.
- In the screen register: **24 built, 8 partial, 289 planned of 321**. Route resolving does not mean built.

## 3. Evidence

| Kind | Where |
|---|---|
| Screenshots (158): EN + UR × desktop 1440 + phone 390 | `screenshots/`. Covers the entry flow (sign-in "before", Get started, role, preparing, ready, wizard, errors), every tour step at both sizes (44), the Sales tour guided step, the portal tour, Sales home, lead list, lead overview / activity, unit quick view, contact sheet, New lead drawer, dashboard, More, the centre "+", and portal home / payments / upload / **awaiting verification** / services / construction / documents / receipt |
| Before/after sheets (8) | `before-after/`: Sales home (your P04 vs now), customer portal (your P06 vs now), dashboard EN / UR / phone, entry, tour, phone navigation |
| Videos | `video/first-run-and-crm-desktop-en.mp4` (63 s): first visit → demo → 10-step tour → Sales → new lead → call logged → note → unit hold. `video/first-run-and-new-lead-phone-ur.mp4` (41 s): Urdu phone first run → tour → centre "+" → new lead. `video/customer-portal-phone-en.mp4` (19 s): home → upload proof → awaiting verification → services |
| Design notes | `docs/design/stage-1.5R/DESIGN_SYSTEM_V3.md` (what changed and why); `docs/design/reference/NIZAM_WALKTHROUGH.md` (what we learned, what we did not copy) |

## 4. Tests and accessibility (details in `test-results.md`)
- **Typecheck and lint:** clean. This includes the RTL logical-CSS guard and i18n parity: 1,673 keys in each language.
- **Unit tests:** 303 / 303 (was 202).
- **End-to-end:** **134 / 134** on **three consecutive full runs** against production builds, with no retries (was 102).
- **Accessibility:** **262 axe scans, 7,057 rule passes, 0 violations** (was 142 scans). These cover every new screen and overlay in English and Urdu at desktop and phone.
- **The intermittent keyboard test is fixed at its root**, not retried:
  - The cause was a focus-restoration race after a popup closed, combined with a loose test matcher.
  - It reproduced at 1 failure in 24 under heavy load and passed 40 / 40 after the fix.
  - The full analysis is in `test-results.md`.
- **Manual screen-reader testing is still open.** Zero axe violations is not a WCAG conformance claim.

## 5. Design direction (please confirm)
- **What I took from Nizam:** the clarity and feel you asked for:
  - white cards with coloured icon tiles; solid quick-action tiles;
  - big, bold, colour-coded money, always with a label;
  - record cards with call/WhatsApp; filter pills;
  - a floating phone top bar and a bottom bar with a raised centre action, plus a More page;
  - richer motion (staggered entrances, hover lift, sliding pills, page settle, pop-in), all off under reduced motion.
- **What I did not take:** Nizam's purple, logo, illustrations, copy or exact layouts, as your pack required.
  - The action colour stays **evergreen**, with property photography and the serif reserved for brand moments.
  - If you want a different primary colour, it is a token change.

## 6. Known limitations and trade-offs
- **Bundle growth.**
  - Backoffice shared chunk: 1.34 MB (397 kB gzip), up from 1.26 MB.
  - Customer app: 1.58 MB initial (462 kB gzip), up from 0.88 MB, because it now carries the portal fixtures, both dictionaries and motion. Portal pages are code-split.
  - Plan for Stage 6: on-demand dictionaries, fixtures behind a dynamic import, a vendor chunk.
- **Clocks.** Fixture times are fixed at 26 Oct 2026, 09:00 (deterministic screenshots). Things you create use the real clock, so "today" in fixtures and "just now" in your actions can look a day apart.
- **No real workspace.** The workspace wizard does not create a separate tenant: "Open the demo workspace" shows the Larkspur sample data, and says so.
- **Browser coverage.** Chromium only; WebKit and Firefox come in Stage 6.
- **Untracked review-pack files.** The pack's two files in the repository root (`PropertyOS_vs_Nizam_Claude_Review.zip`, `Nizam_Reference_Visual_Index.jpg`) and the Nizam walkthrough captures (`docs/design/reference/nizam/`, git-ignored because they show an account phone number) are **not committed**.

## 7. Awaiting your review
Please review the first-time-user experience, the CRM workflow and the portal. I will not start Stage 2 or the remaining reference screens until you approve this milestone.
