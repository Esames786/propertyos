import type { CollectionsSummary, Money, SetupStep, SocietyDashboard, SocietyTask } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { ALNOOR_ENTITY, ALNOOR_SITE } from './alnoor';
import type { SocietyView, StoredRun } from './state';

/**
 * HOME-001, society composition (F-3): collections first, then what needs a decision, then the
 * buildings. Every figure links to the records behind it, or says which gate brings it; nothing is
 * decorative. Tasks are worded for the person reading them: theirs to do, or waiting for someone else.
 */
export interface DashboardInput {
  view: SocietyView;
  checklist: SetupStep[];
  period: string;
  /** The run of the period (not cancelled), with its staleness. */
  run: (StoredRun & { stale: boolean }) | null;
  principalId: string;
  can: {
    manageSite: boolean;
    createRun: boolean;
    approveRun: boolean;
    postRun: boolean;
    approveOpening: boolean;
    approveExemption: boolean;
    seeInvoices: boolean;
    reviewProofs: boolean;
    reconcile: boolean;
    approveBeneficiary: boolean;
    approvePaymentException: boolean;
    approveLiability: boolean;
  };
  /** Collections figures, when the person may see them (C.2). */
  collections: CollectionsSummary | null;
  today: string;
}

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const SITE = `/backoffice/sites/${ALNOOR_SITE.id}`;

export function buildSocietyDashboard(input: DashboardInput): SocietyDashboard {
  const { view, run, principalId, can, period } = input;
  const { state, model } = view;
  const runHref = (tab?: string) => (run ? `/backoffice/billing/runs/${run.id}${tab ? `?tab=${tab}` : ''}` : '/backoffice/billing/runs');

  // Money owed: everything outstanding, and the part already overdue (arrears).
  const owed = new Map<string, bigint>();
  const overdue = new Map<string, bigint>();
  for (const i of view.invoices) {
    const o = toPaisa(i.outstanding.amount);
    if (o <= 0n) continue;
    owed.set(i.billingAccountId, (owed.get(i.billingAccountId) ?? 0n) + o);
    if (i.overdue) overdue.set(i.billingAccountId, (overdue.get(i.billingAccountId) ?? 0n) + o);
  }
  const total = (m: Map<string, bigint>) => [...m.values()].reduce((s, v) => s + v, 0n);

  const periodInvoices = view.invoices.filter((i) => i.source === 'billing_run' && i.period === period);
  const billed = periodInvoices.reduce((s, i) => s + toPaisa(i.total.amount), 0n);

  // Decisions waiting (maker-checker: never offered to the person who prepared the work).
  const approvals: SocietyDashboard['approvals']['items'] = [];
  if (run?.state === 'APPROVAL_PENDING') approvals.push({ kind: 'billing_run', id: run.id, label: run.ref, href: runHref('approval'), yours: can.approveRun && run.createdBy !== principalId && run.submittedBy !== principalId });
  for (const e of state.exemptions.filter((x) => x.state === 'pending_approval')) {
    approvals.push({ kind: 'exemption', id: e.id, label: e.unitCode, href: `/backoffice/billing/exemptions?exemption=${e.id}`, yours: can.approveExemption && e.requestedBy !== principalId });
  }
  for (const b of state.openingBatches.filter((x) => x.state === 'pending_approval')) {
    approvals.push({ kind: 'opening_balances', id: b.id, label: b.fileName, href: `${SITE}/opening-balances`, yours: can.approveOpening && b.importedBy !== principalId });
  }
  for (const c of state.payerChanges.filter((x) => x.state === 'pending_approval')) {
    approvals.push({ kind: 'payer_change', id: c.id, label: c.flatCode, href: `${SITE}/units/${c.flatId}?tab=payer`, yours: can.approveLiability && c.requestedBy !== principalId });
  }
  for (const c of state.beneficiaryChanges.filter((x) => x.state === 'pending_approval')) {
    approvals.push({ kind: 'beneficiary', id: c.id, label: c.proposed.iban, href: `${SITE}?tab=collection-settings`, yours: can.approveBeneficiary && c.proposedBy !== principalId });
  }
  for (const x of state.submissions.filter((s) => s.state === 'exception_pending' && s.exception)) {
    approvals.push({ kind: 'payment_exception', id: x.id, label: x.ref, href: `/backoffice/fin/transfer-proof-review?record=${x.id}`, yours: can.approvePaymentException && x.exception!.requestedBy !== principalId });
  }

  const tasks: SocietyTask[] = [];
  const task = (t: SocietyTask) => tasks.push(t);
  if (!state.register) task({ key: 'import_flats', urgency: 'urgent', yours: can.manageSite, href: `${SITE}/import` });
  for (const a of approvals) {
    if (a.kind === 'opening_balances') task({ key: 'approve_opening_balances', urgency: 'normal', yours: a.yours, href: a.href });
  }
  const payerChanges = approvals.filter((a) => a.kind === 'payer_change');
  if (payerChanges.length) task({ key: 'approve_payer_changes', urgency: 'normal', count: payerChanges.length, yours: payerChanges.some((a) => a.yours), href: payerChanges.length === 1 ? payerChanges[0]!.href : '/backoffice/billing/payer-changes' });
  const beneficiary = approvals.find((a) => a.kind === 'beneficiary');
  if (beneficiary) task({ key: 'approve_beneficiary', urgency: 'urgent', yours: beneficiary.yours, href: beneficiary.href });
  const exceptions = approvals.filter((a) => a.kind === 'payment_exception');
  if (exceptions.length) task({ key: 'approve_payment_exceptions', urgency: 'urgent', count: exceptions.length, yours: exceptions.some((a) => a.yours), href: exceptions.length === 1 ? exceptions[0]!.href : '/backoffice/fin/unverified-transfers-queue?state=exception_pending' });
  const c = input.collections;
  if (c && c.queue.toReview) task({ key: 'review_proofs', urgency: 'urgent', count: c.queue.toReview, yours: can.reviewProofs, href: c.queue.href });
  if (c && c.queue.needsInformation) task({ key: 'proofs_waiting_resident', urgency: 'normal', count: c.queue.needsInformation, yours: false, href: `${c.pending.href}?state=needs_information` });
  if (c && c.queue.awaitingBank) task({ key: 'proofs_awaiting_bank', urgency: 'normal', count: c.queue.awaitingBank, yours: can.reconcile, href: `${c.pending.href}?state=awaiting_bank_evidence` });
  if (c && c.bank.unmatched && can.reconcile) task({ key: 'reconcile_bank', urgency: 'normal', count: c.bank.unmatched, yours: true, href: c.bank.href });
  if (c && c.credit.accounts && can.reviewProofs) task({ key: 'apply_credit', urgency: 'normal', count: c.credit.accounts, yours: true, href: c.credit.href });
  const pendingExemptions = approvals.filter((a) => a.kind === 'exemption');
  if (pendingExemptions.length) task({ key: 'approve_exemptions', urgency: 'normal', count: pendingExemptions.length, yours: pendingExemptions.some((a) => a.yours), href: '/backoffice/billing/exemptions' });
  if (state.register) {
    const returned = run?.state === 'PREVIEWED' && run.history.at(-1)?.action === 'return';
    if (!run) task({ key: 'create_run', urgency: 'urgent', yours: can.createRun, href: '/backoffice/billing/runs/new', period });
    else if (run.stale) task({ key: 'stale_run', urgency: 'urgent', yours: can.createRun, href: runHref('items'), period });
    else if (returned) task({ key: 'returned_run', urgency: 'urgent', yours: can.createRun, href: runHref('approval'), period });
    else if (run.state === 'DRAFT') task({ key: 'preview_run', urgency: 'urgent', yours: can.createRun, href: runHref(), period });
    else if (run.state === 'PREVIEWED') task({ key: 'submit_run', urgency: 'urgent', yours: can.createRun, href: runHref('approval'), period });
    else if (run.state === 'APPROVAL_PENDING') task({ key: 'approve_run', urgency: 'urgent', yours: approvals.some((a) => a.kind === 'billing_run' && a.yours), href: runHref('approval'), period });
    else if (run.state === 'APPROVED') task({ key: 'post_run', urgency: 'urgent', yours: can.postRun, href: runHref('posting'), period });
    else if (run.state === 'POSTED') task({ key: 'notify_run', urgency: 'normal', yours: can.postRun, href: runHref('posting'), period });
  }
  const pending = input.checklist.filter((s) => s.state !== 'done' && s.state !== 'later');
  if (state.register && pending.length && !tasks.length) task({ key: 'finish_setup', urgency: 'normal', yours: can.manageSite, href: `${SITE}?tab=overview` });
  // The person's own work first, urgent before normal.
  tasks.sort((a, b) => Number(b.yours) - Number(a.yours) || (a.urgency === b.urgency ? 0 : a.urgency === 'urgent' ? -1 : 1));

  const flats = model.flats;
  const count = (o: string) => flats.filter((f) => f.occupancy === o).length;
  const flatOwed = new Map<string, bigint>();
  for (const i of view.invoices) for (const l of i.lines) flatOwed.set(l.unitId, (flatOwed.get(l.unitId) ?? 0n) + toPaisa(l.amount.amount) - toPaisa(l.credited.amount) - toPaisa(l.allocated.amount));
  const accountsIn = (buildingId: string) => new Set(flats.filter((f) => f.buildingId === buildingId).map((f) => f.billingAccountId));

  const holder = (accountId: string) => model.accounts.find((a) => a.id === accountId);
  const done = input.checklist.filter((s) => s.state === 'done').length;

  return {
    site: { id: ALNOOR_SITE.id, name: ALNOOR_SITE.name, legalEntityName: ALNOOR_ENTITY.name },
    period,
    mode: state.mode,
    billing: {
      run: run ? { id: run.id, ref: run.ref, state: run.state, stale: run.stale } : null,
      billed: money(billed),
      invoices: periodInvoices.length,
      exempt: run?.totals?.exempt ?? 0,
      href: periodInvoices.length ? `/backoffice/fin/invoices-list?period=${period}&source=billing_run` : runHref('items'),
    },
    outstanding: { amount: money(total(owed)), accounts: owed.size, href: '/backoffice/billing/accounts?status=owing' },
    arrears: { amount: money(total(overdue)), accounts: overdue.size, href: '/backoffice/billing/accounts?status=arrears' },
    collections: input.collections,
    approvals: { count: approvals.length, yours: approvals.filter((a) => a.yours).length, href: approvals.length === 1 ? approvals[0]!.href : '#approvals', items: approvals },
    occupancy: {
      registered: flats.length,
      occupied: flats.length - count('vacant'),
      ownerOccupied: count('owner_occupied'),
      tenantOccupied: count('tenant_occupied'),
      vacant: count('vacant'),
      association: count('association_use'),
      declared: ALNOOR_SITE.declaredFlats,
      href: '/backoffice/res/occupancy-list',
    },
    buildings: model.buildings.map((b) => {
      const inBuilding = flats.filter((f) => f.buildingId === b.id);
      const vacant = inBuilding.filter((f) => f.occupancy === 'vacant').length;
      const owedHere = inBuilding.reduce((s, f) => s + (flatOwed.get(f.id) ?? 0n), 0n);
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        flats: inBuilding.length,
        occupied: inBuilding.length - vacant,
        vacant,
        ownerOccupied: inBuilding.filter((f) => f.occupancy === 'owner_occupied').length,
        tenantOccupied: inBuilding.filter((f) => f.occupancy === 'tenant_occupied').length,
        association: inBuilding.filter((f) => f.occupancy === 'association_use').length,
        outstanding: money(owedHere),
        arrearsAccounts: [...accountsIn(b.id)].filter((a) => (overdue.get(a) ?? 0n) > 0n).length,
        href: `${SITE}/structure?building=${b.id}`,
      };
    }),
    tasks,
    topArrears: [...overdue]
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, 5)
      .map(([accountId, amount]) => {
        const a = holder(accountId);
        return {
          accountId,
          accountNo: a?.accountNo ?? '',
          holderName: a?.holderName ?? '',
          flats: flats.filter((f) => f.billingAccountId === accountId).map((f) => f.code),
          amount: money(amount),
          href: `/backoffice/billing/accounts/${accountId}`,
        };
      }),
    setup: { done, total: input.checklist.filter((s) => s.state !== 'later').length, ...(pending[0] ? { next: pending[0] } : {}) },
    later: [
      { key: 'online_payments', gate: 'D' },
      { key: 'late_fees', gate: 'G' },
      { key: 'maintenance', gate: 'D' },
      { key: 'visitors', gate: 'D' },
      { key: 'notices', gate: 'D' },
    ],
  };
}
