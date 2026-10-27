import type {
  ActivityEvent,
  AppNotification,
  EvidenceStatus,
  Invoice,
  InvoiceSettlement,
  Lead,
  LeadSource,
  LeadStatus,
  Party,
  Unit,
} from '@repo/contracts';
import { buildIban } from '@repo/i18n/format';
import { billingAccountOf } from './dataset-types';
import { UNITS } from './inventory';
import { PARTIES } from './people';
import { calendarDaysFromNow, createRandom, daysFromNow, pad, percentOf } from './seed';

const LEAD_STATUS_WEIGHTS: ReadonlyArray<readonly [LeadStatus, number]> = [
  ['new', 18], ['assigned', 16], ['contacted', 22], ['qualified', 14], ['converted', 8],
  ['dormant', 8], ['lost', 9], ['unqualified', 5],
];
const LEAD_SOURCES: readonly LeadSource[] = ['website', 'walk_in', 'referral', 'social', 'broker', 'phone'];

export interface LeadGeneration {
  seed: number;
  parties: readonly Party[];
  count: number;
  idPrefix: string;
  refPrefix: string;
  /** Most leads are for the primary project; the rest for the secondary one. */
  primary: string;
  secondary: string;
  primaryShare: number;
  /** Primary-project leads mostly belong to this owner; everything else to the fallback. */
  owner: string;
  fallbackOwner: string;
}

/** Fictional leads for one tenant (the same inputs always give the same leads). */
export function generateLeads(g: LeadGeneration): Lead[] {
  const rnd = createRandom(g.seed);
  const individuals = g.parties.filter((p) => p.kind === 'individual');
  return Array.from({ length: g.count }, (_, i) => {
    const party = individuals[i % individuals.length]!;
    const projectId = rnd.chance(g.primaryShare) ? g.primary : g.secondary;
    const status = rnd.weighted(LEAD_STATUS_WEIGHTS);
    const open = !['converted', 'lost', 'unqualified'].includes(status);
    return {
      id: `${g.idPrefix}${pad(i + 1, 4)}`,
      ref: `${g.refPrefix}${pad(i + 1, 5)}`,
      partyId: party.id,
      projectId,
      status,
      source: rnd.pick(LEAD_SOURCES),
      ownerPersonaId: projectId === g.primary && rnd.chance(0.75) ? g.owner : g.fallbackOwner,
      budget: { amount: `${rnd.int(18, 160) * 500000}.00`, currency: 'PKR' },
      createdAt: daysFromNow(-rnd.int(1, 60), rnd.int(4, 14)),
      ...(open ? { nextFollowUp: daysFromNow(rnd.int(-3, 10), rnd.int(5, 12)) } : {}),
    } satisfies Lead;
  });
}

export const LEADS: readonly Lead[] = generateLeads({ seed: 4411, parties: PARTIES, count: 120, idPrefix: 'led_', refPrefix: 'LD-2026-', primary: 'prj_heights', secondary: 'prj_gardens', primaryShare: 0.7, owner: 'sales', fallbackOwner: 'manager' });

export interface InvoiceGeneration {
  seed: number;
  units: readonly Unit[];
  parties: readonly Party[];
  /** How many sold units get a down payment and an instalment. */
  count: number;
  idPrefix: string;
  refPrefix: string;
  refBase: number;
}

export { billingAccountOf };

/** Fictional invoices for one tenant: a paid down payment and a current instalment per sold unit. */
export function generateInvoices(g: InvoiceGeneration): Invoice[] {
  const rnd = createRandom(g.seed);
  const sold = g.units.filter((u) => ['booked', 'allocated', 'handover_ready', 'handed_over', 'occupied'].includes(u.status));
  const invoices: Invoice[] = [];
  sold.slice(0, g.count).forEach((unit, i) => {
    const party = g.parties[i % g.parties.length]!;
    const down = percentOf(unit.price.amount, 10);
    const installment = percentOf(unit.price.amount, 5);
    invoices.push({
      id: `${g.idPrefix}${pad(invoices.length + 1, 4)}`,
      ref: `${g.refPrefix}${pad(g.refBase + invoices.length + 1, 6)}`,
      partyId: party.id,
      unitId: unit.id,
      projectId: unit.projectId,
      billingAccountId: billingAccountOf(unit.id),
      kind: 'down_payment',
      total: { amount: down, currency: 'PKR' },
      paid: { amount: down, currency: 'PKR' },
      dueDate: calendarDaysFromNow(-rnd.int(60, 120)),
      issuance: 'issued',
      settlement: 'paid',
      evidence: 'verified',
    });
    const settlement = rnd.weighted<InvoiceSettlement>([['unpaid', 6], ['partially_paid', 2], ['paid', 3]]);
    const evidence: EvidenceStatus =
      settlement === 'paid'
        ? 'verified'
        : rnd.weighted<EvidenceStatus>([['none', 5], ['submitted', 2], ['under_review', 2], ['needs_information', 1]]);
    invoices.push({
      id: `${g.idPrefix}${pad(invoices.length + 1, 4)}`,
      ref: `${g.refPrefix}${pad(g.refBase + invoices.length + 1, 6)}`,
      partyId: party.id,
      unitId: unit.id,
      projectId: unit.projectId,
      billingAccountId: billingAccountOf(unit.id),
      kind: 'installment',
      total: { amount: installment, currency: 'PKR' },
      paid: {
        amount: settlement === 'paid' ? installment : settlement === 'partially_paid' ? percentOf(installment, 40) : '0.00',
        currency: 'PKR',
      },
      dueDate: calendarDaysFromNow(rnd.int(-20, 30)),
      issuance: 'issued',
      settlement,
      evidence,
    });
  });
  return invoices;
}

export const INVOICES: readonly Invoice[] = generateInvoices({ seed: 9090, units: UNITS, parties: PARTIES, count: 30, idPrefix: 'inv_', refPrefix: 'INV-2026-', refBase: 1200 });

/** Fictional collection account shown on DEMO payment screens (bank code DEMO does not exist). */
export const DEMO_COLLECTION_ACCOUNT = {
  bankName: 'Demo Bank (fictional)',
  accountTitle: 'Larkspur Estates Collections (DEMO)',
  iban: buildIban('PK', 'DEMO0000001234567890'),
} as const;

export const NOTIFICATIONS: readonly AppNotification[] = [
  {
    id: 'ntf_001', titleKey: 'notifications.leadAssigned.title', bodyKey: 'notifications.leadAssigned.body',
    params: { ref: LEADS[0]!.ref }, createdAt: daysFromNow(0, 7), read: false,
    href: '/backoffice/crm/lead-360-workspace', audience: 'lead.view',
  },
  {
    id: 'ntf_002', titleKey: 'notifications.holdExpiring.title', bodyKey: 'notifications.holdExpiring.body',
    params: { unit: 'LH-A-1204' }, createdAt: daysFromNow(0, 6), read: false,
    href: '/backoffice/crm/hold-list', audience: 'unit.hold',
  },
  {
    id: 'ntf_003', titleKey: 'notifications.proofSubmitted.title', bodyKey: 'notifications.proofSubmitted.body',
    params: { ref: INVOICES[1]!.ref }, createdAt: daysFromNow(0, 5), read: false,
    href: '/backoffice/fin/unverified-transfers-queue', audience: 'finance.evidence.review',
  },
  {
    id: 'ntf_004', titleKey: 'notifications.invoiceOverdue.title', bodyKey: 'notifications.invoiceOverdue.body',
    params: { ref: INVOICES[3]!.ref }, createdAt: daysFromNow(-1, 10), read: true,
    href: '/backoffice/fin/invoice-workspace', audience: 'invoice.view',
  },
  {
    id: 'ntf_005', titleKey: 'notifications.visitTomorrow.title', bodyKey: 'notifications.visitTomorrow.body',
    params: { ref: LEADS[4]!.ref }, createdAt: daysFromNow(-1, 8), read: true,
    href: '/backoffice/crm/site-visits-calendar', audience: 'visit.schedule',
  },
  {
    id: 'ntf_006', titleKey: 'notifications.prototype.title', bodyKey: 'notifications.prototype.body',
    params: {}, createdAt: daysFromNow(-2, 9), read: true,
    href: '/backoffice/help/tours', audience: 'quickcreate.use',
  },
  {
    id: 'ntf_101', titleKey: 'notifications.installmentDue.title', bodyKey: 'notifications.installmentDue.body',
    params: { ref: INVOICES[1]!.ref }, createdAt: daysFromNow(0, 4), read: false,
    href: '/customer/portal/payments-dashboard', audience: 'portal.use',
  },
];

export const LEAD_ACTIVITY: readonly ActivityEvent[] = [
  { id: 'act_1', at: daysFromNow(0, 6), actorName: 'Bilal Ahmed', messageKey: 'activity.visitScheduled', params: { date: calendarDaysFromNow(2) }, kind: 'visit' },
  { id: 'act_2', at: daysFromNow(-1, 11), actorName: 'Bilal Ahmed', messageKey: 'activity.called', params: {}, kind: 'call' },
  { id: 'act_3', at: daysFromNow(-3, 7), actorName: 'Nadia Rahman', messageKey: 'activity.assigned', params: { name: 'Bilal Ahmed' }, kind: 'status' },
  { id: 'act_4', at: daysFromNow(-3, 6), actorName: 'System', messageKey: 'activity.created', params: { source: 'website' }, kind: 'system' },
];
