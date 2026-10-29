# Manual verification still outstanding: Gate C.2 (with Gate B and C.1)

**Status: not yet performed.**

Automated checks pass:
- axe-core on every C.2 screen and overlay, in English and Urdu, at 1440 and 390;
- keyboard-only paths;
- 320 px reflow and 200 % zoom;
- text size 100–200 % on a phone;
- a Firefox and WebKit smoke run.

See [`test-results.md`](test-results.md). These checks are **not a WCAG certification**. Three kinds of check need a person, and they are tracked here until done:

1. **Screen readers:**
   - NVDA with Chrome and Firefox on Windows;
   - VoiceOver on iOS for the resident app (A7 AC-19).
2. **Real devices:** a mid-range Android phone and an iPhone, for the resident journey, the bottom bar and text size.
3. **Browsers beyond the smoke run:**
   - full flows in Firefox, Edge and Safari;
   - the smoke run covers only the resident proof → verification → receipt path, Urdu at 200 % on a phone, and the office dashboard.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, Gate B flows B1–B22 | backoffice and HQ | not performed | needs a person running NVDA |
| NVDA, Gate C.1 flows C1–C10 | society setup and billing | not performed | needs a person running NVDA |
| NVDA, Gate C.2 flows D1–D15 (below) | proof review, payments, resident app | not performed | needs a person running NVDA |
| VoiceOver (iOS), resident flows D8–D12 | resident app on an iPhone | not performed | needs an iPhone |
| Real Android phone, resident flows D8–D12 | Chrome on Android, EN and UR, text size 150 % and 200 % | not performed | needs a device |
| Firefox (latest), full C.2 storyline | desktop and phone width | smoke only (automated) | — |
| Edge (latest), full C.2 storyline | desktop | not performed | — |
| Safari (macOS and iOS), full C.2 storyline | desktop and phone | WebKit smoke only (automated) | — |

## Set-up

- **Production builds:**
  - `npm run build -w @repo/backoffice && npm run preview -w @repo/backoffice` (port 5173);
  - `npm run build -w @repo/customer-web && npm run preview -w @repo/customer-web` (port 5174);
  - the same host name for both, so the demo link works.
- **Office:** sign in at `/backoffice/sign-in` as **Saba Javed** (accounts officer), *Al-Noor Residency (Demo)*. For D5 and D6, use **Ayesha Malik** (treasurer) or **Imran Qureshi** (manager).
- **Resident:** open `http://localhost:5174/customer/portal/home` and sign in as **Kamran Siddiqui** (A-101). For D10, use **Sana Iqbal** (A-102).
- **Languages:** run each flow in English and again in Urdu.
- **Urdu reading order:** numbers, money, flat codes (`A-101`), IBANs (`PK36 DEMO …`), bank transaction IDs (`DEMO-TXN-…`) and references (`ANR-A101-2026-11`) must be read left to right.

## C.2 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| D1 | Collections dashboard | Home as Saba (or Imran) | **Figures:** each is one link, read as label, exact amount and context. **Progress bar:** a labelled group (collected / pending / owed). **Work queue:** links with counts. **Aging:** bucket links read name, amount and accounts. |
| D2 | Proof inbox | Collections → Proofs to check | **Filters:** radio pills announce the selection. **Rows:** each is a link reading payer, flat, amount, date, match signal and state; the count is announced as status. |
| D3 | Proof review: match | Open A-305 | H1 *Proof from Amna Chaudhry*. **Stepper:** read as steps with the current one marked. **Transfers:** a radio group with each card's name, transaction ID, date, reference, amount and reason badges (*Amount matches* / *does not match*). The *Not on a statement yet: wait for the bank line* option reads its explanation (nothing is settled until the transfer is on an imported statement); a transfer that matches only in part offers *Send for approval* (an exception decided by someone else). *(Corrected in Gate D.1: the earlier "verify by hand" option was removed in C.2.)* |
| D4 | Proof review: refusal and decisions | A-204: choose the taken transfer → Verify; then Reject | **Taken transfer:** reads "Already settles payment …". **After Verify:** the refusal is announced (role alert) with the help text. **Reject:** an alert dialog stating the effect; the reason is required; a missing reason is announced. |
| D5 | Allocation edit | A-305 → Edit allocation | **Switch:** announces its state. **Inputs:** each reads "Amount for invoice … flat …". **Errors:** an over-allocation problem is read after the server check. **Reason:** the field appears and is required. |
| D6 | Collection account change | As Imran: Sites & flats → Al-Noor → Collection account → Propose; then as Ayesha | **Form:** fields labelled; the checkbox reads *bank letter checked*. **Change card:** states *Waiting for approval* and who proposed it. **Treasurer:** *Approve* and *Reject* reachable; cooling-off date read. |
| D7 | Office cash | Payments → Record an office payment | **Drawer:** a modal dialog with its title. **Not allowed:** the warning is read first. **Allowed:** comboboxes for account and payer, amount, preview table, then *Receipt issued* announced as status. |
| D8 | Resident first run (text size) | Fresh browser → resident app | **Heading:** H1 "Choose the text size that's comfortable for you". **Sizes:** a radio group of four (name and percent); choosing one changes the page at once. **Preview:** a labelled group. *Continue with 125 %* names the choice. |
| D9 | Resident bill and pay | Home → Pay | **Bill:** the amount card reads total, current, previous and due date. **Copy buttons:** each says what it copies; the copied toast is announced. **QR:** an image whose label says it is a demo. **Proof form:** fields labelled; the file picker is announced; a file error is announced; *Pending verification* is announced after sending. |
| D10 | Resident proof status | Sana: open the proof that needs information → send again | **Request:** the office's request is read with its heading. **Resubmission:** file and amount labelled; after sending, the state change is announced; versions are listed. |
| D11 | Receipt and statement | Kamran after verification | **Receipt:** reads amount, date and what it settled (flat and charge). **Statement:** the four sums as label and amount; entries as a list; the closing balance at 0.00. |
| D12 | Bottom bar and text size at 200 % | Phone, Settings → Text size → 200 % | **Settings:** the scale is a radio group; *Reset to default* is reachable. **Header:** one line; the organisation's name is read (it is visually condensed to its monogram). **Bottom bar:** reads its five items, with the current page marked; no item is cut off; the last content on each page can be scrolled clear of the bar; while typing in a field (keyboard open) the bar steps aside and is not read; it returns when the field is left. |
| D13 | Waiting for the bank line | A-101 sends 6,000 → Saba: choose *Not on a statement yet* → note → *Wait for the bank line*; then Bank → Import statement → choose the account → sample 3 | **Option:** the radio reads its title and explanation. **After waiting:** the state change is announced; the banner (*Checked by …: waiting for the bank line*) is read. **Import:** the account select reads its label and choices (title, IBAN, in force / retired); the result names the waiting proof, as a link. |
| D14 | Exception and approval | B-405 → choose Imran's transfer → reason → *Send for approval*; then as Ayesha → *Approve and issue receipt* | **Partial line:** reads *Partial match* and what does not match. **Form:** the reason field is required (20 characters). **Card:** reads who asked, the transfer and the reason; for Saba it says someone else decides; for Ayesha the two buttons are reachable; the receipt is announced. |
| D15 | Retired account | Import sample 4 for the committee account; open A-101's proof | **Line:** the disabled radio is announced as unavailable, and its note says the money reached another account and can never settle the proof. |

## Results

| Item | Browser / AT | Language | Result | Notes | Date | By |
|------|--------------|----------|--------|-------|------|----|
| | | | | | | |
