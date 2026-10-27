# V3.1 — Modular SaaS editions, access, operator control

## Business editions
**Full Developer ERP**: CRM → site visits → price versions → quotations → holds → reservations → bookings/joint buyers → installment invoices/receipts → finance/GL → construction → handover → ownership → occupancy → resident operations, plus AP/suppliers/procurement/HR/payroll.

**Community / Building-Only**: managed sites, buildings, blocks, floors, units, owners, occupancies, responsible payers, recurring maintenance assessment, services, invoices, receipts, collections, verification, bank reconciliation, requests/work orders, security/visitors, parking, amenities and notices. No mandatory developer project or sales booking required.

**Portfolio Manager**: one licensed tenant managing multiple sites/buildings, optional separate legal entities, beneficiary banks, fees and staff scopes.

**Custom Modular**: selected capabilities and add-ons with module dependency checks.

## Three distinct control planes
1. **Platform Supreme Admin** (SaaS owner): create/suspend tenants, select editions, module catalog/dependencies, module/site/feature grants, quotas, paid plans, billing components, rate cards, trials, overrides, waivers, tenant branding guardrails, domain settings, demo and preview. Configure who may use a module; not hidden access to all tenant private records.
2. **Tenant Admin**: role permissions and data scopes within grants, staff, building/sites, owner/resident records, bank beneficiary settings (verified), maintenance rules, invoices, operational approvals. Cannot grant features not licensed by Supreme Admin.
3. **End User**: language, visual preferences, high contrast, typography, motion and simplified UI; records/actions restricted by roles and verified ownership/occupancy.

## Access decision = intersection
Active tenant AND active module grant AND site/feature entitlement AND user permission AND record/data scope AND applicable workflow/state rule.
The backend/API must enforce every layer. Hiding a menu is never access control.
Command search, linked record previews and cross-context quick actions must enforce the same effective scope.

## Supreme Admin core capabilities
- Create tenant as Developer / Association / Portfolio Manager / Custom.
- Enable/disable module by tenant, site, feature, start/end date; validate dependencies and record impact.
- Meter capacity: licensed units vs registered vs active vs occupied vs eligible/billable definitions, never assume they are interchangeable.
- Define and preview subscription contract, discounts, tax, term, billing frequency, meter snapshot and effective dates.
- Grant SaaS staff audited/time-limited support access only with appropriate tenant authorization.
- Preview as tenant role (safe simulation; no unrestricted hidden impersonation).
- Show tenant health, usage, pending collections, licensing, invoices, dunning and audit.
- Suspend access through explicit policy, protecting records and retaining contractual data.

## Must not happen
- Community tenant sees developer CRM menus despite no grant.
- SaaS operator silently edits posted resident balances or posted journals.
- Existing owner/resident/property relationships are duplicated across modules.
- Missing module results in confusing dead or forbidden links.
- Tenant logo/theme blocks personal high-contrast/reduced-motion settings.
