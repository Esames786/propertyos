# Nizam walkthrough: patterns to learn from

**Capture details**
- **Captured:** 2026-10-27, from the live app at `app.nizamco.com`.
- **Account:** the owner's own management account, on the demo complex "Model Town Residency (Demo)".
- **Read-only:** I only navigated. Nothing was created, edited, paid or deleted.
- **Settings changed:**
  - I closed two "first visit" intros (Services, resident tour).
  - I switched to Resident mode and back to Management.
- **Not captured:** I never opened Notifications or SOS.

**Screenshots** are in `docs/design/reference/nizam/`:
- `desktop/`: 26 pages at 1440 × 900.
- `phone/`: 11 screens at 390 × 844.
- `resident/`: 7 screens of the resident side.

The folder is git-ignored because some captures show the account's real phone number. The owner's earlier pack (`PropertyOS_vs_Nizam_Claude_Review.zip`) adds the get-started, demo and tour frames, which I could not see live because the account was already signed in.

> **Boundary.** This is a usability and information-architecture reference only. We do not copy Nizam's name, logo, purple/indigo colour scheme, illustrations, copy or exact layouts. PropertyOS keeps its own Limestone & Evergreen identity unless the owner approves a change.

## Why Nizam feels easier than PropertyOS today

1. **Every screen leads with the task, not the brand.** The page title and a one-line purpose ("Track payments for each billing period") come first. A primary action sits top-right ("+ Add Rental", "Run Payroll", "Lodge"). Filters and search follow, then the records.
2. **Numbers are big, bold and colour-coded.** Pending amounts are in red, collected amounts in green, and totals in black. A record's key amount sits in its own tinted strip ("AMOUNT PAID PKR 8,000", "PENDING AMOUNT PKR 5,000").
3. **Icons do the sorting.** Every stat, settings row and shortcut has a small tinted square icon. Quick actions are solid-colour tiles with white glyphs. You can find "Complaints" by colour before reading it.
4. **Records are cards with one-tap actions.** Unit code in bold (A-100), a block chip, a status chip, a divider, then the person with their phone number. Call and WhatsApp buttons sit on the card.
5. **A summary sits above every list.** Total, collected and pending figures with a progress bar (Maintenance), or four KPI tiles (Rentals, Login status).
6. **The phone is first-class.**
   - A floating rounded top bar shows the logo, complex, mode chip, bell and avatar.
   - The bottom bar has Home, Residents, Finance and More, with a **raised round centre button** for the most-used action (Chat).
   - "More" is a full page of large icon cards, with a **Switch mode** control (Resident / Management) at the top.
7. **First visits are guided.**
   - Each module shows a short intro with a coloured header, page dots ("1/4") and Next/Skip.
   - The first-run tour spotlights the real KPI cards, quick actions and charts (pack frames N13–N16).
8. **Empty states explain themselves.** An icon, a clear sentence ("All caught up — No online payments are waiting for verification.") and the next action.
9. **Live screens show freshness.** "Updated 02:21:24 AM · Refreshing in 14s" on the visitor queue.
10. **Settings read like a phone settings app.** Uppercase group labels (ACCOUNT, MAINTENANCE, ACCESS CONTROL, SECURITY, PREFERENCES) and rows with icon, title, one-line hint and chevron.

## Measured style (from the live CSS)

| Element | Nizam value | What we take |
|---|---|---|
| Page background | near-white grey; cards white | Lighten our limestone page tone; keep white cards |
| Card | radius 16 px, `shadow-sm` (0 1 3 / 0 1 2 −1 at 10 %), 1 px grey-100 border | Our card radius is 20 px; consider 16 px for dense business cards |
| Icon tile | 40–48 px, radius 14 px, tinted background with a coloured glyph | Adopt, using **our** validated categorical palette, not theirs |
| Active nav item | tinted pill (primary at about 5 %) with primary text, radius 14 px | Ours is similar; keep it |
| Primary | indigo-600 `#4F46E5` | **Do not adopt.** Keep evergreen `#1E4D42` |
| Type | system UI sans, 16 px body, bold 24–30 px titles | We use Geist; make titles bolder and larger in business screens and keep the serif for project and brand moments |
| Sidebar | white, 256 px, right border, grouped (MANAGEMENT / SYSTEM) | Ours is already grouped |

## Weaknesses we must not copy

- **Very small, light text.** For example "Collected: PKR 672,000" and "Registered Oct 27, 2026" are about 10–11 px grey-400 on white. These likely fail WCAG AA contrast and are hard to read in Urdu.
- **Colour-only meaning.** A red or green amount sometimes has no icon or word. Ours must always pair colour with a label and icon ("Pending", "Collected").
- **Native `<select>` and date inputs** look different on every platform and fail RTL polish.
- **Two different heading sizes and alignments** across modules (Complaints is centred; Residents is left-aligned and full width).
- **The tour steps N04–N12 are a carousel of modals over a dimmed page**, which the owner's pack explicitly says not to imitate. Only N13–N16 are true spotlights.

## Mapping to PropertyOS screens

| Nizam pattern | PropertyOS use |
|---|---|
| Home: stat tiles, outstanding banner, quick actions, collected-vs-due bars | Management dashboard: keep our project showcase, add a quick-actions row and a clearer receivables banner |
| Outstanding dues card (red pending strip, Send reminder, View details) | Receivables / overdue instalments per customer and unit |
| Maintenance card (Paid, Cash chips; "Amount paid" strip) | Instalment schedule and collections list |
| Payment verifications (To verify / Confirmed / Rejected, "All caught up") | Our proof-of-payment queue ("Awaiting verification", never "Paid" until confirmed) |
| Residents card (unit code, block, owner, call and WhatsApp) | Customers and leads list on Sales home |
| Rentals (owner / tenant split, rent strip) | Unit detail: buyer, co-applicant, nominee |
| Transfer & Clearance card (charges / collected / pending) | Unit transfer requests |
| Resident home (welcome hero with unit chip, wallet card, standing, quick actions, nearby services) | Customer PWA home: property photo hero, unit, next instalment, receipts, construction, service actions |
| My Bills (left colour edge, amount top-right, Paid and Online chips, "Payment received · View receipt") | Customer PWA: my instalments and receipts |
| Phone bottom bar with raised centre action and "More" page with Switch mode | Our bottom bar: centre Quick create (staff) or Pay / Upload proof (customer); "More" as an icon-card page |
| Module first-visit intro and spotlight tour | Our existing spotlight engine, extended to dashboard widgets and each module |
| Settings grouped rows | Settings and preferences pages |
