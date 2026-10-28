# Nizam reference: features and gaps against PropertyOS

**What this is.**
- A privacy-safe, text-only summary of a UX benchmark, written for the owner and reviewers.
- It feeds the V3.2 scope proposal in [`docs/blueprint/v3.2/`](../../../blueprint/v3.2/PRODUCT_SCOPE_EXPANSION.md).
- Feature numbers F01–F21 match that proposal and GitHub Issue #2.

**What this is not.**
- Not a specification.
- Not permission to copy anything. Nizam's name, code, branding, colours, illustrations, copy and layouts are not to be reused. PropertyOS keeps its own Limestone & Evergreen identity.

**Privacy.**
- No screenshots are in this repository.
- The captures stay with the owner, because several show a real account's phone number and name.
- This file names no real person, phone number or account.

## 1. Source and limits

- **Source:** 45 read-only captures of Nizam's web app, taken on 27 Oct 2026 from its demo complex, plus the owner's 16 tour frames in Urdu.
  - Management mode: 26 desktop and 11 phone screens.
  - Resident mode: 8 screens.
  - Nothing was created, edited, paid or deleted.
- **UNVERIFIED, because never opened:**
  - what the SOS button does;
  - Notifications;
  - chat intro slides 2–4 and any conversation;
  - the resident payment or checkout flow;
  - Marketplace;
  - Calendar.

  Statements about these are marked *inferred*. No conclusions about Nizam's gateway, SOS behaviour or chat privacy are drawn from them.

## 2. Group chat (what was seen)

- **Navigation.** Chat is the raised centre button of the phone bottom bar in both modes, with an unread badge. It is also second in the sidebar.
- **Groups are *described* as automatic.** The first intro slide claims groups are created for the complex, each section, floor, staff role and the committee, with no setup, and that they update as people join or leave.
  - This is Nizam's own description. It was not verified: no conversation or membership list was opened.
- **Groups visible in the list:**
  - one for the whole complex;
  - one per block;
  - a collapsed section holding more groups.
- **System posts.** The complex group shows a system post when a staff member joins.
- **Controls:** search, unread counts, a settings gear, and a "+" button (*inferred:* start a new chat).

## 3. SOS (what was seen)

- **Seen:** a red round SOS button floats on the management and resident home pages, on desktop and phone.
- **Behaviour: UNVERIFIED.**

## 4. Payments (what was seen)

**Channels:** Cash, Online and Wallet, shown as filter chips on the maintenance list and the resident's bills.

- **Cash.**
  - Recorded by management.
  - "Bulk collect" marks many houses paid at once.
- **Online.**
  - A "Payment Verifications" queue says residents' online payments are confirmed against the complex's bank. Tabs: To verify / Confirmed / Rejected.
  - The complex's bank account is set in its settings.
  - *Inferred:* this reads like a transfer-and-verify flow. No card or wallet checkout appears in any capture, and the pay action was never opened, so Nizam's gateway (if any) is **UNVERIFIED**.
- **Wallet.** An "Advance Wallet Balance" card with a history link sits on the resident home. What it does is **UNVERIFIED**.

**Around payments**
- **After a bill is paid:** a Paid chip, a payment-method chip, "View receipt", and PDF export.
- **Collections:**
  - due date and penalty settings;
  - revising rates;
  - "Send reminder" per house;
  - printing dues bills for every house that owes;
  - reconciling collections by date, channel and unit.
- **Finance:**
  - funds transfer;
  - a monthly period with "Close month";
  - opening, in, out and closing cash;
  - income, expense and net surplus;
  - reports.
- **Nizam's own subscription:** a 1-month trial, pricing by unit slab, and self-serve "Subscribe".

## 5. Features Nizam has that PropertyOS's V3.1 plan lacked

| # | Nizam feature (as seen) | V3.1 plan before this review | V3.2 proposal |
|---|---|---|---|
| F01 | Group chat; automatic groups as described in its intro text (conversations not seen) | None (communications are one-way) | New add-on module `community_chat`, mock only |
| F02 | SOS button (behaviour UNVERIFIED) | None | New add-on module `safety`, restricted; parked until a separate safety design |
| F03 | Resident login status and WhatsApp invite | None (staff invite only) | `resident_portal` feature: portal access and invitations |
| F04 | Community complaints with an "affected" count | Mentioned, no screen | `maintenance` feature: community issues on the same request entity |
| F05 | Committee roster and spend-approval policy | Treasurer only as a billing approver | Committee 360 plus versioned approval policies (APR) |
| F06 | Staff shifts, on/off duty, attendance | HR for developers only | `hr` offered to societies as an add-on; duty roster |
| F07 | Payroll with bonuses, loans, advances | Payroll for developers only | `payroll` add-on for societies; loans beside advances |
| F08 | Rentals (rent collection) | None | New add-on module `rentals` |
| F09 | Owner payouts | None | Part of `rentals`; a payout instruction moves no money until settlement evidence |
| F10 | Cash book, funds transfer, month close | Accounting periods (developer); bank transfers planned | Cashbook as a derived view, approved cash vouchers, settlement evidence, one shared period lock |
| F11 | Bulk cash collection | Single office payment | Controlled batch; confirmed cash per site policy; cheques pending until cleared |
| F12 | Print bills for all houses | None | Print pack on the billing run; dues notices |
| F13 | Send reminder | Reminder events in the ERD only | Reminder rules with consent, quiet hours and history |
| F14 | Neighbour-recommended services directory | None | `community_hub` feature, vetted listings only |
| F15 | Community hub: announcements, broadcast, marketplace, resources, polls (polls and circles "coming soon" in Nizam too) | Notices only | `community_hub` (polls, resources, optional marketplace) and a resident Community home |
| F16 | One login switches Resident and Management | Separate apps | App switcher with separate scopes |
| F17 | Manage signed-in devices | None | Devices tab in profile; admin revoke |
| F18 | Self-serve backup and export | None | Data export and privacy requests with approval |
| F19 | Live visitor queue; vehicle approvals | Pre-registered passes; vehicle registry | Live gate queue (simulated); vehicle approval tab |
| F20 | Transfer and clearance fee | Transfers planned; no fee | Fee via the shared invoice engine; clearance certificate |
| F21 | Advance wallet card (behaviour UNVERIFIED) | Unapplied credit only | Credit and paid-in-advance display; no funded wallet |

**Both products have:**
- a residents directory;
- monthly maintenance billing;
- outstanding dues and aging;
- payment verification;
- additional collections (our assessments);
- finance;
- work orders and vendors;
- visitors, vehicles and parking;
- notices;
- roles and permissions;
- language and font size;
- a subscription view.

## 6. What PropertyOS must not copy

- **A defaulter list visible to other residents.** Nizam lets management decide whether residents see dues and finance. PropertyOS never shows one resident's debt to another. Only aggregate, committee-published summaries are allowed.
- **Accessibility weaknesses seen:**
  - very small light-grey text (about 10–11 px);
  - status shown by colour alone;
  - native selects;
  - a tour that is a carousel of modals over a dimmed page.
- **Public "standing" labels for residents.** Any recognition must be private and opt-in.
- **Brand, visual identity and copy.**

## 7. Where PropertyOS is already stronger

- **Payments.** A proof is never shown as "Paid". Money goes to the association's own verified account, never the SaaS company's. Bank changes need maker-checker. Allocation is per-unit and per-payer.
- **Access.** It is per module, site and permission, and enforced by the mock server, not just by hiding menus.
- **Accessibility.**
  - Urdu with right-to-left layout.
  - Text size up to 200 %.
  - Automated accessibility checks on every screen. Manual screen-reader checks are still outstanding.
