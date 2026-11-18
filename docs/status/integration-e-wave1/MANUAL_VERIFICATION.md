# Gate E Wave 1 integration (Issue #25): manual QA checklist

For a person with the production build (`npm run build`, then `npm run preview`). Every person below is fictional;
sign in from the demo sign-in page. Automated runs cover most of this (test-results.md); the items marked
**person** need a human (screen reader, real device, native Urdu reader). No WCAG conformance is claimed.

## 1. One roster

- [ ] The sign-in page lists Hamza Rashid, Mehwish Kazmi, Faiza Noor, Zubair Ansari, Saad Hameed and Haroon Qadri
      for Larkspur, and none of Samina Latif, Hina Baig, Kashan Lodhi, Mehreen Aslam, Kashan Wasti or Tehmina Durrani.
- [ ] Nadia, Bilal and Farah see exactly the menus they saw on `373d0cf` (no Accounting; Projects as before).
- [ ] Faiza, Saad and Zubair get E.0's **Accounting** menu item; it opens the chart of accounts.

## 2. CRM pipeline (E.1) on the canonical permissions

- [ ] Hamza converts a qualified lead, moves an opportunity, marks one lost with a reason and reopens it.
- [ ] Bilal and Nadia see the pipeline (their own records, E-05) but get no Convert, Move, Lost or Reopen action, and
      a direct request is refused ("not part of your role"); nothing changes.
- [ ] The assignment drawer never offers Haroon (records clerk) as an owner.
- [ ] Opportunity 360's project link opens Project 360 (no "planned" wording).

## 3. Projects and inventory (E.2) and INV-002 holds

- [ ] Mehwish prepares and submits a project setup; she cannot approve it; Zubair approves it.
- [ ] Storage: Mehwish allocates a locker to a booked Heights unit and releases it with a reason.
- [ ] Holds: Bilal holds a Heights unit from the matrix drawer; on Lead 360 the same unit shows "held for … until …"
      with Release for him; Nadia sees the same expiry and no Release; Bilal releases it on Lead 360 and the matrix
      shows it available at once.
- [ ] At 320 px with 200 % text, in Urdu, the Lead 360 unit quick view has no sideways scroll and the title keeps
      "LH-A-0102" on one line; each amount strip shows its label and amount under the icon, "Rs" then the whole
      figure (e.g. 2,195,900.00), never split inside the number.
- [ ] Project 360 → Documents: Mehwish sees the project's documents (from the document centre); Nadia is told the tab
      is not part of her role.

## 3a. A colleague's lead stays private (F-GPT-W1-01)

- [ ] Bilal holds a Heights unit for his lead from the unit drawer. Nadia opens the same unit: "Held until …" and
      "Held by Bilal Ahmed", no lead reference or link; Hamza (sales manager) sees the lead.
- [ ] Nadia's hold picker offers only her own leads; Project 360 → Leads lists only hers and its count matches.
- [ ] Nadia searches Bilal's lead reference in the universal search: no lead is found; Bilal and Hamza find it.
- [ ] Hamza reassigns one of Nadia's leads to Bilal: Bilal sees it at once (picker, Project 360, search); Nadia
      no longer does, though she may still release a hold she placed.
- [ ] Haroon (records clerk) sees 6 Heights documents (the two lead documents are not his: D-INT-06).

## 4. Ledger and bank import (E.7)

- [ ] Saad drafts and submits a journal; Zubair approves and posts it; Saad never sees Approve or Post.
- [ ] Faiza drafts a chart account; Zubair approves it; Faiza cannot approve her own.
- [ ] Faiza previews and submits a statement import; Zubair approves it; only unmatched lines are added; nothing is
      marked paid or settled and the trial balance does not move.
- [ ] Saad: the bank import address says it is not part of his role; no ledger screen, search hit or favourite shows a
      bank name, account number, last four digits, statement line or import.
- [ ] Journals read `LSP-JV-YYYY-NNNN`; imports `LSP-BIM-YYYY-NNNN`; cost centres are E.0's (`LSP-HQ`, `LSP-LH` …).
- [ ] Posting rules: Apply is disabled with its reason; profit and loss is labelled a management view.

## 5. Connected workspace and documents (E.13) with the other areas

- [ ] Hamza: search "OP-" lists opportunities; opening one lands on Opportunity 360. Zubair: search "LSP-JV" lists
      journals; opening one opens the journal drawer. Bilal: no journal kind is offered.
- [ ] Zubair: My tasks shows the journal waiting for approval ("Review journal"); Saad never sees it as his.
- [ ] A favourite on a journal disappears when the reader loses the entity; no count reveals it.
- [ ] Haroon uploads to a Heights unit; he cannot attach a document to a lead (not part of his role).
- [ ] A unit hit opens INV-002 (the unit over its matrix), not a planned page.

## 6. Shared UI (B10)

- [ ] StatTile labels are whole at 320 px with 200 % text in EN and UR (Rentals, management home, HR).
- [ ] Rentals: tabbing to Cancel in the statement-issue dialog shows the full focus ring.

## 7. Person-only checks

- [ ] **person** NVDA (Windows) and VoiceOver (iOS) on the pipeline, matrix, journal form, documents and work queue.
- [ ] **person** A real phone in Urdu at the largest text size on Lead 360's quick view and the work queue.
- [ ] **person** A native Urdu reader checks the new labels: record kinds (opportunity, site visit, storage, ledger
      account, journal), task kinds, roles (ledger clerk, records clerk) and the two welcome lines.
