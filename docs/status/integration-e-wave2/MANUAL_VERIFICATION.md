# Wave 2 combined integration: manual QA checklist

For a person with the production build. A normal `npm run build` contains no test-only principal, so the E.3
editors are reachable only for the automated tests. Every person below is fictional; sign in from the demo sign-in
page. Automated runs cover most of this (test-results.md). The items marked **person** need a human. No WCAG
conformance is claimed.

## 1. One roster, one set of areas

- [ ] Larkspur's sign-in list adds **Rehan Saleem** (budget holder, Larkspur Heights) to the Wave 1 people. Nobody
      else is new.
- [ ] Nadia, Bilal and Farah see the same menus as on `8126322`.
- [ ] Faiza and Zubair also see the payables and expenses areas.
- [ ] Riverbend's manager (another edition) opening a payables address gets the register's page. E.8 is DEV only.

## 2. E.8 payables and expenses inside the connected workspace

- [ ] The universal search "LSP-" as Faiza lists journals and suppliers. A supplier hit opens Supplier 360. As Saad,
      only journals.
- [ ] Searching "3307" (a supplier's bank digits) finds no payables record.
- [ ] Zubair's My tasks shows bills, instructions, expenses and budget versions waiting for him, never his own.
- [ ] Faiza without bank permission (a prototype access change) sees no bank name or digits on Supplier 360.

## 3. The payment drawer at 320 px with 200 % text (W2-D1), English and Urdu

- [ ] The drawer's header shows the reference ("LSP-PV-2026-…") whole, or broken only after a hyphen, never inside
      "0001".
- [ ] Scrolling to the balance shows the actual balance, the money states, and the dashed **Simulation** box.
      Nothing is paid or settled.
- [ ] The same in Supplier 360, the bill, expense and budget workspaces, and the new-instruction drawer.

## 4. E.3 pricing (test build only)

- [ ] COM-004 at 320 px / 200 %: the fee and discount descriptions wrap inside their fields. Discounts read as
      deductions (minus sign and "Deduction").
- [ ] A draft link whose draft is not yours, or does not exist, reads "Draft not available", not "Revise draft".
- [ ] Opening a draft adds nothing to Recent records. Opening a unit does.
- [ ] Unit links from E.3 open INV-002 (the unit quick view over the matrix).

## 5. Person-only checks

- [ ] **person** NVDA and VoiceOver on the payment drawer, Supplier 360, the E.3 editors and the work queue.
- [ ] **person** A real phone in Urdu at the largest text size on the payment drawer and COM-004.
- [ ] **person** A native Urdu reader checks the new labels: "Draft not available" ("مسودہ دستیاب نہیں"), and E.8's
      "In progress" and budget-holder wording.
