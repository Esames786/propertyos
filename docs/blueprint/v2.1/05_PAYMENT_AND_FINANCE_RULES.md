# PropertyOS — Pakistan Payment Architecture & Finance Integrity V2

## Release decision
V1: **Manual bank transfer + one prospective Safepay integration**. Do not integrate five gateways individually at the beginning. Capability ≠ actual onboarded merchant payment method: display only rails the particular developer/merchant has enabled and contracted for.

## Company/account separation
Developer customer payments for property installments/maintenance should settle into a legally approved **developer/community merchant account**. PropertyOS SaaS subscription and implementation revenue use PropertyOS's own collection arrangement.

Never silently pool multiple tenant developers' customer funds in PropertyOS's standard bank account. Provider-specific aggregator/split settlement needs written approval, eligibility checks, and compliance review.

## Proposed provider abstraction (backend later)
PaymentMethodAvailability / MerchantConnection / PaymentPolicy
PaymentIntent / GatewayTransaction / GatewayWebhookEvent
PaymentEvidence / VerificationDecision / Payment / Allocation / Receipt
Refund / Reversal / Chargeback / Settlement / Reconciliation

Possible adapters:
- ManualBankTransfer (V1)
- Safepay (V1 subject to merchant onboarding and sandbox verification)
- PayFast, Meezan, JazzCash, Easypaisa (later only on demand)

## Manual proof steps
Invoice issued → beneficiary bank/IBAN and reference shown → customer initiates transfer using their own banking app → uploads screenshot/transaction reference, date, amount → `SUBMITTED` → `UNDER_REVIEW` → finance matches against bank record → `VERIFIED` or `REJECTED` / `NEEDS_INFORMATION` → confirmed Payment → Allocation → Receipt → accounting event.

Do not mark `PAID` based on uploaded evidence alone.

## Gateway steps
Customer chooses available payment rail → backend creates intent with unique idempotency key → hosted/provider checkout → gateway notifies backend → signature and amount/merchant/transaction checks → deduplicated transaction → authoritative confirmed payment → invoice allocation → receipt/accounting event → notification.

A redirect to `success` URL alone must not mark the financial record paid. Handle `pending`, `unknown`, duplicate webhook, missing webhook, timeout, reversal, refund and dispute.

## Amounts, fee transparency and eligibility
Small maintenance/parking/service amounts might use gateway/wallet/card. Large installments more often use bank collection/Raast under tenant policy. Fees/taxes and the parties bearing them need explicit merchant contracts, disclosure, and validation. No invented production prices or settlement promises.

## Saved card
Only gateway token/reference plus allowable masked info; never PAN/CVV. Saved method/recurring debit only if provider enables and user consents.

## Company finance
Tenant chart of accounts, fiscal periods, ledgers, project/cost center accounting, AR/AP, suppliers, purchase bills, utility bills, reimbursements, bank accounts, reconciling transactions, payroll posting, budgets, expense categories, GL reports, profit and loss, balance sheet, aging and cash flow.

Financial posting should be central and configurable; posted journals are immutable and reversed to correct. Booking does not automatically mean full property revenue recognition. Specialist/local accounting and tax validation required before production.

## UX prototypes now
Mock card checkout, Raast, wallet and manual transfer states **visibly labeled DEMO**. Use fictional banking and account data; do not include working beneficiary details, live merchant IDs, secret keys, real charge operations or real login credentials.

## Provider due diligence before implementation
Confirm exact supported methods for merchant, whether customer/developer is merchant of record, onboarding requirements, account settlement, refund/chargeback support, webhooks/signatures, test environment, transaction pricing and limits, recurring capabilities, service uptime, fallback.

Sources for engineering verification:
- https://safepay.mintlify.app/
- https://safepay.helpscoutdocs.com/article/118-merchant-onboarding-form
- https://www.sbp.org.pk/our-subsidiaries/raast/join-raast
- https://www.sbp.org.pk/our-operations/payment-systems
