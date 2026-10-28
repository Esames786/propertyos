# Manual verification still outstanding — Gate C.1 (and carried over from Gate B)

**Status: not yet performed.** Automated checks pass (axe-core on every C.1 screen and overlay in
English and Urdu at 1440 and 390; keyboard-only paths; 320 px reflow and 200 % zoom; see
[`test-results.md`](test-results.md)). They are not a WCAG certification. Two kinds of check need a
person and are tracked here until done:

1. **Screen reader (NVDA).** The Gate B list ([`../gate-b-final/NVDA_CHECKLIST.md`](../gate-b-final/NVDA_CHECKLIST.md), 22 flows) plus the C.1 flows below.
2. **Cross-browser.** Every automated run uses Chromium. Firefox, Safari/WebKit and Edge have not been tried.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, Gate B flows B1–B22 | backoffice and HQ | not performed | needs a person running NVDA |
| NVDA, Gate C.1 flows C1–C10 (below) | society screens | not performed | needs a person running NVDA |
| VoiceOver (A7 AC-19) | portal bill | not applicable until C.2 | — |
| Firefox (latest) | C.1 storyline, desktop and phone width | not performed | — |
| Edge (latest) | C.1 storyline | not performed | — |
| Safari / WebKit (iOS and macOS) | C.1 storyline on a phone | not performed | — |

## Set-up

- Windows 10/11, NVDA 2024.x or later, Chrome and Firefox (latest), speech viewer on.
- Production build: `npm run build -w @repo/backoffice && npm run preview -w @repo/backoffice` (port 5173).
- Sign in at `/backoffice/sign-in` as **Imran Qureshi** (building manager) or **Ayesha Malik** (committee treasurer), *Al-Noor Residency (Demo)*.
- Run each flow in English and again in Urdu (header language toggle). In Urdu, numbers, money,
  flat codes (`A-101`), account numbers (`ANR-A201`) and references (`ANR-INV-202611-0001`) must be read left to right.

## C.1 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| C1 | Society dashboard | Home as Imran | H1 greeting; "Money for November 2026" heading; each figure is one link read as label, exact amount and context ("Outstanding dues, Rs 49,100.00, 10 accounts"); *Collected this month* is read as arriving in C.2 (not a link); tasks list read as links with "Due now" / "Waiting" |
| C2 | Flat finder | Tab to "Open a flat", type `a102`, arrow down, Enter | Combobox role announced; option read as "A-102 Pays: Sana Iqbal"; Flat 360 opens with H1 "Flat A-102" |
| C3 | Flat 360 facts and chain | On A-102 | The four facts are a description list (Owner: Tariq Mehmood; Lives here: Sana Iqbal; Responsible payer…); the chain is read group by group (Where, Who, Money); tabs announce selection and the arrow keys follow reading direction in Urdu |
| C4 | Change of payer | B-204 → Change payer | Drawer is a modal dialog with its title; the info alert is read; the two radio groups announce their labels; after saving, the toast is announced and focus returns |
| C5 | Import review | Fresh demo (Get started → society → *Start before setup*) → Import flats → sample | Counts read as a description list; each error row reads its line, flat and problem ("Type (Standard or Penthouse): required"); "Use Standard" button; after *Use all 3 suggestions* the change is announced |
| C6 | Billing run: preview and submit | Billing → New billing run → Create → Generate preview → Send for approval | Progress list read as steps with the current one marked; the next-step panel reads its heading and text; toasts announced; disabled *Approve* reads its reason ("You prepared this run, so someone else must approve it") |
| C7 | Run flats table | Flats tab | Table caption, column headers; each row header is the flat; filters announce the selection; the status line ("20 flats of 80") is read as status |
| C8 | Approval and posting | As Ayesha: approve, then Post 79 invoices | The confirmation is an alert dialog stating the effect; after posting, *Posted* state and the read-only note are reachable |
| C9 | Statement | A-101 → Invoices and statement | The four sums read as label and amount ("Previous balance, Rs 1,000.00 … Total payable, Rs 5,200.00"); table caption and headers; the October/November switch is a radio group |
| C10 | Credit note | As Ayesha, A-101's November invoice → Issue a credit note | Drawer title; each line's open amount; the reason field is required; field problems read after a refused save; success toast announced |

## Results

| Item | Browser / AT | Language | Result | Notes | Date | By |
|------|--------------|----------|--------|-------|------|----|
| | | | | | | |
