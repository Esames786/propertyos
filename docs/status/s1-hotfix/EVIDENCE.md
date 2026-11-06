# S.1 hotfix (Issue #18): evidence

Screenshots in `screenshots/`, produced by `tests/evidence/s1hotfix.evidence.spec.ts` on the final
production build (`E2E_PORT_OFFSET=800`, business date Monday 26 October 2026, reduced motion). Each
file's width is the viewport in its name (1440, 390 or 320 px). No other gate's evidence was re-run,
so their committed screenshots are unchanged.

## FIN-01: Imran (building manager, no bank feed)

| File | What it shows |
|---|---|
| `a01-bank002-imran-lines-deeplink-1440-{en,ur}.png` | BANK-002 opened by `?record=ben_anr_main&tab=lines`: the overview, "Bank details are for finance" with the reason, three tabs (Overview, Cashbook, History); the account number masked `•••• 7890`; balance and movements kept |
| `a02-fin009-imran-read-only-1440-{en,ur}.png` | FIN-009 read-only (A-305): the proof, its state and history, "Bank statement lines are for finance staff with bank access…" where the candidate lines were; payee masked |
| `a03-fin009-imran-exception-1440-{en,ur}.png` | FIN-009 for B-405 waiting on an exception that names another payer's transfer: who asked and what does not match, never the line, its bank id or counterparty |
| `a04-finance-dashboard-imran-1440-{en,ur}.png` | FIN-001: no "Bank lines not reconciled" tile (a sentence instead); "Bank settled" opens the cashbook; account rows masked |
| `a05-cashbook-imran-1440-{en,ur}.png` | BANK-007: settled lines kept, bank ones "Statement line" without an id; the statement comparison replaced by the reason |
| `a06-close-checklist-imran-1440-{en,ur}.png` | BANK-008: "Bank lines matched" shows its outcome and "count and amount for finance staff with bank access", no link |
| `b01-bank002-imran-320-200pct-{en,ur}.png`, `b02-fin009-imran-320-200pct-{en,ur}.png` | the same two screens at 320 px with text at 200 % |
| `b03-bank002-imran-dark-contrast-390-{en,ur}.png`, `b04-fin009-imran-dark-contrast-390-{en,ur}.png` | dark mode with high contrast at 390 px |

## FIN-01: the finance roles keep the flow

| File | What it shows |
|---|---|
| `c01-bank002-ayesha-lines-1440-en.png` | Ayesha (bank.view): the Statement lines tab with every line, bank id and counterparty, five tabs |

## FIN-02: a second create in the same visit

| File | What it shows |
|---|---|
| `d01-second-voucher-toast-1440-en.png` | Two vouchers created in one cashbook visit: two toasts, `ANR-CV-2026-0005 sent for approval` and `ANR-CV-2026-0006 sent for approval` |
| `d02-new-transfer-drawer-empty-again-1440-en.png` | "Prepare a deposit or transfer" opened a second time in the same visit: the form is empty again |
| `d03-second-deposit-opened-1440-en.png` | The second deposit opened as its own instruction |
| `d04-second-deposit-toast-1440-en.png` | Back on the list: two instructions (2,000 and 1,500) and two toasts, `ANR-TRF-2026-0001 sent for approval` and `ANR-TRF-2026-0002 sent for approval` (a toast raised as a drawer opens waits until it closes) |

Manual QA (screen readers, real devices) was not done; no WCAG conformance is claimed.
