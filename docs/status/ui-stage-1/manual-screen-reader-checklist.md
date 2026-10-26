# Stage 1: manual screen-reader and keyboard checklist

**Status: NOT YET EXECUTED.** This environment cannot run NVDA, VoiceOver or TalkBack. Automated
axe scans and ARIA assertions passed (see `STAGE_1_REPORT.md`), but they do not establish that the
experience works with real assistive technology.

Record results in the table at the end: tester, date, assistive technology + browser + OS version,
pass or fail per item, and notes.

## Setup

1. `npm run build && npm run preview`, then open http://localhost:5173/backoffice.
2. Test with:
   - NVDA + Chrome (Windows);
   - VoiceOver + Safari (macOS, and iOS at 390 px);
   - TalkBack + Chrome (Android).
3. Repeat the Urdu items with the interface switched to اردو. Note how the screen reader voices Urdu and the Latin references (IBAN, phone, invoice numbers) embedded in it.

## A. Sign-in and first-login welcome

- [ ] A1. The sign-in page reads its heading, the fictional-data notice, and each identity card with its "Continue as …" button.
- [ ] A2. Choose Bilal Ahmed. The welcome dialog is announced as a dialog with title "Welcome, Bilal Ahmed" and its description.
- [ ] A3. Both "Start 2-minute tour" and "Explore on my own" are reachable with Tab and have the same prominence. The checkbox is announced with its state.
- [ ] A4. Escape closes the welcome (same as "Explore on my own"). Focus lands somewhere sensible, not at the top of the document.

## B. Spotlight tour, modal steps (EXPLAIN)

- [ ] B1. Starting the tour announces the step dialog: title, then "Step 1 of 6", then the body text.
- [ ] B2. Tab cycles only within the step card (language switch, close, Skip, Back, Next). The page behind is not reachable or announced (inert).
- [ ] B3. Next announces the next step's title and step number. Focus is on the step heading.
- [ ] B4. The language switch inside the card changes the language. The current step is re-announced in Urdu and stays on the same step.
- [ ] B5. Escape pauses the tour. "Tour paused. Resume it from Help → Guided tours." is announced, and focus returns to the page heading.
- [ ] B6. Help → All guided tours lists the tour as "Paused at step x of 6". "Resume tour" continues at that step.

## C. Spotlight tour, non-modal step (GUIDED_ACTION, step 4 "Search anything")

- [ ] C1. The step is announced. Tab can leave the card and reach the page, which is not inert.
- [ ] C2. "Go to the highlighted control" moves focus to the Search button, announced as "Search".
- [ ] C3. Opening search (Enter or Ctrl+K) hides the tour. Closing search advances to step 5, which is announced.

## D. Practice mode

- [ ] D1. On Help → Practice mode, "Start guided practice" announces the TRAINING banner (status) and the first step.
- [ ] D2. In the practice drawer, the inline step card is read before the form. The form fields read their labels, hints and (after a failed submit) errors.
- [ ] D3. After "Create practice lead" the success message is announced. It says nothing was saved to real records.

## E. Text-only guide

- [ ] E1. `/backoffice/help/tours/GLOBAL-TOUR-001/text` reads as an ordered list of 6 steps.
- [ ] E2. "Show me" moves focus to the real control, and its name is announced.

## F. Core components

- [ ] F1. The skip link is the first Tab stop and moves to main content.
- [ ] F2. Navigating to another page announces "<page>, page loaded", and focus is on the heading.
- [ ] F3. Ctrl+K opens search. Results are announced as a menu with sections (Screens / Records / Actions). Arrow keys move, Enter opens.
- [ ] F4. Forms lab: submitting empty focuses "Fix 10 problems to continue". Each link moves to its field, and the field announces its error.
- [ ] F5. Unit picker: changing the project announces that dependent fields were cleared. Unavailable units are announced as unavailable, with their status.
- [ ] F6. Async customer search announces the number of results. Each option reads name, customer number and phone (the phone reads as digits, not reordered).
- [ ] F7. File upload: "Choose file" opens the native picker (camera option on phones). Added and removed files are announced.
- [ ] F8. Drawer and confirmation dialog trap focus and restore it on close. The confirmation reads its exact effect.
- [ ] F9. Toasts: success is announced politely, errors assertively, each with its reference.
- [ ] F10. Workspace tabs: arrow keys move between tabs (mirrored in Urdu). "More" lists the remaining tabs.

## G. Customer portal

- [ ] G1. The bottom navigation (phone) is announced as "Portal navigation" with 5 links. The current page is marked.
- [ ] G2. The payment card reads "Awaiting verification", never "Paid", and reads the amount correctly in Urdu.

## Results

| Item | NVDA + Chrome | VoiceOver + Safari | TalkBack + Chrome | Notes |
|---|---|---|---|---|
| | | | | |
