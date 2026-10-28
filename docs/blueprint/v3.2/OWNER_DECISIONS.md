# V3.2 proposal: decisions for the owner

**How to read this.**
- Numbering continues from the Gate A decisions (D-1 to D-20).
- Each decision has a recommendation; reply with "approve", or name an alternative.
- **Blocks** says what cannot start until the decision is made.
- Nothing in V3.2 starts until D-21, D-23, D-24 and D-43 are settled.

## A. Scope, modules and sequence

| # | Decision | Recommendation | Alternatives | Blocks |
|---|---|---|---|---|
| **D-21** | Add four catalogue modules: `community_chat`, `community_hub`, `safety`, `rentals` (27 → 31) | **Approve.** Each has its own cost, legal duties or business line, so HQ must license, price and restrict it separately | (a) Fold chat and the hub into `communications` as features: fewer modules, no separate pricing. (b) Defer some modules entirely | All new-module milestones |
| **D-22** | Offer `hr` and `payroll` to community and portfolio editions as **add-ons** (one module, edition-aware screens) | **Approve.** No separate "society staff" module | Keep them developer-only (societies wait for Gate E) | S.2 |
| **D-23** | Milestone order | **D.1 → S.1 → D.2 → D.3 → S.2 → S.3 → (safety review) → S.4 → E → F → G → H.** S.1 comes early because it extends the fresh C.2 engine and holds most of the P0 finance items | Issue #2's order: D.1 → D.2 → D.3 → S.1 → … (finance after all of Gate D) | D.1 start |
| **D-24** | Split Gate D (now 50 distinct screens) into D.1, D.2 and D.3, with an owner checkpoint after each | **Approve.** Same pattern as C.1/C.2 | One Gate D with a mid-point checkpoint | D.1 start |
| **D-43** | Register baseline and adoption | **Rebase the delta on the committed C.2 register. Then apply only each milestone's rows when that milestone starts** (D-19 pattern). Counting rule unchanged: only rows whose canonical ID is themselves count | Apply the whole delta at once (adds 32 planned screens and 25 states immediately) | Register sync |
| **D-44** | Prices for the new add-ons | **The Supreme Admin creates the rate-card components in HQ.** This proposal invents no prices. Suggested metered dimensions are in the matrix §4 | — | Commercial demos of the add-ons |

## B. Privacy, community and communication

| # | Decision | Recommendation | Alternatives | Blocks |
|---|---|---|---|---|
| **D-25** | Chat policies | **(1)** Direct messages between residents **off** by default; a tenant may turn them on. **(2)** New members see history from their join date only. **(3)** Moderators reach messages only through reports. **(4)** Default retention 24 months, tenant-configurable. **(5)** Chat takes the phone's centre button only if licensed **and** the tenant chooses it; otherwise Pay stays central | DMs on by default; full history for new members (rejected by Issue #2: "no automatic historical disclosure") | D.3 |
| **D-27** | Login status visibility and invitation channels | **Only permitted staff; date granularity ("last active 3 Nov"); never visible to residents.** Channels: simulated WhatsApp/SMS with consent, printed codes, in-person | Time-level activity (rejected: profiling) | D.1 |
| **D-28** | Community complaints model | **One request entity with `kind` (repair \| community issue)**, sharing the maintenance workflow and work orders | A separate complaints module | D.2 |
| **D-30** | Polls | **Informal polls and surveys only**, labelled "not a formal vote under the bylaws". Formal AGM ballots and elections deferred until a bylaw and legal review | Build formal voting now | D.3 |
| **D-31** | Marketplace | **Build in D.3 behind `community_hub.marketplace`, off by default**: pre-moderation, prohibited items, expiry, no payments, contact in-app only | Defer the marketplace entirely (recommended if D.3 needs trimming) | D.3 (CMTY-003) |
| **D-32** | Services directory | **Vetted providers only; the provider's consent for contact details; recommendations as counts (no free-text reviews); disclaimer** | Allow resident reviews (needs moderation and defamation review) | D.3 |
| **D-38** | Society finance visible to residents | **Only committee-approved aggregate summaries** (income, expense, surplus, cash position). **A resident-visible defaulter list is rejected** | No resident finance view at all | D.3 (Society accounts tab) |
| **D-39** | Resident "standing" | **Private and opt-in only**: "your account is up to date" on the resident's own screen. No public badges or rankings | Drop it entirely | S.1 (PORTAL-004 card) |
| **D-40** | Data export and deletion | **Export:** an administrator requests, the treasurer (or a second administrator) approves; files expire in 7 days; audited. **Deletion:** non-financial personal data is anonymised; financial records are kept for the statutory period (adviser to confirm) | Self-serve export without approval (rejected: bulk personal data) | D.1 |
| **D-41** | App switching | **Allowed** for people holding both a staff role and a verified resident link. Audited; separate scopes and caches. A tenant administrator may disable it for specific roles | Separate accounts per role | D.1 |

## C. Money, governance and legal

| # | Decision | Recommendation | Alternatives | Blocks |
|---|---|---|---|---|
| **D-29** | Approval policies (committee spend thresholds) | **No default amounts in the product.** Each tenant configures versioned rules (subject, amount band, approver office or role, number of approvals) with maker-checker on the policy itself. Demo fixtures use clearly illustrative values | Ship default thresholds | S.1 |
| **D-33** | Rentals money and legal model | **(1)** Payouts are **recorded, never sent** in the prototype. **(2)** Collecting rent on an owner's behalf requires a management agreement with written authority (extends D-15). **(3)** Who issues the rent invoice (the landlord, or the manager as agent) is decided with a legal and tax adviser before S.3 builds the invoice header. **(4)** Rent tax withholding is a labelled placeholder until confirmed | Manager issues all rent invoices in its own name now | S.3 |
| **D-34** | Cashbook without the accounting module | **The cashbook is a projection of payments, expenses, transfers, payroll and payouts. Manual entries are allowed only when `payables` is not granted. One period lock per legal entity, shared with accounting** | A separate simple ledger (rejected: two ledgers) | S.1 |
| **D-35** | Bulk cash controls | **Batch with counted total = sum of lines; a second person confirms before any payment or receipt exists; cheques show as "cheque received" until cleared (status only)** | Receipts at the moment of entry (rejected: weakens "never Paid") | S.1 |
| **D-36** | Reminder defaults | **In-app always; SMS/WhatsApp only with consent (metered); quiet hours 21:00–09:00; at most 3 per month per payer; never when paid or a proof is pending; no late-fee wording unless late fees are enabled (D-11)** | Tenant-only configuration with no defaults | S.1 |
| **D-37** | Resident credit and wallet | **Show unapplied credit and allow paying in advance through the existing transfer-and-verify flow; auto-apply only by site policy. A funded wallet (top-up, withdrawal, peer transfer) is deferred** until financial and legal review (it may be regulated e-money) | Build a demo wallet (rejected: "never fake a funded digital wallet") | S.1 |
| **D-42** | Transfer and clearance fees | **A fee needs a bylaw reference and an effective-dated policy; a clearance certificate needs a zero liable balance or an approved waiver; fee lawfulness reviewed by an adviser before Gate H** | Fixed platform default fee (rejected) | S.1 |

## D. Safety

| # | Decision | Recommendation | Alternatives | Blocks |
|---|---|---|---|---|
| **D-26** | SOS safety review | **No SOS screen until a written safety design is approved by the owner (and a safety adviser if the owner chooses).** Until then `safety` is *restricted* in the catalogue. The prototype will always show national emergency numbers (15 police, 1122 rescue where available; configurable) and never say help is on the way | Build a demo SOS now (rejected by Issue #2) | S.4 |

## E. Already decided (kept for reference)

These rulings carry over into V3.2 unchanged:
- Frontend first.
- No defaulter lists to residents.
- Never mark proofs as Paid.
- The association's money is never the SaaS company's.
- Maker-checker by principal.
- Configurable, versioned commercial policies.
- Mandatory personal accessibility preferences.
- Late fees off by default (D-11).
- Collection on behalf only with written authority (D-15).
- No merge to `main`.
