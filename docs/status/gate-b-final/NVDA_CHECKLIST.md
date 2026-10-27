# Manual NVDA verification — Gate B final

**Status: not yet performed.** Automated checks (axe-core in every E2E accessibility test, keyboard
paths in Playwright, live-region assertions) cover what a machine can check. A real screen-reader
pass needs a person running NVDA. This checklist is what that person should run; record the
results in the table at the end and attach a short recording if possible.

## Set-up

- Windows 10/11, NVDA 2024.x or later, Firefox and Chrome (latest), speech viewer on.
- Production builds: `npm run build -w @repo/backoffice && npm run preview -w @repo/backoffice`
  (port 5173) and the same for `@repo/platform-hq` (port 5175).
- Run each flow in **English** and again in **Urdu** (header language toggle). In Urdu, confirm
  that NVDA switches voice or at least reads Urdu text in order, and that numbers, money and
  references (`CB-A-0101`, `cp-2026.11-2`) are read left to right.
- Use NVDA browse mode (H, Tab, F, T, K, D) and focus mode for forms.

## Backoffice (tenant workspace)

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| B1 | Sign in grouped by organisation | `/backoffice/sign-in`; press H, then Tab through the cards | Each organisation is a heading; each card reads name, role, then the description (e.g. "Two sites · Towers: sales and construction · Plaza: maintenance only"). |
| B2 | Site refusal | As Zain Abbasi (Crescent Bay), open `/backoffice/inv/unit-360-workspace?record=unt_cb_p_0101` | Page title and H1 read "Not licensed for this site"; the body names Sales inventory and Crescent Bay Developers; "Go to start" is reachable. Nothing of the unit is read. |
| B3 | Missing site | `?record=unt_cb_import_001` | H1 "This record has no site"; explanation read in full. |
| B4 | Another tenant's record | `/backoffice/crm/lead-360-workspace?record=led_0001` | H1 "We couldn't find that record" (existence not confirmed). |
| B5 | Project context | Header project switcher → Crescent Bay Plaza | The change is announced ("Project changed to Crescent Bay Plaza"); the main navigation no longer offers Projects. |
| B6 | My access | `/backoffice/global/my-access` | H1, intro, person facts as a description list, each area as a list item with its sites ("Only at Crescent Bay Towers") and a labelled list "What you can do". |
| B7 | Suspended workspace | As Haris Mirza (Cedar Hills) open Home | The banner is read once as a status ("Cedar Hills Co-operative (Demo)'s workspace is suspended…"), then the H1 greeting; quick actions read as links. |
| B8 | Invoice history | Quick action "Invoices" | H1 "Invoices", "Read-only" badge, totals; the search field and the "Payment status" radio group (arrow keys move, choice announced); each invoice row reads reference, name, unit, due date, amount, paid and status. |
| B9 | Paused areas | `/backoffice/res/resident-dashboard` | H1 "This workspace is suspended". |
| B10 | Honest maintenance home | As Saima Akram (Shalimar) open Home | "Maintenance work still to come" heading; each planned item reads its name and "Planned · Gate D"; none is announced as a link or button. |
| B11 | Contextual labels | As Adnan Malik open the main navigation | "People & Contacts" (not "Customers"); as Nadia Rahman: "Customers & Buyers". |
| B12 | Prototype tools | Preferences → Guided tours tab → "Show the design system lab…" switch | Announced as a switch with its state; after turning on, the lab appears in the navigation. |

## Platform HQ

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| H1 | Policy draft | As Hamza Qureshi: `/hq/policies` → "Prepare a new version" | Focus moves into the draft; each limit is a labelled number field; "Applies from" date field reads its segments; "Reason" field reads its description. |
| H2 | Refused submit | Submit without a reason | The error summary is announced (role alert: "The server did not accept this"), with the field problem readable in the list. |
| H3 | Approval | Switch to Ayesha Siddiqui; `/hq/policies` | The pending version reads label, status, effective date, author; "What changed" is a button with expanded state; the changes table has row headers (setting) and column headers (before/after). Approve opens an alert dialog with the effect read in full. |
| H4 | Rate cards / catalogue | `/hq/rate-cards`, `/hq/catalogue?tab=dependencies` | Tables have captions/labels via their region; each line is a row header; the scrollable region is focusable and named. |
| H5 | Requests | `/hq/requests` | Each request is an article with a heading; "Policy: Approval required" is read; decline asks for a reason in a dialog. |
| H6 | Amendment | `/hq/tenants/tnt_larkspur/contracts/new` | Module checkboxes are a labelled group; the "Impact" region is a complementary landmark; price before/after/change read as a description list; "Who gains or loses access" lists each role. |
| H7 | History | Tenant 360 → Subscription | Each version reads number, date, status, author, monthly price; "Withdraw this change" asks for confirmation. |
| H8 | Usage evidence | Riverbend → Usage → Evidence (October) | The drawer is a dialog named "Evidence: Eligible flats, October 2026"; the correction note, the side-by-side counts and the excluded codes with reasons are read; Escape closes and focus returns to the Evidence button. |
| H9 | Audit log | `/hq/audit` | The kind-of-change radio group with counts; each event reads the sentence, the person and principal id, and the date; "What changed" expands. |
| H10 | Preview on a date | Shalimar preview, "As on" 1 Nov 2026 | Date field announced; after the change the areas list re-reads with Residents "Available". |

## Results

| # | Firefox EN | Firefox UR | Chrome EN | Chrome UR | Notes |
|---|-----------|-----------|-----------|-----------|-------|
| B1–B12 | | | | | |
| H1–H10 | | | | | |

Tester: ______  Date: ______  NVDA version: ______
