#!/usr/bin/env node
/**
 * Gate A (V3.1) documentation tool, not part of the build.
 *
 * HISTORICAL (Gate A). Reads the archived V2.1 tracking register (docs/ui/archive/…) and writes the
 * PROPOSED reconciled register docs/blueprint/v3.1/gate-a/screen-register-v3.1-proposed.csv with the
 * fields V3.1 doc 06 requires. The live register is not modified; after owner approval the proposal
 * replaces it at the start of Gate B (with register.generated.ts and register.spec updated together).
 *
 * Usage: node scripts/gate-a-register-proposal.mjs [--stats]
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Historical input: the V2.1 tracking register as it was at Gate A (archived when the V3.1 register was adopted).
const LIVE = 'docs/ui/archive/screen-register-v2.1-tracking.csv';
const OUT = 'docs/blueprint/v3.1/gate-a/screen-register-v3.1-proposed.csv';

// ---------------------------------------------------------------- CSV helpers
function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const out = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cell); cell = ''; }
      else cell += ch;
    }
    out.push(cell);
    rows.push(out);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])));
}
const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---------------------------------------------------------------- columns (V3.1 doc 06 "Required screen register fields")
const COLUMNS = [
  'screen_id', 'name', 'application', 'tenant_edition', 'module', 'feature_grant', 'min_permission', 'data_scope',
  'surface', 'route', 'status', 'disposition', 'canonical_id', 'core_entity', 'tabs', 'linked_records', 'actions',
  'validation', 'states', 'mock_api', 'gate', 'tests', 'sr_mobile_rtl_evidence', 'notes',
];

const STATUS = { implemented: 'BUILT', partial: 'PARTIAL', planned: 'PLANNED' };
const LATER = (g) => `Specified at Gate ${g}`;
const EVIDENCE_BUILT = 'axe EN/UR desktop+phone in E2E; screenshots in docs/status; manual screen reader pending';
const EVIDENCE_TODO = 'Required at gate: axe EN/UR 1440+390, 320 reflow, keyboard path, screenshots; manual SR checklist';

// ---------------------------------------------------------------- domain defaults for legacy rows
const APP = { backoffice: 'backoffice', shared: 'shared-auth', saas: 'platform-hq', customer: 'customer-web', public: 'public-site' };
const DOMAIN = {
  GLOBAL: { edition: 'ALL', module: 'core', perm: '(signed in)', scope: 'own user', entity: '-', gate: 'E' },
  AUTH: { edition: 'ALL', module: 'core', perm: '(public)', scope: 'anonymous', entity: 'global_user', gate: 'G' },
  SAAS: { edition: 'HQ', module: 'platform', perm: 'platform.*', scope: 'platform', entity: 'tenant', gate: 'B' },
  HOME: { edition: 'ALL', module: 'core', perm: '(signed in)', scope: 'own user + granted modules', entity: '-', gate: 'E' },
  CRM: { edition: 'DEV', module: 'crm', perm: 'lead.view', scope: 'project + assigned', entity: 'lead', gate: 'E' },
  PRJ: { edition: 'DEV', module: 'projects', perm: 'project.view', scope: 'project', entity: 'project', gate: 'E' },
  INV: { edition: 'DEV', module: 'inventory', perm: 'unit.view', scope: 'project', entity: 'unit_inventory', gate: 'E' },
  COM: { edition: 'DEV', module: 'sales', perm: 'pricing.manage', scope: 'project', entity: 'payment_plan_template', gate: 'E' },
  BKG: { edition: 'DEV', module: 'sales', perm: 'booking.view', scope: 'project', entity: 'booking', gate: 'E' },
  CUS: { edition: 'DEV+COMM', module: 'core', perm: 'party.view', scope: 'site/project', entity: 'party', gate: 'E' },
  OWN: { edition: 'DEV+COMM', module: 'residents', perm: 'ownership.view', scope: 'site', entity: 'ownership', gate: 'E' },
  COL: { edition: 'DEV+COMM', module: 'receivables', perm: 'collections.view', scope: 'legal entity + site', entity: 'customer_invoice', gate: 'E' },
  FIN: { edition: 'DEV+COMM', module: 'receivables', perm: 'invoice.view', scope: 'legal entity + site', entity: 'customer_invoice', gate: 'E' },
  ACC: { edition: 'DEV+COMM', module: 'accounting', perm: 'gl.view', scope: 'legal entity', entity: 'journal_entry', gate: 'E' },
  BANK: { edition: 'DEV+COMM', module: 'banking', perm: 'bank.view', scope: 'legal entity', entity: 'bank_account', gate: 'E' },
  SUP: { edition: 'DEV+COMM', module: 'payables', perm: 'supplier.view', scope: 'legal entity', entity: 'supplier_bill', gate: 'E' },
  EXP: { edition: 'DEV+COMM', module: 'payables', perm: 'expense.view', scope: 'legal entity + cost centre', entity: 'expense', gate: 'E' },
  PROC: { edition: 'DEV', module: 'procurement', perm: 'procurement.view', scope: 'legal entity + project', entity: 'purchase_order', gate: 'E' },
  HR: { edition: 'DEV', module: 'hr', perm: 'hr.view', scope: 'legal entity', entity: 'employee', gate: 'E' },
  PAY: { edition: 'DEV', module: 'payroll', perm: 'payroll.view', scope: 'legal entity', entity: 'payroll_run', gate: 'E' },
  DOC: { edition: 'ALL', module: 'core', perm: 'document.view', scope: 'per linked record', entity: 'document', gate: 'E' },
  APR: { edition: 'ALL', module: 'core', perm: 'approval.view', scope: 'assigned approver', entity: 'approval', gate: 'E' },
  CON: { edition: 'DEV', module: 'construction', perm: 'construction.view', scope: 'project', entity: 'construction_update', gate: 'E' },
  HND: { edition: 'DEV', module: 'handover', perm: 'handover.view', scope: 'project', entity: 'handover', gate: 'E' },
  MNT: { edition: 'DEV+COMM', module: 'maintenance', perm: 'maintenance.view', scope: 'site', entity: 'maintenance_request', gate: 'D' },
  RES: { edition: 'DEV+COMM', module: 'residents', perm: 'residents.view', scope: 'site', entity: 'occupancy', gate: 'D' },
  VIS: { edition: 'DEV+COMM', module: 'visitors', perm: 'visitors.view', scope: 'site', entity: 'visitor_pass', gate: 'D' },
  PARK: { edition: 'DEV+COMM', module: 'parking', perm: 'parking.view', scope: 'site', entity: 'parking_space', gate: 'G' },
  AMN: { edition: 'DEV+COMM', module: 'amenities', perm: 'amenities.view', scope: 'site', entity: 'amenity_booking', gate: 'G' },
  NOT: { edition: 'ALL', module: 'communications', perm: 'communications.view', scope: 'site', entity: 'communication_message', gate: 'G' },
  RPT: { edition: 'per source module', module: 'reports', perm: 'reports.view', scope: 'per source module', entity: 'report', gate: 'E' },
  ADM: { edition: 'ALL', module: 'core', perm: 'admin.view', scope: 'tenant', entity: '-', gate: 'G' },
  PORTAL: { edition: 'DEV+COMM', module: 'resident_portal', perm: 'portal.use', scope: 'own verified units and billing accounts', entity: '-', gate: 'D' },
  WEB: { edition: 'DEV', module: 'public_website', perm: '(public)', scope: 'published data', entity: 'project', gate: 'F' },
  GUIDED_ONBOARDING: { edition: 'ALL', module: 'core', perm: '(signed in)', scope: 'own user', entity: 'user_onboarding_progress', gate: 'built' },
};

// ---------------------------------------------------------------- per-row reconciliation of the 321 legacy rows
// d = disposition: keep | merge->ID | state-of->ID | supersede->ID ; status override records a correction.
const L = {
  // GLOBAL
  'GLOBAL-001': { tests: 'command-palette.spec; a11y.spec', notes: 'Gate B: results filtered by effective access (module grants, sites), same rule as the API' },
  'GLOBAL-003': { tests: 'permissions.spec; shell.spec', notes: 'Gate B: every item declares requires {modules, permission}' },
  'GLOBAL-004': { tests: 'shell.spec; a11y.spec' },
  'GLOBAL-007': { tests: 'a11y.spec' },
  'GLOBAL-008': { name: 'Profile', gate: 'D', notes: 'Preferences part merges into GLOBAL-010; this row keeps the profile (name, contact, sign-in methods)' },
  'GLOBAL-009': { d: 'state-of->GLOBAL-010', tests: 'locale.spec', notes: 'Header language action + language tab of GLOBAL-010' },
  'GLOBAL-010': { name: 'Appearance & accessibility (personal)', status: 'PARTIAL', correction: 'BUILT->PARTIAL against V3.1 scope', gate: 'D', tests: 'locale.spec; a11y.spec',
    tabs: 'Language; Text size (100-200%); Theme (light/dark/system/high contrast); Palette; Density; Motion & sound; Reading mode; Guided tours; Notifications',
    notes: 'Built for V2.1 (motion, contrast, sound, text-only guide). V3.1 adds font scale, theme, palettes, density, reading mode, haptics, Urdu font. One shared component for HQ, backoffice and portal' },
  // AUTH
  'AUTH-001': { notes: 'Prototype uses demo sign-in (ENTRY-004); real authentication is Gate H' },
  'AUTH-005': { notes: 'Needed when one global user has several tenant memberships (A2 9.1)' },
  'AUTH-006': { app: 'customer-web', gate: 'D', notes: 'Prototype uses demo sign-in (ENTRY-005)' },
  // SAAS -> HQ family
  'SAAS-001': { d: 'supersede->HQ-001' }, 'SAAS-002': { d: 'supersede->HQ-002' }, 'SAAS-003': { d: 'supersede->HQ-004' },
  'SAAS-004': { d: 'supersede->HQ-003' }, 'SAAS-005': { d: 'supersede->HQ-006', notes: 'Split into HQ-006 catalogue and HQ-010 rate cards' },
  'SAAS-006': { d: 'supersede->HQ-017', notes: 'Split into HQ-011 contract builder and HQ-017 central invoices' },
  'SAAS-007': { d: 'supersede->HQ-021' }, 'SAAS-008': { d: 'supersede->HQ-023' },
  'SAAS-009': { d: 'supersede->HQ-020', notes: 'Split into HQ-020 support access and HQ-019 billing audit' }, 'SAAS-010': { d: 'supersede->HQ-014' },
  // HOME
  'HOME-001': { gate: 'built; C extends', tests: 'dashboard.spec; a11y.spec; reflow.spec',
    states: 'Role compositions: manager, sales, finance (built); building manager, treasurer, accounts officer (Gate C)',
    notes: 'Gate C adds the collections-first society composition; widgets declare required modules' },
  'HOME-003': { d: 'merge->APR-001' },
  // CRM
  'CRM-001': { tests: 'crm.spec; a11y.spec; reflow.spec' }, 'CRM-002': { tests: 'crm.spec; a11y.spec; reflow.spec' },
  'CRM-003': { tests: 'crm.spec; a11y.spec; reflow.spec', tabs: 'Overview; Activity; Visits; Matching units' },
  'CRM-004': { tests: 'crm.spec; a11y.spec' }, 'CRM-010': { tests: 'crm.spec; a11y.spec' },
  'CRM-005': { d: 'state-of->CRM-002', surface: 'drawer' },
  'CRM-006': { surface: 'drawer' },
  'CRM-016': { status: 'PARTIAL', correction: 'PLANNED->PARTIAL: 48 h hold works from the unit quick view in CRM-003', surface: 'drawer' },
  // PRJ / INV
  'PRJ-002': { tabs: 'Overview; Leads; Units; Bookings; Collections; Finance; Expenses; Suppliers; Construction; Handover; Residents; Maintenance; Documents; Analytics; Activity' },
  'PRJ-004': { d: 'merge->SITE-003', notes: 'One structure explorer for both editions' },
  'PRJ-005': { d: 'state-of->SITE-003', surface: 'drawer' }, 'PRJ-006': { d: 'state-of->SITE-003', surface: 'drawer' },
  'PRJ-007': { d: 'merge->SITE-005' },
  'INV-002': { status: 'PARTIAL', correction: 'PLANNED->PARTIAL: unit quick view drawer reachable from CRM-003 matching units', surface: 'drawer' },
  'INV-003': { d: 'merge->SITE-006', notes: 'Shared Unit 360; sales tabs appear only when inventory/sales are granted' },
  'INV-004': { d: 'state-of->SITE-003', surface: 'drawer' }, 'INV-005': { d: 'merge->SITE-004' }, 'INV-009': { d: 'merge->PARK-002' },
  // CUS -> shared People
  'CUS-001': { name: 'People directory (Customers / Owners & residents)', gate: 'C', perm: 'party.view',
    tabs: 'Role filter: all, owners, occupants, payers, customers, suppliers', actions: 'Search; filter by role/site; open person; add person (drawer)',
    linked_records: 'Units; billing accounts; ownerships; occupancies', mock_api: 'GET /people?role=&site=&q=',
    tests: 'Gate C: role filter; scope (security guard denied); EN/UR', notes: 'Label by tenant type (A1 7)' },
  'CUS-002': { d: 'state-of->CUS-001', surface: 'drawer', gate: 'C', mock_api: 'GET /people/:id' },
  'CUS-003': { name: 'Person 360 workspace', gate: 'C',
    tabs: 'Overview; Properties (ownership/occupancy); Billing accounts; Statement; Payments; Requests (D); Sales: leads/bookings (E, DEV); Documents; Activity',
    linked_records: 'Units; billing accounts; invoices; payments; submissions', mock_api: 'GET /people/:id',
    tests: 'Gate C: owner vs tenant-payer view; scope', notes: 'Tabs shown per granted module' },
  'CUS-005': { d: 'state-of->CUS-003', surface: 'tab' }, 'CUS-006': { d: 'state-of->CUS-003', surface: 'tab', gate: 'C' },
  'CUS-007': { d: 'state-of->CUS-003', surface: 'tab' }, 'CUS-008': { d: 'state-of->CUS-003', surface: 'tab', gate: 'C', notes: 'Uses the shared statement (COL-004)' },
  // OWN
  'OWN-002': { d: 'state-of->SITE-006', surface: 'tab', gate: 'C' }, 'OWN-005': { d: 'state-of->SITE-006', surface: 'tab', gate: 'C' },
  // COL / FIN
  'COL-001': { gate: 'C', name: 'Collections dashboard', states: 'Per site; per period; loading/empty/error',
    actions: 'Open pending proofs; open aging; open run; switch site', mock_api: 'GET /collections/summary?site=&period=',
    tests: 'Gate C: figures update after verification; billed vs collected vs pending', notes: 'Society: canonical "Collection Dashboard"' },
  'COL-002': { d: 'merge->FIN-002', notes: 'Receivables = invoices list filtered to open' },
  'COL-004': { gate: 'C', name: 'Account statement', core_entity: 'billing_account',
    states: 'Opening balance; charges; credits; payments; closing; per period', mock_api: 'GET /statements/:billingAccountId?from=&to=',
    tests: 'Gate C: A-101 5,200 example; after payment 0; partial 2,200', notes: 'Canonical statement reused by CUS-008, BILL-002, PORTAL-029' },
  'COL-005': { gate: 'C', name: 'Aging and arrears', mock_api: 'GET /collections/aging?site=',
    states: 'Buckets current/1-30/31-60/61-90/90+; by account; by flat; credit shown separately', tests: 'Gate C: bucket totals; scope' },
  'FIN-002': { gate: 'C', actions: 'Filter by site/status/source/period; open invoice', mock_api: 'GET /invoices?site=&status=&source=',
    states: 'Issuance (draft/issued/cancelled) + derived settlement (unpaid/partial/paid) + overdue', tests: 'Gate C: source filter separates dues from instalments' },
  'FIN-003': { gate: 'C', tabs: 'Overview; Lines; Allocations; Payments; Credit notes; Accounting status (E); Documents; Activity',
    actions: 'Issue credit note (approval); print; open statement', validation: 'Posted invoice has no edit action (state_locked)',
    mock_api: 'GET /invoices/:id; POST /invoices/:id/credit-notes', tests: 'Gate C: credit note instead of edit; source shown' },
  'FIN-005': { gate: 'C', mock_api: 'GET /payments?site=' },
  'FIN-006': { gate: 'C', tabs: 'Overview; Allocations; Source (submission/office/gateway); Receipt; Reconciliation; Activity', mock_api: 'GET /payments/:id' },
  'FIN-007': { gate: 'C', name: 'Record office payment (cash/cheque)', feature: 'receivables.office_collections', perm: 'payment.receive.office',
    validation: 'Method allowed by site rules; amount > 0; cheque number/bank for cheques', states: 'Cash: confirmed; cheque: pending_clearance -> cleared/bounced',
    mock_api: 'POST /payments/office', tests: 'Gate C: denied when site rules disallow; receipt issued' },
  'FIN-008': { gate: 'C', name: 'Payment proofs queue', perm: 'finance.evidence.review',
    states: 'SUBMITTED; UNDER_REVIEW; NEEDS_INFORMATION; REJECTED; VERIFIED', mock_api: 'GET /payment-submissions?state=&site=',
    tests: 'Gate C: queue counts; scope by site' },
  'FIN-009': { gate: 'C', surface: 'workspace', name: 'Proof review and verification', perm: 'finance.evidence.review',
    actions: 'Start review; match bank transaction; adjust allocation; verify; reject (reason); request information',
    validation: 'Amount/date window; destination = verified beneficiary of the same legal entity; bank transaction (account-scoped identity) not already matched; line allocations <= payment; no cross-entity allocation',
    mock_api: 'POST /payment-submissions/:id/{start-review,verify,reject,request-info}', tests: 'Gate C: verify -> payment -> receipt -> statement; reuse of a matched bank transaction refused; reject path' },
  'FIN-011': { gate: 'C', notes: 'Gate C shows unapplied credit; refunds are Gate E' },
  'FIN-012': { d: 'supersede->BILL-005', notes: 'Replaced by the dues billing family' },
  'BANK-003': { gate: 'C', name: 'Bank transaction feed (mock import)', mock_api: 'GET /bank-transactions?account=&status=' },
  'BANK-004': { gate: 'C', mock_api: 'GET /bank-transactions; POST /bank-reconciliation/matches',
    states: 'Matched; suggested; unmatched; unidentified receipts', tests: 'Gate C: verified payment shows matched' },
  'EXP-009': { notes: 'Canonical for RPT-014' },
  // RES / NOT / RPT / ADM
  'RES-002': { name: 'Units & payers roster', gate: 'C', core_entity: 'billing_account',
    actions: 'Filter by block/floor/occupancy/payer; open unit; open account; change payer (effective-dated drawer)',
    mock_api: 'GET /billing-accounts?site=&q=', tests: 'Gate C: owner vs occupant vs payer distinct', notes: 'Canonical for V3.1 "Units/Payers"' },
  'RES-003': { d: 'state-of->SITE-006', surface: 'tab' }, 'RES-006': { d: 'merge->RES-005' },
  'RES-005': { name: 'Notices and announcements', notes: 'Canonical (compose + list)' },
  'NOT-006': { d: 'state-of->GLOBAL-010', surface: 'tab', gate: 'D' },
  'RPT-004': { d: 'merge->COL-005' }, 'RPT-007': { d: 'merge->ACC-006' }, 'RPT-008': { d: 'merge->ACC-007' },
  'RPT-009': { d: 'merge->ACC-008' }, 'RPT-011': { d: 'merge->COL-005' }, 'RPT-014': { d: 'merge->EXP-009' },
  'RPT-010': { correction: 'template wizard->report (register error)' },
  'ADM-006': { notes: 'Role editor lists only permissions of granted modules (A1 4)' },
  'ADM-007': { notes: 'Matrix columns limited to granted modules; Gate B proves via API test' },
  'ADM-008': { name: 'Organisation & legal entities', notes: 'Legal entities own books, payee and numbering (A2 9.4)' },
  'ADM-015': { d: 'supersede->BILL-012' }, 'ADM-016': { d: 'supersede->BILL-010' },
  'ADM-017': { d: 'supersede->BILL-011' }, 'ADM-018': { d: 'merge->BILL-012' },
  // PORTAL
  'PORTAL-001': { gate: 'built; C extends', tests: 'portal.spec; a11y.spec',
    states: 'Instalments variant (built); dues variant "This month\'s bill" (Gate C); several accounts', notes: 'Gate C: edition-aware home' },
  'PORTAL-002': { notes: 'Multi-unit owner switch' },
  'PORTAL-004': { gate: 'built; C extends', tests: 'portal.spec', states: 'Instalments (built); bills per billing account (Gate C)' },
  'PORTAL-005': { name: 'Bill / invoice breakdown', gate: 'C', mock_api: 'GET /portal/bills/:invoiceId',
    states: 'Charges by category; opening balance shown separately; paid/partial/unpaid', tests: 'Gate C: 4,200 + 1,000 = 5,200 shown in EN/UR' },
  'PORTAL-006': { d: 'state-of->PORTAL-008', notes: 'upload-proof-mock?mode=online; dues online mock in Gate D (BILL-011 must be configured)' },
  'PORTAL-009': { d: 'state-of->PORTAL-004', notes: 'payments-dashboard?status=paid' },
  'PORTAL-016': { d: 'state-of->PORTAL-015', surface: 'tab' }, 'PORTAL-017': { d: 'state-of->PORTAL-015', surface: 'drawer' },
  'PORTAL-019': { d: 'state-of->PORTAL-015', surface: 'tab' }, 'PORTAL-020': { d: 'state-of->PORTAL-015', surface: 'drawer' },
  'PORTAL-007': { status: 'PARTIAL', correction: 'PLANNED->PARTIAL: bank details panel exists on PORTAL-004', gate: 'C', name: 'Payee details (verified bank, QR, reference)',
    mock_api: 'GET /portal/payee?invoice=', states: 'Verified payee only; "changed on" notice after a beneficiary change',
    tests: 'Gate C: never shows platform account; copy buttons; bidi-isolated IBAN' },
  'PORTAL-008': { gate: 'built; C extends', tests: 'portal.spec', notes: 'Gate C: dues proof -> Pending verification (never Paid)' },
  'PORTAL-010': { gate: 'built; C extends', tests: 'portal.spec', notes: 'Gate C: dues receipt only after verification' },
  'PORTAL-011': { tests: 'portal.spec' }, 'PORTAL-012': { edition: 'DEV', tests: 'portal.spec', notes: 'Construction module only' },
  'PORTAL-013': { edition: 'DEV', gate: 'E' }, 'PORTAL-014': { edition: 'DEV', gate: 'E' },
  'PORTAL-015': { tests: 'portal.spec' },
  'PORTAL-027': { status: 'PARTIAL', correction: 'BUILT->PARTIAL against V3.1 scope', d: 'keep (same component as GLOBAL-010)', notes: 'Customer-app route of the shared personalization hub' },
  // GUIDE
  'GUIDE-001': { tests: 'onboarding.spec' }, 'GUIDE-002': { tests: 'onboarding.spec' }, 'GUIDE-003': { tests: 'onboarding.spec' },
  'GUIDE-005': { status: 'BUILT', correction: 'PLANNED->BUILT: PORTAL-TOUR-001 (8 steps) shipped in Stage 1.5R', tests: 'portal.spec' },
  'GUIDE-006': { d: 'state-of->GLOBAL-010', surface: 'tab' },
};

// ---------------------------------------------------------------- new rows (V3.1 families and unregistered built screens)
const N = [];
const add = (r) => N.push({ status: 'PLANNED', disposition: 'new', ...r });
const B = 'B';
const C = 'C';

// Entry screens built in Stage 1.5R but never registered
add({ screen_id: 'ENTRY-001', name: 'Get started', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(public)', data_scope: 'anonymous', surface: 'page', route: '/backoffice/get-started', status: 'BUILT', disposition: 'new (register missing built screen)', gate: 'built; C extends', tests: 'get-started.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'Gate C: choose the demo tenant (Developer or Society)' });
add({ screen_id: 'ENTRY-002', name: 'Explore demo (role -> preparing -> ready)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(public)', data_scope: 'anonymous -> demo persona', surface: 'wizard', route: '/backoffice/get-started/demo', status: 'BUILT', disposition: 'new (register missing built screen)', gate: 'built; C extends', mock_api: 'GET /demo/overview', tests: 'get-started.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'Gate C adds society roles' });
add({ screen_id: 'ENTRY-003', name: 'Request a workspace (was: Set up my developer workspace)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(public)', data_scope: 'anonymous', surface: 'wizard', route: '/backoffice/get-started/setup', status: 'BUILT', disposition: 'new (register missing built screen; re-scope per D-8)', gate: 'built; B links', mock_api: 'POST /workspace/verify; POST /workspace', tests: 'get-started.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'V3.1: tenants are licensed by Supreme Admin; the wizard becomes a request that appears in HQ-002 as a pending tenant, with an edition choice' });
add({ screen_id: 'ENTRY-004', name: 'Demo sign-in (backoffice, returning visitor)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(public)', data_scope: 'anonymous', surface: 'page', route: '/backoffice/sign-in', status: 'BUILT', disposition: 'new (register missing built screen)', gate: 'built', tests: 'permissions.spec; a11y.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT });
add({ screen_id: 'ENTRY-005', name: 'Demo sign-in (customer portal)', application: 'customer-web', tenant_edition: 'DEV+COMM', module: 'resident_portal', min_permission: '(public)', data_scope: 'anonymous', surface: 'page', route: '/customer/portal (signed out)', status: 'BUILT', disposition: 'new (register missing built screen)', gate: 'built; C extends', tests: 'portal.spec; customer-shell.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'Gate C adds Al-Noor residents' });
add({ screen_id: 'GLOBAL-011', name: 'More (phone areas page)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(signed in)', data_scope: 'own user + granted modules', surface: 'page', route: '/backoffice/more', status: 'BUILT', disposition: 'new (register missing built screen)', gate: 'built; B extends', tests: 'shell.spec; a11y.spec; reflow.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'Gate B: lists only granted modules; prototype tools behind a switch' });
add({ screen_id: 'GLOBAL-012', name: 'Access outcome pages (not in plan / site not included / not permitted)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: '(signed in)', data_scope: '-', surface: 'state', route: '(any denied deep link)', gate: B, states: 'module_not_licensed; site_not_licensed; feature_not_licensed; permission_missing; out_of_scope (as not found); prototype planned (separate)', mock_api: 'ApiProblem.code from the access decision', tests: 'Gate B: society preview deep-links to /backoffice/crm/sales-home -> "Not part of this workspace\'s plan"', sr_mobile_rtl_evidence: EVIDENCE_TODO, notes: 'A1 4: never a dead link or a raw 403' });
add({ screen_id: 'GLOBAL-013', name: 'Context switcher (project or site)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: 'project.context.use', data_scope: 'scoped sites/projects', surface: 'overlay', route: '(header)', status: 'PARTIAL', disposition: 'new (register missing built control)', gate: C, tests: 'shell.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT, notes: 'Built as a project switcher; Gate C adds sites and shows the current context on phones (flaw F-2)' });

// HQ: Platform Supreme Admin (Gate B unless stated)
const hq = (r) => add({ application: 'platform-hq', tenant_edition: 'HQ', module: 'platform', data_scope: 'platform (tenant metadata only)', sr_mobile_rtl_evidence: EVIDENCE_TODO, ...r });
hq({ screen_id: 'HQ-001', name: 'HQ dashboard', min_permission: 'platform.dashboard.view', surface: 'page', route: '/hq', gate: B, core_entity: 'tenant',
  linked_records: 'Tenants; draft contracts; workspace requests', actions: 'Create tenant; open tenant; open simulator', states: 'Loading/empty/error',
  mock_api: 'GET /platform/overview', tests: 'Gate B: counts by status/type; no tenant personal data', notes: 'Demo sign-in for platform personas; supersedes SAAS-001' });
hq({ screen_id: 'HQ-002', name: 'Tenants list', min_permission: 'platform.tenants.view', surface: 'page', route: '/hq/tenants', gate: B, core_entity: 'tenant',
  actions: 'Search; filter by status/type/edition; open; create', states: 'Draft, trial, active, grace, suspended, cancelled; pending workspace requests (ENTRY-003)',
  mock_api: 'GET /platform/tenants?status=&type=&q=', tests: 'Gate B: filters in URL; new tenant appears after activation' });
hq({ screen_id: 'HQ-003', name: 'Create tenant wizard', min_permission: 'platform.tenants.create', surface: 'wizard', route: '/hq/tenants/new?step=', gate: B, core_entity: 'tenant + subscription_contract',
  tabs: 'Steps: Type & edition; Organisation; Sites; Modules & dependency check; Pricing builder; Usage & count preview; Tax & discounts; Quote preview; Review; Activate (simulated)',
  linked_records: 'Licensed sites; grants; contract; components', actions: 'Next; Back; Save draft; Edit from review; Activate demo tenant',
  validation: 'Legal name required; at least one site; unit capacity > 0; dependency check passes; every component complete; effective dates valid; activation confirms simulation',
  states: 'Draft saved per step; survives Back and language switch; stale preview after changes', mock_api: 'POST /platform/tenants; PATCH /platform/tenants/:id/draft; POST /platform/entitlements/check; POST /platform/quotes/preview; POST /platform/tenants/:id/activate',
  tests: 'Gate B: Al-Noor created with Community preset; 18,700 / 3,700; Urdu mid-wizard; keyboard only; 390 px', notes: 'Supersedes SAAS-004' });
hq({ screen_id: 'HQ-004', name: 'Tenant 360 workspace', min_permission: 'platform.tenants.view', surface: 'workspace', route: '/hq/tenants/:id?tab=', gate: B, core_entity: 'tenant',
  tabs: 'Overview; Sites; Modules & grants; Subscription (versions); Usage; Invoices (G); Support access (G); Billing audit',
  linked_records: 'Contract versions; snapshots; grants; audit events', actions: 'Change grants; amend subscription; schedule price change; free plan; waive (G); preview as role; suspend (G)',
  states: 'Tenant lifecycle and billing status shown separately', mock_api: 'GET /platform/tenants/:id', tests: 'Gate B: amendment creates version 2; history kept; no tenant records visible', notes: 'Supersedes SAAS-003' });
hq({ screen_id: 'HQ-005', name: 'Edition selector', min_permission: 'platform.tenants.create', surface: 'step', route: '/hq/tenants/new?step=type', gate: B, disposition: 'new (state of HQ-003)', canonical_id: 'HQ-003', states: 'Developer; Community; Portfolio manager; Custom', notes: 'An edition pre-fills grants; it never decides access (D-2)' });
hq({ screen_id: 'HQ-006', name: 'Module & feature catalogue', min_permission: 'platform.catalog.view', surface: 'page', route: '/hq/catalogue', gate: B, core_entity: 'module_catalog',
  tabs: 'Modules; Features; Dependency matrix (HQ-007); Edition presets', mock_api: 'GET /platform/catalog', tests: 'Gate B: list alternative to the matrix; axe', notes: 'Read-only in Gate B; supersedes SAAS-005' });
hq({ screen_id: 'HQ-007', name: 'Module dependency matrix', min_permission: 'platform.catalog.view', surface: 'tab', route: '/hq/catalogue?tab=dependencies', gate: B, disposition: 'new (state of HQ-006)', canonical_id: 'HQ-006', states: 'Requires / integrates; table and list alternative' });
hq({ screen_id: 'HQ-008', name: 'Tenant module & site grants', min_permission: 'platform.grants.manage', surface: 'drawer', route: '/hq/tenants/:id?tab=modules&drawer=grants', gate: B, disposition: 'new (state of HQ-004)', canonical_id: 'HQ-004', core_entity: 'tenant_module_grant',
  actions: 'Enable/disable per tenant or site; set dates; review impact; confirm', validation: 'Hard dependencies; overlapping dates; impact acknowledged before disabling',
  mock_api: 'POST /platform/entitlements/check; POST /platform/tenants/:id/grants', tests: 'Gate B: enabling online payments without receivables offers to add it; disabling shows impact' });
hq({ screen_id: 'HQ-009', name: 'Preview as tenant role', min_permission: 'platform.preview.use', surface: 'overlay', route: '/hq/tenants/:id/preview?role=', gate: B, core_entity: 'preview session',
  states: 'Banner "Preview: simulation, no tenant records"; exit returns to HQ-004', mock_api: 'POST /platform/tenants/:id/preview-session',
  tests: 'Gate B: society manager preview shows no CRM nav, palette or quick create; deep link -> GLOBAL-012', notes: 'Opens the backoffice shell in preview mode with the tenant grants and no tenant data' });
hq({ screen_id: 'HQ-010', name: 'Rate cards & plan versions', min_permission: 'platform.pricing.view', surface: 'page', route: '/hq/rate-cards', gate: B, core_entity: 'rate_card_version', mock_api: 'GET /platform/rate-cards/current', notes: 'Read-only in Gate B (source of default component prices)' });
hq({ screen_id: 'HQ-011', name: 'Subscription contract builder', min_permission: 'platform.contracts.manage', surface: 'step', route: '/hq/tenants/new?step=pricing | /hq/tenants/:id/contracts/new', gate: B, core_entity: 'subscription_contract',
  actions: 'Add component from rate card; edit basis/quantity source/price/cycle/dates; override with reason; remove', validation: 'Component complete; dimension declared for per-unit; tier method declared; dates within term',
  mock_api: 'POST /platform/quotes/preview; POST /platform/tenants/:id/contracts', tests: 'Gate B: hybrid components; scheduled amendment' });
hq({ screen_id: 'HQ-012', name: 'Pricing component table', min_permission: 'platform.contracts.manage', surface: 'state', route: '(inside HQ-011)', gate: B, disposition: 'new (state of HQ-011)', canonical_id: 'HQ-011', notes: 'Columns per A3 8' });
hq({ screen_id: 'HQ-013', name: 'Pricing simulator', min_permission: 'platform.pricing.simulate', surface: 'page', route: '/hq/simulator', gate: B, core_entity: 'quote preview',
  actions: 'Change counts, dates, tiers, discounts; copy to draft amendment', states: 'Labelled "Simulation: nothing is saved"', mock_api: 'POST /platform/simulations/price',
  tests: 'Gate B: what-if 76 occupied -> 3,540; mutation log unchanged' });
hq({ screen_id: 'HQ-014', name: 'Usage meters & snapshots', min_permission: 'platform.usage.view', surface: 'tab', route: '/hq/tenants/:id?tab=usage', gate: 'B (tenant tab); G (explorer)', core_entity: 'usage_snapshot',
  states: 'Captured; disputed; corrected', mock_api: 'GET /platform/tenants/:id/usage?period=', notes: 'Supersedes SAAS-010' });
hq({ screen_id: 'HQ-015', name: 'Unit/seat count & meter evidence', min_permission: 'platform.usage.view', surface: 'drawer', route: '?drawer=meter-evidence&snapshot=', gate: B, core_entity: 'usage_snapshot',
  states: 'Counted and excluded flat codes with reasons; definition version; snapshot time; no personal data', mock_api: 'GET /platform/usage/snapshots/:id/evidence',
  tests: 'Gate B: registered/active/occupied/eligible side by side; occupied evidence lists the vacant flats as excluded, with reasons' });
hq({ screen_id: 'HQ-016', name: 'SaaS quote / invoice preview', min_permission: 'platform.contracts.manage', surface: 'step', route: '/hq/tenants/new?step=quote', gate: B, core_entity: 'quote preview',
  states: 'First period and later period; printable; EN/UR', mock_api: 'POST /platform/quotes/preview', tests: 'Gate B: every line explained; totals match golden vectors' });
hq({ screen_id: 'HQ-017', name: 'Central invoices, credits & payments', min_permission: 'platform.finance.view', surface: 'page', route: '/hq/finance', gate: 'G', core_entity: 'platform_invoice', notes: 'Platform money only (A4 6); supersedes SAAS-006' });
hq({ screen_id: 'HQ-018', name: 'Trial, renewal & suspension actions', min_permission: 'platform.tenants.lifecycle', surface: 'drawer', route: '/hq/tenants/:id?drawer=lifecycle', gate: 'B (activate, free plan); G (suspend, renew)', core_entity: 'tenant' });
hq({ screen_id: 'HQ-019', name: 'Tenant billing audit', min_permission: 'platform.audit.view', surface: 'tab', route: '/hq/tenants/:id?tab=audit', gate: B, disposition: 'new (state of HQ-004)', canonical_id: 'HQ-004', mock_api: 'GET /platform/tenants/:id/audit', tests: 'Gate B: grant and contract changes recorded with before/after' });
hq({ screen_id: 'HQ-020', name: 'Support access grants', min_permission: 'platform.support.request', surface: 'page', route: '/hq/support-access', gate: 'G', core_entity: 'platform_support_access_grant', notes: 'Gate B only proves denial without a grant; supersedes SAAS-009' });
hq({ screen_id: 'HQ-021', name: 'Branding, theme guardrails & domains', min_permission: 'platform.branding.manage', surface: 'page', route: '/hq/tenants/:id?tab=branding', gate: 'G', core_entity: 'tenant_branding', notes: 'Supersedes SAAS-007' });
hq({ screen_id: 'HQ-022', name: 'Platform billing reports', min_permission: 'platform.reports.view', surface: 'page', route: '/hq/reports', gate: 'G', core_entity: 'platform_invoice' });
hq({ screen_id: 'HQ-023', name: 'Platform users & roles', min_permission: 'platform.users.manage', surface: 'page', route: '/hq/users', gate: 'G', core_entity: 'platform_principal', notes: 'Supersedes SAAS-008' });
hq({ screen_id: 'HQ-024', name: 'Appearance & accessibility (platform user)', min_permission: '(signed in)', surface: 'page', route: '/hq/preferences', gate: 'D', disposition: 'new (shared component with GLOBAL-010 and PORTAL-027)' });
hq({ screen_id: 'HQ-025', name: 'Platform sign-in (operator, MFA)', min_permission: '(public)', surface: 'page', route: '/hq/sign-in', gate: 'G', notes: 'Demo sign-in in Gate B; real MFA at Gate H' });

// SITE: shared property core (Gate C)
const site = (r) => add({ application: 'backoffice', tenant_edition: 'DEV+COMM', module: 'core', data_scope: 'site', sr_mobile_rtl_evidence: EVIDENCE_TODO, gate: C, ...r });
site({ screen_id: 'SITE-001', name: 'Managed sites', min_permission: 'site.view', surface: 'page', route: '/backoffice/sites', core_entity: 'managed_site', actions: 'Open site; filter', mock_api: 'GET /sites', tests: 'Gate C: only licensed sites listed' });
site({ screen_id: 'SITE-002', name: 'Site 360 workspace', min_permission: 'site.view', surface: 'workspace', route: '/backoffice/sites/:id?tab=', core_entity: 'managed_site',
  tabs: 'Overview & checklist; Structure; Units & payers; Charges; Billing runs; Collections; Collection settings; Documents; Activity', linked_records: 'Buildings; units; billing accounts; runs; beneficiary',
  mock_api: 'GET /sites/:id', tests: 'Gate C: tabs per granted modules' });
site({ screen_id: 'SITE-003', name: 'Structure explorer (blocks, buildings, floors, units)', min_permission: 'site.view', surface: 'page', route: '/backoffice/sites/:id/structure', core_entity: 'building/floor/unit',
  actions: 'Add building, floor or unit (drawers); open unit', validation: 'Unique names per parent; unit code unique per site',
  states: 'Tree + accessible list alternative; empty site', mock_api: 'GET /sites/:id/structure; POST /sites/:id/buildings; POST /sites/:id/units',
  tests: 'Gate C: 2 blocks x 5 floors x 8 flats; keyboard tree; list alternative', notes: 'Canonical for PRJ-004/005/006, INV-004' });
site({ screen_id: 'SITE-004', name: 'Bulk unit import', min_permission: 'site.units.import', surface: 'wizard', route: '/backoffice/sites/:id/import', core_entity: 'unit import',
  tabs: 'Steps: Upload; Map columns; Validate; Duplicates; Preview; Commit', actions: 'Download template; upload; fix and re-upload; commit',
  validation: 'Required columns; unit code unique (file and existing); floor exists; area > 0; type known', states: 'Errors listed per row; commit all-or-nothing; idempotent re-run',
  mock_api: 'POST /sites/:id/imports/units/preview; POST /sites/:id/imports/units/:importId/commit', tests: 'Gate C: sample file with 3 errors and 2 duplicates; fix -> commit 80; re-run creates nothing', notes: 'Canonical for INV-005' });
site({ screen_id: 'SITE-005', name: 'Unit types', min_permission: 'site.manage', surface: 'page', route: '/backoffice/sites/:id/unit-types', core_entity: 'unit_type', mock_api: 'GET /unit-types?site=', notes: 'Canonical for PRJ-007; used by charge rules' });
site({ screen_id: 'SITE-006', name: 'Unit 360 workspace', min_permission: 'unit.view', surface: 'workspace', route: '/backoffice/sites/:siteId/units/:unitId?tab=', core_entity: 'unit',
  tabs: 'Overview; Ownership history; Occupancy history; Billing account & payers; Charges (which rule wins); Invoices & statement; Requests (D); Parking (G); Sales: price, holds, booking (E, DEV); Documents; Activity',
  linked_records: 'Owners; occupants; billing account; invoices', mock_api: 'GET /sites/:siteId/units/:unitId; GET /charges/resolve?unit=',
  tests: 'Gate C: A-102 owner X, occupant/payer Y; A-108 exempt', notes: 'Canonical for INV-003, OWN-002, OWN-005, RES-003' });
site({ screen_id: 'SITE-007', name: 'Opening balances import', min_permission: 'receivables.opening_balances', module: 'receivables', surface: 'wizard', route: '/backoffice/sites/:id/opening-balances', core_entity: 'customer_invoice (opening_balance)',
  validation: 'Account exists; amount format; total shown and approved before posting', mock_api: 'POST /sites/:id/imports/opening-balances/{preview,commit}', tests: 'Gate C: A-101 arrears 1,000 appear on statement' });
site({ screen_id: 'SITE-008', name: 'Site onboarding checklist', min_permission: 'site.manage', surface: 'state', route: '/backoffice/sites/:id?tab=overview', disposition: 'new (state of SITE-002)', canonical_id: 'SITE-002',
  states: 'Nine steps (A4 1): done / next / blocked with reasons', mock_api: 'GET /sites/:id/checklist', tests: 'Gate C: checklist advances as steps complete' });

// BILL: receivables + dues (Gate C unless stated)
const bill = (r) => add({ application: 'backoffice', tenant_edition: 'COMM (+DEV service charges)', module: 'dues', data_scope: 'site', sr_mobile_rtl_evidence: EVIDENCE_TODO, gate: C, ...r });
bill({ screen_id: 'BILL-001', name: 'Billing accounts', module: 'receivables', tenant_edition: 'DEV+COMM', min_permission: 'billing_account.view', surface: 'page', route: '/backoffice/billing/accounts', core_entity: 'billing_account', mock_api: 'GET /billing-accounts?site=&q=', tests: 'Gate C: kinds dues vs sales_contract' });
bill({ screen_id: 'BILL-002', name: 'Billing account workspace', module: 'receivables', tenant_edition: 'DEV+COMM', min_permission: 'billing_account.view', surface: 'workspace', route: '/backoffice/billing/accounts/:id?tab=', core_entity: 'billing_account',
  tabs: 'Overview; Units (effective-dated); Liable parties per flat (effective-dated, A2 4.5); Invoices; Statement; Payments; Credit; History',
  actions: 'Change payer from a date (drawer); open statement', validation: 'Shares = 100 % per period; no overlapping periods',
  mock_api: 'GET /billing-accounts/:id; POST /billing-accounts/:id/parties', tests: 'Gate C: payer change does not alter October invoice' });
bill({ screen_id: 'BILL-003', name: 'Charge categories & rate versions', min_permission: 'charges.manage', surface: 'page', route: '/backoffice/billing/charges', core_entity: 'charge_rate_version',
  validation: 'Effective dates; no overlap', mock_api: 'GET /charges/categories; POST /charges/rules/:id/versions', tests: 'Gate C: new rate from a future date leaves earlier runs unchanged' });
bill({ screen_id: 'BILL-004', name: 'Charge rules & overrides (which rule wins)', min_permission: 'charges.manage', surface: 'page', route: '/backoffice/billing/rules', core_entity: 'recurring_charge_rule',
  actions: 'Add rule at site/building/unit type/unit; preview winner for a flat', states: 'Winning scope shown with overridden rules', mock_api: 'GET /charges/rules?site=; POST /charges/rules; GET /charges/resolve?unit=',
  tests: 'Gate C: A-501 penthouse 4,500 wins over site 3,000' });
bill({ screen_id: 'BILL-005', name: 'Billing calendar & runs', min_permission: 'billing_run.view', surface: 'page', route: '/backoffice/billing/runs', core_entity: 'billing_run',
  actions: 'Create run for a period; open run', validation: 'One open run per site and period', mock_api: 'GET /billing-runs?site=&period=', tests: 'Gate C: duplicate period refused with link', notes: 'Canonical for FIN-012' });
bill({ screen_id: 'BILL-006', name: 'Billing run builder', min_permission: 'billing_run.create', surface: 'wizard', route: '/backoffice/billing/runs/new', core_entity: 'billing_run', disposition: 'new (opens BILL-008 in DRAFT)', canonical_id: 'BILL-008',
  tabs: 'Steps: Period; Scope (site/buildings); Rules check; Generate preview', mock_api: 'POST /billing-runs; POST /billing-runs/:id/preview' });
bill({ screen_id: 'BILL-007', name: 'Assessment preview by flat', min_permission: 'billing_run.view', surface: 'tab', route: '/backoffice/billing/runs/:id?tab=items', disposition: 'new (state of BILL-008)', canonical_id: 'BILL-008',
  states: 'Per flat: lines, winning rule, exemption; filters; responsive table + card list', tests: 'Gate C: 80 flats, 79 invoiced, A-108 exempt' });
bill({ screen_id: 'BILL-008', name: 'Billing run workspace', min_permission: 'billing_run.view', surface: 'workspace', route: '/backoffice/billing/runs/:id?tab=', core_entity: 'billing_run',
  tabs: 'Summary; Items by flat; Exceptions; Approval; Posting; Notifications; Audit',
  actions: 'Regenerate; submit; return (approver); approve (not creator); post; notify (simulated); cancel (before posting)',
  validation: 'Stale preview blocks submit; maker != checker; post is idempotent',
  states: 'DRAFT; PREVIEWED; APPROVAL_PENDING; APPROVED; POSTED; NOTIFIED; CANCELLED',
  mock_api: 'GET /billing-runs/:id; POST /billing-runs/:id/{preview,submit,return,approve,post,notify,cancel}',
  tests: 'Gate C: full state path; creator cannot approve; double post creates no duplicates; posted run read-only' });
bill({ screen_id: 'BILL-009', name: 'Exemptions, waivers & adjustments', min_permission: 'charges.exemptions', surface: 'page', route: '/backoffice/billing/exemptions', core_entity: 'exemption',
  validation: 'Reason; approval by treasurer', gate: 'C (one exemption path); G (full)', mock_api: 'POST /exemptions; POST /exemptions/:id/approve' });
bill({ screen_id: 'BILL-010', name: 'Collection destinations (verified beneficiary & QR)', module: 'banking', tenant_edition: 'DEV+COMM', min_permission: 'beneficiary.manage', surface: 'tab', route: '/backoffice/sites/:id?tab=collection-settings', core_entity: 'beneficiary_profile',
  actions: 'Propose new details; second approver verifies; retire', validation: 'IBAN format; maker != checker; cooling-off (D-13)',
  states: 'draft; pending_verification; verified; retired', mock_api: 'GET /beneficiaries?site=; POST /beneficiaries; POST /beneficiaries/:id/approve',
  tests: 'Gate C: resident sees only the verified profile; change requires second approver', notes: 'Supersedes ADM-016' });
bill({ screen_id: 'BILL-011', name: 'Online gateway settings (mock)', module: 'online_payments', tenant_edition: 'DEV+COMM', min_permission: 'merchant.manage', surface: 'tab', route: '/backoffice/sites/:id?tab=online-payments', core_entity: 'merchant_connection', gate: 'D', notes: 'Sandbox mock only; supersedes ADM-017' });
bill({ screen_id: 'BILL-012', name: 'Payment method rules (per site)', module: 'receivables', tenant_edition: 'DEV+COMM', min_permission: 'payment_methods.manage', surface: 'tab', route: '/backoffice/sites/:id?tab=payment-methods', core_entity: 'site payment policy',
  states: 'Transfer; online (if connected); office cash; cheque', mock_api: 'GET/PATCH /sites/:id/payment-methods', tests: 'Gate C: office cash disabled -> FIN-007 refuses', notes: 'Supersedes ADM-015, ADM-018' });
bill({ screen_id: 'BILL-013', name: 'Utility meters & readings', min_permission: 'charges.meters', feature_grant: 'dues.utility_meters', surface: 'page', route: '/backoffice/billing/meters', core_entity: 'utility_meter_reading', gate: 'G' });
bill({ screen_id: 'BILL-014', name: 'Credit note (correct a posted invoice)', module: 'receivables', tenant_edition: 'DEV+COMM', min_permission: 'credit_note.create', surface: 'drawer', route: '/backoffice/billing/invoices/:id?drawer=credit-note', disposition: 'new (state of FIN-003)', canonical_id: 'FIN-003', core_entity: 'credit_note',
  validation: 'Reason; amount <= open amount; approval', tests: 'Gate C: posted invoice corrected without editing' });
bill({ screen_id: 'BILL-015', name: 'Late fee rules', min_permission: 'charges.manage', feature_grant: 'dues.late_fees', surface: 'page', route: '/backoffice/billing/late-fees', core_entity: 'recurring_charge_rule', gate: 'G', notes: 'Off by default; legal review (D-11)' });

// Other new rows
add({ screen_id: 'ADM-022', name: 'Branding & theme policy (tenant)', application: 'backoffice', tenant_edition: 'ALL', module: 'white_label', min_permission: 'admin.branding', data_scope: 'tenant', surface: 'page', route: '/backoffice/adm/branding', gate: 'D', sr_mobile_rtl_evidence: EVIDENCE_TODO, notes: 'Within HQ guardrails; can never block personal high contrast or reduced motion' });
add({ screen_id: 'ADM-023', name: 'Your plan & modules (read-only)', application: 'backoffice', tenant_edition: 'ALL', module: 'core', min_permission: 'admin.view', data_scope: 'tenant', surface: 'page', route: '/backoffice/adm/plan', gate: B, core_entity: 'tenant grants (central, read-only)', mock_api: 'GET /access/me', tests: 'Gate B: preview as society admin shows granted modules and sites only', sr_mobile_rtl_evidence: EVIDENCE_TODO, notes: 'Tenant admins see what is licensed; they cannot change it' });
add({ screen_id: 'MNT-009', name: 'Building assets register', application: 'backoffice', tenant_edition: 'DEV+COMM', module: 'maintenance', min_permission: 'maintenance.assets', data_scope: 'site', surface: 'page', route: '/backoffice/mnt/assets', gate: 'G', core_entity: 'building_asset', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'MNT-010', name: 'Preventive maintenance schedules', application: 'backoffice', tenant_edition: 'DEV+COMM', module: 'maintenance', min_permission: 'maintenance.schedules', data_scope: 'site', surface: 'page', route: '/backoffice/mnt/preventive', gate: 'G', core_entity: 'preventive_maintenance_schedule', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'MNT-011', name: 'Inspections', application: 'backoffice', tenant_edition: 'DEV+COMM', module: 'maintenance', min_permission: 'maintenance.inspections', data_scope: 'site', surface: 'page', route: '/backoffice/mnt/inspections', gate: 'G', core_entity: 'inspection', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'RPT-018', name: 'Site dues collection report', application: 'backoffice', tenant_edition: 'COMM', module: 'reports', min_permission: 'reports.view', data_scope: 'site', surface: 'report', route: '/backoffice/rpt/site-dues', gate: 'G', core_entity: 'customer_invoice', sr_mobile_rtl_evidence: EVIDENCE_TODO, notes: 'Requires dues' });
const portal = (r) => add({ application: 'customer-web', tenant_edition: 'DEV+COMM', module: 'resident_portal', min_permission: 'portal.use', data_scope: 'own verified units and billing accounts', sr_mobile_rtl_evidence: EVIDENCE_TODO, ...r });
portal({ screen_id: 'PORTAL-028', name: 'Payment submission status', surface: 'page', route: '/customer/portal/submissions/:id', gate: C, core_entity: 'payment_submission',
  states: 'Pending verification; needs information (resubmit); rejected (reason); verified -> receipt', mock_api: 'GET /portal/submissions/:id', tests: 'Gate C: never shows Paid before verification; resubmission keeps history' });
portal({ screen_id: 'PORTAL-029', name: 'Statements', surface: 'page', route: '/customer/portal/statements', gate: C, core_entity: 'billing_account', mock_api: 'GET /portal/statements?account=', tests: 'Gate C: A-101 statement after payment; tenant-payer sees only their periods' });
portal({ screen_id: 'PORTAL-030', name: 'Welcome & setup (language, text size, theme)', surface: 'wizard', route: '/customer/portal/welcome', gate: 'D', notes: 'V3.1 resident first run' });
add({ screen_id: 'GUIDE-007', name: 'HQ guided tour', application: 'platform-hq', tenant_edition: 'HQ', module: 'platform', min_permission: '(signed in)', data_scope: 'own user', surface: 'overlay', route: '/hq (help)', gate: B, tests: 'Gate B: every step frames a real control at 1440/390/320', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'GUIDE-008', name: 'Building manager tour', application: 'backoffice', tenant_edition: 'COMM', module: 'core', min_permission: '(signed in)', data_scope: 'own user', surface: 'overlay', route: '/backoffice (help)', gate: C, tests: 'Gate C: guided step completes on a real action (preview run)', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'GUIDE-009', name: 'Resident dues tour', application: 'customer-web', tenant_edition: 'COMM', module: 'resident_portal', min_permission: 'portal.use', data_scope: 'own user', surface: 'overlay', route: '/customer/portal (help)', gate: C, tests: 'Gate C', sr_mobile_rtl_evidence: EVIDENCE_TODO });
add({ screen_id: 'GUIDE-010', name: 'Sales module tour (CRM-TOUR-001)', application: 'backoffice', tenant_edition: 'DEV', module: 'crm', min_permission: 'lead.view', data_scope: 'own user', surface: 'overlay', route: '/backoffice/crm/sales-home (offered)', status: 'BUILT', disposition: 'new (register missing built tour)', gate: 'built', tests: 'crm.spec', sr_mobile_rtl_evidence: EVIDENCE_BUILT });

// ---------------------------------------------------------------- build
const live = parseCsv(readFileSync(LIVE, 'utf8'));
const domainOf = (id) => (id.startsWith('GUIDE-') ? 'GUIDED_ONBOARDING' : id.split('-')[0]);

const legacy = live.map((r) => {
  const dom = DOMAIN[domainOf(r.screen_id)] ?? DOMAIN[r.domain];
  const o = L[r.screen_id] ?? {};
  const status = o.status ?? STATUS[r.status];
  const d = o.d ?? 'keep';
  const target = /->(\S+)/.exec(d)?.[1];
  const built = status !== 'PLANNED';
  const gate = target ? '-' : (o.gate ?? (STATUS[r.status] === 'PLANNED' ? dom.gate : 'built'));
  return {
    screen_id: r.screen_id,
    name: o.name ?? r.name,
    application: o.app ?? APP[r.app] ?? r.app,
    tenant_edition: o.edition ?? dom.edition,
    module: o.module ?? dom.module,
    feature_grant: o.feature ?? '',
    min_permission: o.perm ?? dom.perm,
    data_scope: o.scope ?? dom.scope,
    surface: o.surface ?? r.surface,
    route: r.canonical_route || r.prototype_route,
    status,
    disposition: o.correction ? `${d}; correction: ${o.correction}` : d,
    canonical_id: target ?? r.screen_id,
    core_entity: o.core_entity ?? dom.entity,
    tabs: o.tabs ?? (target || built ? '' : LATER(gate)),
    linked_records: o.linked_records ?? '',
    actions: o.actions ?? '',
    validation: o.validation ?? '',
    states: o.states ?? '',
    mock_api: o.mock_api ?? '',
    gate,
    tests: o.tests ?? (built ? 'register.spec + existing E2E (see docs/status/ui-stage-1.5R/test-results.md)' : ''),
    sr_mobile_rtl_evidence: built ? EVIDENCE_BUILT : target ? '' : EVIDENCE_TODO,
    notes: [o.notes, r.notes].filter(Boolean).join(' | '),
  };
});

const added = N.map((r) => ({
  feature_grant: '', tabs: '', linked_records: '', actions: '', validation: '', states: '', mock_api: '', tests: '', notes: '', core_entity: '-',
  canonical_id: r.canonical_id ?? r.screen_id, ...r,
}));

const all = [...legacy, ...added];
const ids = new Set();
for (const r of all) {
  if (ids.has(r.screen_id)) throw new Error(`duplicate id ${r.screen_id}`);
  ids.add(r.screen_id);
}
for (const r of all) if (!ids.has(r.canonical_id)) throw new Error(`${r.screen_id}: unknown canonical ${r.canonical_id}`);

writeFileSync(OUT, [COLUMNS.join(','), ...all.map((r) => COLUMNS.map((c) => esc(r[c])).join(','))].join('\n') + '\n');

if (process.argv.includes('--stats')) {
  const counted = all.filter((r) => r.canonical_id === r.screen_id);
  const tally = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
  console.log(JSON.stringify({
    legacyRows: legacy.length, newRows: added.length, totalRows: all.length,
    notCountedSeparately: all.length - counted.length,
    distinctScreens: counted.length,
    distinctByStatus: tally(counted, 'status'),
    distinctByGate: tally(counted, 'gate'),
    legacyDispositions: tally(legacy.map((r) => ({ k: r.disposition.split(/->|;| \(/)[0].trim() })), 'k'),
    corrections: legacy.filter((r) => r.disposition.includes('correction')).map((r) => `${r.screen_id}: ${r.disposition}`),
    gateB: counted.filter((r) => String(r.gate).startsWith('B')).map((r) => r.screen_id),
    gateC: counted.filter((r) => String(r.gate).startsWith('C') || String(r.gate).includes('C extends')).map((r) => r.screen_id),
  }, null, 2));
}
