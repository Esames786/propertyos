# Stage 1.5R: route and function matrix

**Status key**
- **Working:** the screen and logic are real; the data is fictional.
- **Mock working:** the action really changes the demo session through the mock API, and every connected screen shows the change.
- **Simulated:** clearly labelled on screen; nothing real happens.
- **Planned:** the register page exists and says it is planned.

**Persistence.** Demo changes live in `sessionStorage` (`demo:store:v1`). They survive a reload, are discarded when the tab closes, and More → **Reset demo data** clears them. Nothing is ever sent to a customer, bank or gateway.

**Evidence.** The test that proves each row is in the last column (`tests/e2e/…`).

## Entry and onboarding (backoffice)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 1 | First visit to `/backoffice` with no identity | Get started page with two equal choices | Get started; the deep link is kept in `?next=` | Working | `get-started.spec` 1 |
| 2 | Explore a live demo → choose a role | Real preparation, then "Demo ready" | Signs in as the role; the checklist ticks as each prefetch resolves; counts come from `/demo/overview` | Mock working | `get-started.spec` 2 |
| 3 | Demo ready → Start the guided tour | Tour on the real dashboard | Dashboard opens; spotlight tour step 1 | Working | `get-started.spec` 2 |
| 4 | Demo ready → Explore on my own | Start page, no welcome dialog, decision remembered | As expected | Working | `get-started.spec` 3 |
| 5 | Set up my workspace → wizard | Six steps with validation, Back, Skip, Review and Edit | As expected; entries survive Back and a language switch; the password is never stored | Simulated (labelled) | `get-started.spec` 5–8 |
| 6 | Wizard → Verify code | No email or SMS; the code is shown | Wrong code shows an error; 246810 continues | Simulated (labelled) | `get-started.spec` 7 |
| 7 | Wizard → Done → Open the demo workspace | Signs in as manager and starts the tour | As expected; the screen says nothing was provisioned | Simulated (labelled) | `get-started.spec` 7 |
| 8 | Returning visitor / sign-out | Demo sign-in with a link to Get started | `/backoffice/sign-in?next=…` | Working | `permissions.spec` 4 |

## Guided tour

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 9 | Essentials tour (`GLOBAL-TOUR-001` v2) | Spotlights real controls and widgets, dims the rest, anchors the card, scrolls the target into view | 10 steps (manager) / 9 (sales). The spotlight frames the nav, project switcher, KPIs, quick actions, action centre, collections chart, search, quick create and help | Working | `onboarding.spec` 2+4 (1440, 390, 320 px) |
| 10 | Back / Next / Skip / **Pause** / **Resume** / Replay | Each works; progress is saved per user + tenant + app + version | Pause shows a "Resume" chip at the same step; Help → Take a tour replays | Working | `onboarding.spec` 6, 7, 9 |
| 11 | Tour in Urdu, on a phone, keyboard only, reduced motion | Same step; mirrored; phone anchors; focus managed | As expected | Working | `onboarding.spec` 3, 9, 11; `a11y.spec` |
| 12 | Sales module tour (`CRM-TOUR-001`) | Offered on first visit; the guided step completes by creating a lead | The New lead step advances when the lead is saved, and the next step spotlights it in the list | Working | `crm.spec` 9 |
| 13 | Customer tour (`PORTAL-TOUR-001`) | Spotlights hero → instalment → pay → … → help | 8 steps at both sizes | Working | `portal.spec` 7 |

## Sales and CRM (connected workflow)

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 14 | Sidebar / bottom bar → Sales | Sales home with figures, quick actions, follow-ups, visits, pipeline, recent leads | As expected, scoped by role and project | Working | `crm.spec` 1 |
| 15 | New lead (header, quick action, centre "+", Quick create) | Drawer → save → lead on top of Sales home and the list, findable in search, with its own timeline | As expected; "New" marker | Mock working | `crm.spec` 2, 7 |
| 16 | Lead card → Call / WhatsApp | Nothing is dialled or sent; the outcome is logged | Labelled sheet → timeline entry; a new lead moves to Contacted | Simulated (call) + mock working (log) | `crm.spec` 2 |
| 17 | Lead → Add note | Note appears in the timeline | As expected | Mock working | `crm.spec` 2 |
| 18 | Lead → Schedule visit | Drawer with the lead chosen → visit on the Visits tab, Sales home and the timeline | As expected | Mock working | `crm.spec` 2 |
| 19 | Lead → Set follow-up / Change stage | Saved; timeline and lists update | As expected | Mock working | manual + screenshots |
| 20 | Lead → Matching units → Quick view → Hold (48 h) | Unit shows Held for this lead; timeline entry; release possible | As expected; session-only hold | Mock working | `crm.spec` 2 |
| 21 | Follow-up → Mark done | Leaves the list; toast and announcement | As expected | Mock working | `crm.spec` 4 |
| 22 | Visit → Confirm / Mark visited | Status changes; timeline entry | As expected | Mock working | screenshots |
| 23 | Pipeline stage / KPI card | Opens the filtered lead list | As expected | Working | `crm.spec` 5 |
| 24 | Lead list search / stage / sort / page | All in the URL; restored after visiting a lead and after reload | As expected | Working | `crm.spec` 3 |
| 25 | Practice lead (training) | Training store only, labelled "Practice", listed only in practice mode, no live mutation | As expected | Mock working (isolated) | `crm.spec` 6; `onboarding.spec` 12 |
| 26 | Quick create → Hold a unit / Receive payment / New expense | Disabled with a reason | "Available from Stage 2" | Planned | `permissions.spec` 1 |

## Dashboard and shell

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 27 | Dashboard quick actions (role-aware) | Every tile reaches a working screen, drawer, search, tour or practice | Manager 8 tiles, finance 3; no planned dead ends | Working | `dashboard.spec` quick actions |
| 28 | Action centre follow-up row | Opens the real lead workspace | As expected (was a planned page in Stage 1.5) | Working | `dashboard.spec` |
| 29 | Phone bottom bar → More | Every area as icon cards; switch demo role; settings; reset demo | As expected | Working | `shell.spec` |
| 30 | Phone centre "+" | Quick create menu | As expected | Working | `shell.spec`, `crm.spec` 7 |

## Customer portal

| # | Call to action | Expected | Observed | Status | Proof |
|---|---|---|---|---|---|
| 31 | Portal home | Property hero, next instalment, metrics, quick actions, receipts, construction | As expected | Working | `portal.spec` 1 |
| 32 | Upload proof | Ends at **Awaiting verification**; paid total unchanged; no receipt | As expected on payments and home | Mock working | `portal.spec` 2 |
| 33 | Pay online (centre action) | Labelled simulation, no gateway, ends unpaid | As expected | Simulated (labelled) | `portal.spec` 3 |
| 34 | Maintenance request / visitor pass | Appears at the top of the list; the pass shows a gate code | As expected | Mock working | `portal.spec` 4, 5 |
| 35 | Receipt / documents / construction | Printable receipt labelled prototype; labelled document preview; timeline | As expected | Working (display) | `portal.spec`, `a11y.spec` |
| 36 | Other portal register screens | Alias to the screen that serves them, or a planned page | `pay-online-mock`, `payment-history`, `maintenance-list`, `create-maintenance`, `visitor-passes` and `create-visitor-pass` redirect; the rest are planned | Partial / Planned | `register.spec` |

## Not built in this milestone (planned)
- Projects, Customers, Finance, Procurement, HR, Operations, Residents, Reports and Administration modules.
- Unit matrix and other inventory screens.
- Real authentication, a real tenant, email or SMS.
- Payment gateways and any accounting posting.

Their register addresses open intentional planned pages; 289 of 321 register screens are still planned.
