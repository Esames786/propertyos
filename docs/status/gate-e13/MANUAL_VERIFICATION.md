# Gate E.13 — manual verification checklist (connected workspace and documents)

Branch `feature/gate-e13-connected-workspaces`. Everything below is fictional demo data. Business date:
Monday 26 October 2026. Sign in from the demo sign-in page (Larkspur Estates (Demo)).

People used:
- **Nadia Rahman** — manager, all projects, no document permission.
- **Bilal Ahmed** — sales, Larkspur Heights only, no document permission.
- **Tehmina Durrani** — document controller (new, provisional), all projects; uploads and approves templates.
- **Haroon Qadri** — site records clerk (new, provisional), Larkspur Heights only; uploads and drafts, never approves.

Screen-reader (NVDA, VoiceOver) and real-device checks are **open**: a person still has to do them. No WCAG
claim is made.

## 1. Universal search (GLOBAL-002)
- [ ] As Nadia: Ctrl+K, type `LH-A-01`; the last action reads “Search everywhere for “LH-A-01””. Choose it: the
      universal search opens with the query; units are grouped; “Show all units and flats” pages 20 at a time.
- [ ] Type a single character: “What are you looking for?” (nothing is searched).
- [ ] As Bilal: search `LG-P1` (Larkspur Gardens plots): nothing found, and no hint that something is hidden.
- [ ] Press `/` outside a field: the search field takes focus. Open “Keyboard shortcuts” and switch them off:
      `/` does nothing any more (reload keeps the choice).
- [ ] Star a result: the toast says it was added; the star stays pressed (screen reader: “toggle button, pressed”).

## 2. Recent records (GLOBAL-005) and favourites (GLOBAL-006)
- [ ] Open a lead from search, then Recent records: it is at the top under “Today”, with “Opened … · 1 time”.
- [ ] Remove one recent record; clear all (confirmation dialog states the exact effect).
- [ ] Favourites lists starred records (newest first), filter by kind and by text; unstar removes the row.
- [ ] Sign out and sign in again as the same person: both lists start empty (decision E-35, stated on the page).
- [ ] Switch to Bilal: none of Nadia’s favourites or recent records appear.

## 3. My tasks (HOME-002) and work queue (HOME-004)
- [ ] As Bilal: My tasks lists only his follow-ups and visits, grouped Overdue / Due today / Next 3 days / Later;
      each count pill filters the list; “Log follow-up” opens Lead 360 on its Activity tab.
- [ ] As Nadia: Work queue “Whose work: Other people’s” shows Bilal’s items with “With Bilal Ahmed”; project and
      text filters narrow it; the header project switcher narrows it too.
- [ ] As Tehmina: My tasks shows “Draft version 2 awaits approval” for the Heights site-visit policy (Haroon’s
      draft), never her own Allotment letter draft; document expiry tasks open the new-version drawer.

## 4. Recent activity (HOME-005)
- [ ] As Haroon: last 30 days shows Heights lead history, documents and templates only; nothing about Larkspur
      Gardens (master plan revisions, the Gardens checklist, Gardens leads).
- [ ] “Only me” shows his own actions (“You …”); “Show older activity” loads more.

## 5. Documents (DOC-002 preview, DOC-003 upload, DOC-004 versions)
- [ ] As Haroon: Documents lists 8 Heights documents (no Gardens title, file or count). Open
      `/backoffice/doc/document-preview?record=doc_lsp_0004` (a Gardens document) and `…doc_lsp_9999`
      (never issued): both say “Document not available” identically.
- [ ] Upload: “Upload a document”, pick a record by typing (only records he can work on), title, kind, a file
      (PDF/PNG/JPG/WebP/text/CSV up to 1 MB) or “Use a sample demo file”. Submit without fields: inline errors
      and a spoken summary; an identity document without expiry is refused inline. The toast says the file is a
      demo file kept in this browser; the document opens.
- [ ] Upload a new version with “What changed”: preview shows the new content; Versions tab lists both;
      “Preview version 1” shows the old content. DOC-004 compares any two versions (Changed / Same, text, not
      colour alone).
- [ ] “Download demo file” saves the file (or the generated page as text for seeded documents).
- [ ] On the document page `U` opens the new-version drawer and `F` toggles the favourite (shortcuts switchable).
- [ ] Related tab: the linked record, its related records (customer, project, other leads) and its other documents.

## 6. Expiring documents (DOC-005)
- [ ] As Tehmina: “Within 30 days” lists 3 (4, 10 and 20 days), “Expired” lists 2; each pill shows its own
      count; “Upload renewal” opens the new-version drawer for that document.
- [ ] As Haroon: only Heights documents are listed or counted.

## 7. Templates and policies (DOC-006)
- [ ] As Tehmina: “1 draft is waiting for your approval”. Her own Allotment letter draft shows “You drafted this
      version: another person approves it” and no Approve button. Approve Haroon’s Heights policy draft: it
      becomes “Approved, takes effect later” (1 November). Returning needs a reason.
- [ ] As Haroon: draft a new version while one is pending: refused (“waiting for approval”); he cannot draft for
      organisation-wide templates (button absent) and never sees the Gardens checklist.

## 8. Revocation (prototype switch)
- [ ] As Tehmina, star the Gardens master plan. In the browser console run
      `sessionStorage.setItem('demo:site-scope', JSON.stringify({ lsp_doc_controller: ['site_lk_heights'] }))`
      and reload Favourites: the entry is gone, with no count and no title. Remove the key: it returns.

## 9. Without the document permission
- [ ] As Nadia or Bilal: every `/backoffice/doc/...` E.13 address shows “not part of your role”; search offers no
      documents; the workspace screens work.

## 10. Languages, layout, themes
- [ ] Urdu: every E.13 screen right-to-left, references and file names left-to-right inside Urdu text.
- [ ] 320 px with 200 % text (Preferences → text size) in both languages: lists, no tables; nothing clipped.
- [ ] Dark mode and high contrast: badges keep their words and icons.
- [ ] NVDA (Windows) and VoiceOver (iOS/macOS): **open — not yet done by a person.**
