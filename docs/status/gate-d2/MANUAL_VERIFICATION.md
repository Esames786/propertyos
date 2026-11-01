# Manual verification still outstanding: Gate D.2 (with Gates B, C.1, C.2, D.1 and S.1)

**Status: not yet performed.**

Automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every D.2 office and resident screen in English and Urdu at 1440, 768 and 390 px, and on the drawers and prompts inside the three reference journeys (1440 and 390 px, English);
- no sideways scroll at 390, 768 and 1440 px on every D.2 screen, and at 320 px with 200 % text on every D.2 resident page;
- keyboard and pointer paths through every D.2 form in the E2E suite (React Aria selects, combo boxes, checkboxes, drawers and alert dialogs).

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-s1/MANUAL_VERIFICATION.md`](../gate-s1/MANUAL_VERIFICATION.md) and [`../gate-d1/MANUAL_VERIFICATION.md`](../gate-d1/MANUAL_VERIFICATION.md).

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, D.2 flows F1–F10 (below) | office app and resident app | not performed | needs a person running NVDA |
| VoiceOver (iOS), F1, F4, F5, F7 | resident app on an iPhone (residents use phones); the gate on a tablet | not performed | needs an iPhone and an iPad |
| TalkBack, F1, F5, F7 | resident app on Android in Urdu at 200 % text | not performed | needs an Android phone |
| Real Android phone, F1, F4, F5, F7 | Chrome on Android, EN and UR, text size 150 % and 200 % | not performed | needs a device |
| The gate on a shared tablet in daylight | VIS-004 check-in and the live queue | not performed | needs a device and a guard's view |
| Windows High Contrast (forced colours) on Request 360, the gate and the notice composer | Edge on Windows | not performed | needs a person |
| Urdu wording review by a native reader | `packages/i18n/locales/ur-PK/operations.json` (new: 1,336 keys) | not performed | needs a person |
| Issue #8 closure on a real phone | Chrome on Android and Safari on iPhone at 320–360 px: the browser's own text size at 200 % and page zoom at 200 %; the notice cards, the bill card and Pay, the visitor cards; the soft keyboard over the guest invitation; a toast arriving while a drawer is open (still read by TalkBack/VoiceOver, closable, the drawer stays) | not performed (automated in Chromium, Firefox and WebKit; see test-results) | needs devices |
| Firefox and WebKit beyond the smoke | the rest of the D.2 screens | not performed (smoke only: repair, visitor approval, notice, 320 px / 200 % Urdu) | Stage 6 |
| Typing English into Urdu forms | the full stop shows at the start of the line while typing (shared fields, all gates; see test-results §Findings) | known, not fixed | owner to decide |

## Set-up

- Production builds, as in Gates D.1 and S.1: `npm run build -w @repo/<app> && npm run preview -w @repo/<app>` for `backoffice` (5173), `customer-web` (5174) and `platform-hq` (5175), on the same host name. Beside another checkout, set `E2E_PORT_OFFSET` and build with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`.
- Office: `/backoffice/get-started` → *Explore the society demo*. People: **Naveed Anjum** (maintenance supervisor), **Waqas Ali** (electrician), the **security guard**, **Imran Qureshi** (building manager), **Rabia Hashmi** (committee secretary). Resident app: **Kamran Siddiqui** (A-101).

## D.2 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| F1 | Report a repair | Kamran: Requests → Report a repair | **Sheet:** a dialog with its title; room, urgency (a radio group) and contact selects are labelled; the photo's description field is read with its hint; errors are announced. **After sending:** the reference and the first step are read. |
| F2 | Triage and assign | Naveed: Operations → the new request | **Next step:** the panel reads what to do and the due times in words. **Assign:** the technicians are a radio group; *Suggested* and *Not available* are read with each name. |
| F3 | Completion | Request 360 → Start → Mark as fixed | **Drawer:** the note and the photo description are labelled; the toast is announced once. |
| F4 | Is it fixed? | Kamran: the bell → the repair | **Bell:** the unread count is spoken; each notification reads its text and time. **Confirm:** the stars are a labelled group; *Yes, it is fixed* and *Not fixed* are buttons with their outcome. |
| F5 | Invite a guest | Kamran: Requests → Visitors → Invite a guest | **Sheet:** the window's date fields read their format; single or multiple entry is a radio group. **Pass:** the code is read digit by digit and can be copied. |
| F6 | The gate | the guard: Gate | **Code:** the field announces six digits; the result (*Let in* or the refusal and why) is read as a status or an alert. **Inside now:** each visitor's *Check out* names the visitor. |
| F7 | Walk-in and prompt | the guard: Ask the resident; Kamran on a phone | **Guard:** the flat search announces its options. **Prompt:** an alert dialog reads who is at the gate and for which flat; the time left is not read every second. |
| F8 | Notice | Imran: Notices → New notice → Publish | **Composer:** the audience choices are labelled; the preview's count is announced when it changes. **Detail:** the counts read their labels; the flats that have not acknowledged are a list. |
| F9 | Acknowledge | Kamran: the bell → the notice | **Detail:** the heading, the body and *Acknowledge* in order; afterwards *Acknowledged* is read as a status. A withdrawn notice reads only that it was withdrawn and when. |
| F10 | Vehicles, residents, gateway | Imran: Vehicles → a waiting vehicle; Residents → Record a move-out; Rabia: Online payments | **Checks:** each check reads pass or fail in words; *why it cannot be approved* is read before the buttons. **Move-out:** the *still pays* warning is read after the result. **Gateway:** each event reads its result; nothing says *paid*. |
