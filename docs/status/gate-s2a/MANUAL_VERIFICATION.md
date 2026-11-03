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
| NVDA, flows H1–H8 (below) | office app | not performed | needs a person running NVDA |
| TalkBack, H5 and H8 in Urdu at 200 % | office app (supervisor) and resident app on Android | not performed | needs an Android phone |
| VoiceOver (iOS), H8 | resident app on an iPhone | not performed | needs an iPhone |
| Real phones at 320–360 px | On duty now (check-in, mark absent, bring in cover) with a thumb; the roster's day picker; the assign drawer with the soft keyboard | not performed (automated in Chromium, Firefox and WebKit) | needs devices |
| Windows High Contrast (forced colours) | roster cells (short, leave requested, cover), duty and attendance badges, the "approved — not paid" state | not performed | needs a person |
| Urdu wording by a native reader | `packages/i18n/locales/ur-PK/hr.json`; the residents' staff strings in `community.json` | not performed | needs a person |
| Urdu times with a reader | that a time range in Urdu reads start then end (start on the right), with NVDA and TalkBack | not performed | needs a person |
| Money wording | "Approved — not paid", "nothing has been paid", and the settlement's PARTIAL note, read by the finance team | not performed | needs a person |
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
| H7 | Advances | Ayesha: Advances → approve; Saba: Settlement → link | "Approved — not paid" is read as the state. The settlement's PARTIAL note is read first. Ineligible vouchers read their reason. |
| H8 | Residents' staff on duty | Kamran: Community → Staff on duty, in Urdu at 200 % | Roles, posts and "until" times are read in order. Names are read only where consent was given. Nothing implies emergency help. |
