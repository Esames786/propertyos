# Manual verification still outstanding: Gate S.2a (with Gates B to D.3)

**Status: not yet performed.**

These automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every S.2a office screen and on the residents' Staff on duty tab, in English and Urdu, at 1440, 768 and 390 px;
- axe on the drawers in the reference flows;
- no sideways scroll at those sizes;
- at 320 × 700 with 100, 150 and 200 % text in both languages: nothing clipped, spilled or broken mid-word on every S.2a screen, the assign drawer and the residents' tab;
- keyboard walks at 320 px / 200 % on the roster, On duty now and Employee 360: no focused control hidden under the header or the bottom bar;
- dark mode with high contrast at 390 px, with axe.

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-d3/MANUAL_VERIFICATION.md`](../gate-d3/MANUAL_VERIFICATION.md) and the files it links.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, flows H1–H10 (below) | office app | not performed | needs a person running NVDA |
| TalkBack, H5 and H8 in Urdu at 200 % | office app (supervisor) and resident app on Android | not performed | needs an Android phone |
| VoiceOver (iOS), H8 | resident app on an iPhone | not performed | needs an iPhone |
| Real phones at 320–360 px | On duty now (check-in, mark absent, bring in cover) with a thumb; the roster's day picker; the assign drawer with the soft keyboard | not performed (automated in Chromium, Firefox and WebKit) | needs devices |
| Windows High Contrast (forced colours) | roster cells (short, leave requested, cover), duty and attendance badges, the "approved — payment not verified" state, and the residents' dashed "scheduled" cards next to the confirmed ones | not performed | needs a person |
| Urdu wording by a native reader | `packages/i18n/locales/ur-PK/hr.json`; the residents' staff strings in `community.json` (including the Issue #12 wording: confirmed, scheduled, unavailable) | not performed | needs a person |
| Urdu times with a reader | that a time range in Urdu reads start then end (start on the right), with NVDA and TalkBack | not performed | needs a person |
| Money wording (Issue #12) | "Approved — payment not verified", "Payment: Not verified", and the read-only settlement page with its list of what verification will need, read by the finance team | not performed | needs a person |
| Residents' staffing states (Issue #12) | with residents: whether "Confirmed on duty" and "Scheduled, not yet confirmed" are understood as recorded and planned, and that the note does not suggest an emergency service | not performed | needs residents |
| Multi-site in the screens (Issue #12) | a second site exists only in the API tests; the site switcher on the roster and site-scoped people need a demo with two sites | not performed (automated at the API) | later stage |
| Shared employee, read only (Issue #14) | the read-only note on Employee 360, read by a manager who works at one site: is "Read only for you … someone responsible for all of their sites" clear, and is it read before the tabs? | not performed (automated in the browser with the test hook, EN and UR at 320 px / 200 %) | needs a person |
| Supervisors' view (Issue #14) | with Shahid and Naveed: whether a board showing only their own departments is enough for their work, and whether names without links are clear | not performed | needs the supervisors |
| Firefox and WebKit beyond the smoke | the rest of the S.2a screens | not performed (smoke: new guard and night shift; On duty now cover; a correction decided by someone else; 320 px / 200 % Urdu) | later stage |

## Set-up

Use production builds as in earlier gates: `npm run build -w @repo/<app> && npm run preview -w @repo/<app>`, with the office app on 5173 and the resident app on 5174, on the same host.

People:
- **Imran Qureshi**, building manager;
- **Shahid Hussain**, security supervisor;
- **Naveed Anjum**, maintenance supervisor;
- **Ayesha Malik**, treasurer;
- **Saba Javed**, accounts officer;
- **Rabia Hashmi**, administrator and committee secretary;
- **Kamran Siddiqui**, resident (A-101).

The business date is Monday 26 October 2026; the time of day is the computer's.

## S.2a flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| H1 | New employee | Imran: HR → Employees → New employee; save empty, then fill in; use Asif's CNIC | The error summary and each field's message are read and linked to their fields. The duplicate alert is announced and its link opens Asif's record. After saving, the page title and the toast are read. |
| H2 | Employee 360 | Open an employee; move through the tabs | The tabs are a tab list (arrow keys; RTL in Urdu). Badges read their state in words. Masked numbers read sensibly, not as "bullet bullet". |
| H3 | Assign a shift | Employee 360 → Assign a shift → Night | The drawer is a dialog with a title. "Ends next day" is read with the window. A refusal (double booking, leave) is announced in the drawer. |
| H4 | The week | Duty roster (desktop) | The grid is a table with day headers and shift row headers. Each duty is a button naming the person and post. Warnings are a list. "Short: 1 of 2" is read. |
| H5 | On duty now | Shahid: On duty now → mark absent → Bring in cover | Each person's state is read. The absent confirmation is an alert dialog. The candidates list explains why people cannot cover. The cover is announced. |
| H6 | Corrections and leave | Imran: Leave & corrections | Blocked rows say why (own record). Approve and reject open alert dialogs; reject asks for a reason. The leave conflicts are read before approving. |
| H7 | Advances | Ayesha: Advances → approve; Saba: Settlement | "Approved — payment not verified" is read as the state, and "Payment: Not verified" in the drawer. The settlement page is read first as partly built and read only; its list of what verification will need is a list; there is no link control. |
| H8 | Residents' staff on duty | Kamran: Community → Staff on duty, in Urdu at 200 % | "Confirmed on duty" and "Scheduled, not yet confirmed" are separate headed lists; each card reads role, post and "until". Names are read only for confirmed staff who agreed. The unavailable count and the note are read; nothing implies emergency help. |
| H9 | Shared employee (Issue #14) | Set-up as in `tests/support/society.ts` `addSharedGuard` (a second site and Rashid Latif; the manager narrowed to the main site); Imran opens Rashid's Employee 360 | The note is read as information, with its lock icon silent. No change action is offered: only "Assign a shift". The Leave and Documents tabs read their content without buttons. |
| H10 | Supervisor's board (Issue #14) | Naveed: Duty roster → On duty now | Only maintenance and housekeeping shifts are read. Names are read as text, not as links. Check in, Mark absent and Bring in cover work as before. |
