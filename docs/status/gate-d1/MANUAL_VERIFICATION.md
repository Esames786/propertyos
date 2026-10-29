# Manual verification still outstanding: Gate D.1 (with Gates B, C.1 and C.2)

**Status: not yet performed.**

Automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every D.1 screen in English and Urdu, at 1440 and 390;
- 320 px reflow and 200 % text on every D.1 screen;
- keyboard paths in the E2E suite (radio cards move with the arrow keys; dialogs and drawers trap and return focus).

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-c2/MANUAL_VERIFICATION.md`](../gate-c2/MANUAL_VERIFICATION.md).

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, D.1 flows E1–E12 (below) | office app, resident app, HQ | not performed | needs a person running NVDA |
| VoiceOver (iOS), E4–E8 | resident app on an iPhone | not performed | needs an iPhone |
| Real Android phone, E4–E8 | Chrome on Android, EN and UR, text size 150 % and 200 %, Nastaliq | not performed | needs a device |
| Vibration (A7) | Android phone (iOS browsers do not vibrate) | not performed | needs a device |
| Sound volume (A7) | any device with speakers | not performed | needs a person |
| Printing (B4) | a real printer or "Save as PDF" | not performed | needs a person |
| Windows High Contrast (forced colours) with the D.1 high-contrast theme | Edge on Windows | not performed | needs a person |

## Set-up

- Production builds: `npm run build -w @repo/<app> && npm run preview -w @repo/<app>` for `backoffice` (5173), `customer-web` (5174) and `platform-hq` (5175), on the same host name.
- Office: `/backoffice/sign-in` → *Al-Noor Residency (Demo)*: **Imran Qureshi** (manager), **Rabia Hashmi** (committee secretary, also a resident), **Ayesha Malik** (treasurer).
- Resident: `http://localhost:5174/customer/portal/home` → **Kamran Siddiqui** (A-101) or **Rabia Hashmi** (A-201). Or sign in by phone at `/shared/auth/customer-portal-login` with a demo number.

## D.1 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| E1 | Personalization hub | Office → account menu → Preferences | **Sections:** a list of links to each section. **Each setting:** a radio group read with its name, every card's name and description; choosing one announces the change. **Reset:** an alert dialog stating the effect. |
| E2 | Hub in Urdu | Switch to اردو, then Urdu font → Nastaliq | Everything reads in Urdu; the font samples read in their own language. |
| E3 | Resident app access | Residents → Resident app access | **Figures:** links read label and number. **Filters:** radio pills announce the selection. **Rows:** name, status (words, not colour), flats and roles, last sign-in, consents; the actions button names the person. |
| E4 | Invite and print | A row → Invite → *Printed letter* → Prepare | **Drawer:** a dialog with its title. **Channel:** a radio group. **Result:** the sent and skipped people are listed with reasons; the print button and link are named. |
| E5 | Accept an invitation | Open the link in the resident app | **Page:** H1 *Welcome, …*; the society and flat read as a list; the warning to stop if it is not you is read. **Code:** the demo notice reads the code; a wrong code is announced with the tries left. |
| E6 | Welcome | After joining | **Steps:** each step's H1 and *Step n of 3*; language, text size and theme are radio groups; *Continue* and *Back* are reachable by keyboard. |
| E7 | Phone sign-in | `/shared/auth/customer-portal-login` | **Field:** labelled; errors announced. **Unknown number:** the neutral message is read. **Signed out by the office:** the reason is read first. |
| E8 | Resident profile, devices, my data | Account menu → Profile | **Tabs:** a tab list. **Devices:** each device's name, *This device*, last used; *Sign out this device* opens an alert dialog. **My data:** the request kinds are a radio group; a missing detail is announced. |
| E9 | App switch | Rabia: account menu → *Switch to the resident app*, and back | **Indicator:** the mode chip reads "You are using the … as …". **Arrival:** the toast is announced; focus starts at the new page. |
| E10 | Staff sessions | Administration → Users and sessions | **Rows:** buttons reading the person and their sessions. **Drawer:** sessions and activity; ending one needs confirmation. |
| E11 | Data and privacy | As Rabia: New export; as Ayesha: Review | **Preview:** each dataset reads its rows or why it cannot be chosen, and whether it holds personal or financial data. **Review:** the datasets to approve are checkboxes; decline needs a reason. |
| E12 | Organisation colours | As Rabia: Administration → Organisation colours | **Palette:** a radio group; the page changes at once. **Brand colour:** the result lists what fails, in words, with the suggested colour. |
