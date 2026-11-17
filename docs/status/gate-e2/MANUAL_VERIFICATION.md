# Gate E.2 — manual verification (projects and inventory, provisional)

Build: production preview of branch `feature/gate-e2-projects-inventory` on `http://localhost:7373/backoffice` (E2E_PORT_OFFSET 2200).
Sign in with the demo identities below (Sign in → pick a person). Everything is fictional and lives in this browser tab's demo session; **Reset demo** discards it.

| Who | Role in this demo | What they may do in E.2 |
|---|---|---|
| Nadia Rahman | Larkspur administration (all projects) | Read every screen; hold a unit for a lead; no setup or storage permission |
| Bilal Ahmed | Sales (Larkspur Heights only) | Read Heights only; hold and release his own holds |
| Farah Javed | Finance | No inventory or project figures (access outcome) |
| Hina Baig | Projects and inventory officer (**provisional**, E-06/E-07) | Prepare projects (maker), allocate and release storage |
| Kashan Lodhi | Projects director (**provisional**) | Approve or return a project someone else prepared (checker) |
| Zain Abbasi | Crescent Bay manager | Towers inventory only; Plaza is "not in your plan" |

## 1. Projects list (PRJ-001) — `/backoffice/prj/projects-list`
1. As Nadia: two cards (Larkspur Heights, Larkspur Gardens). Each shows a bar plus the numbers in words: Available, Held, Reserved, Booked, Not for sale.
2. Click **Plots** → only Gardens. Type "Lahore" in the search → only Heights. Clear.
3. Click the **Available now** tile → the unit matrix opens filtered to available units.
4. As Bilal: one card only; the word "Gardens" appears nowhere; totals are Heights' (336 units).
5. As Zain (Crescent Bay): the Plaza card says "Inventory isn't in your plan for this site" (no zeros).

## 2. Project 360 (PRJ-002) — open a card's **Open Project 360**
1. Overview: tiles, facts (legal entity "Configured by administration"), tower rows with bars that open the matrix.
2. Tabs: Overview, Leads, Units, Documents, Activity are live. Bookings says "Planned · E.5"; Construction "E.10"; Documents shows the honest "no documents yet — E.13" panel.
3. As Bilal open `…/project-360-workspace?record=prj_gardens` → "We couldn't find that record".
4. As Hina (no lead permission) the Leads tab says "Not for your role".

## 3. Unit matrix and quick view (INV-001, INV-002) — `/backoffice/inv/unit-matrix`
1. Grid per tower, top floor first. Each cell shows the unit number and its status **in words**, with a pattern (held hatched, reserved dotted).
2. Keyboard: Tab into a tower grid (one stop), arrows move, Home/End go to the ends of the floor, Enter opens the quick view; Escape closes it and focus returns.
3. Filters: availability pills; **More filters** (tower, floor, type, delivery, price and area ranges); everything is in the address (copy the URL into a new tab).
4. **List** view shows the same units; at a phone width the list is the only view.
5. Quick view: "Status in three parts" (sales status, delivery, occupancy), list price (illustrative), hold, storage, history.
6. Register address: `/backoffice/inv/unit-quick-view?record=unt_lg_p2_010` opens Gardens with the drawer.

## 4. Holds and live availability (INV-008) — `/backoffice/inv/live-availability`
1. As Bilal: open an available Heights unit, choose a lead, **Hold for 48 hours**. A toast confirms; the drawer shows "Held until …", "You placed this hold".
2. Live availability lists the hold with "47 h 59 min left"; totals moved one unit from Available to Held.
3. As Nadia: the same unit shows "Held by Bilal Ahmed" and **no Release** button.
4. Expiry: change the computer clock 49 hours ahead (or wait), press **Refresh now**: the unit is available again; the hold is under "Expired holds (history)"; the unit's history still shows "held".
5. Seeded held/reserved/booked units are labelled **demo seed**; their quick view says there is no hold record.

## 5. Storage (INV-010) — `/backoffice/inv/storage-inventory`
1. As Hina: **Allocate** LH-ST-A01 → choose a booked Heights unit (only Heights units are offered) → note → Allocate. The card says "Allocated to … by Hina Baig".
2. **Release** → reason (5–200 characters) → the locker is available; **History (2)** shows both entries.
3. As Nadia: no Allocate/Release buttons ("needs the storage permission").
4. LH-ST-B04 is out of service (demo seed) and cannot be allocated.

## 6. Project setup (PRJ-003) — `/backoffice/prj/project-setup`
1. As Hina: **Start a new project**. Try name "X" and code "TOOLONG" → both fields are marked before anything is sent. Code "LH" → "already used".
2. Basics → Site and legal entity (entity fixed by the site) → Structure (towers with floors and units per floor; the planned total updates) → Review → **Submit for approval**. Hina sees "Waiting for approval by someone other than Hina Baig" and no approve button.
3. As Kashan: open it → **Approve and activate** (or **Return for changes** with a reason). The project then appears in the projects list as Active with no units.
4. As Nadia: the setup page explains that setup needs a setup role.

## 7. Languages, sizes, themes
- Switch to Urdu (اردو): every E.2 screen is right to left; references, prices and areas stay left to right.
- Preferences → text size 200 % at a 320 px window: projects, matrix (list), availability, storage and the quick view reflow with nothing cut off.
- Preferences → dark theme with high contrast: all E.2 screens.

## Still open (needs a person)
- NVDA / VoiceOver walk of the grid (role grid, row headers, cell names) and of the quick view.
- Real phones (Android Chrome, iOS Safari) at 200 % text.
- No WCAG conformance claim is made.
