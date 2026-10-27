import type {
  AccessRecord,
  EvidenceStatus,
  InstalmentItem,
  InstalmentStatus,
  Money,
  PartyLink,
  PaymentMethod,
  PaymentProof,
  PlanSummary,
  PortalConstruction,
  PortalConstructionUpdate,
  PortalDocument,
  PortalDocuments,
  PortalHome,
  PortalOwner,
  PortalPayments,
  PortalProperty,
  PortalReceipt,
  PortalServices,
  ProjectMilestone,
  ReceiptDetail,
  ServiceRequest,
  VisitorPass,
} from '@repo/contracts';
import type { TenantDataset } from './dataset-types';
import { PERSONAS } from './people';
import { DEMO_COLLECTION_ACCOUNT } from './records';
import { FIXTURE_NOW, calendarDaysFromNow, createRandom, daysFromNow, pad, percentOf } from './seed';

/**
 * Customer portal fixtures (Stage 1.5R). Deterministic: every date is relative to FIXTURE_NOW and
 * every amount is integer-paisa arithmetic on 2-decimal strings (never floats).
 *
 * The story: the resident (Usman Tariq) bought LH-A-0101 in Larkspur Heights on a plan of 10 % down
 * and 36 monthly instalments. Tower A was handed over early (phased possession), so he lives there
 * while instalments continue and Towers B and C are still being built. Fourteen instalments are
 * verified; Finance asked for a clearer copy of the proof for the fifteenth; the sixteenth is due.
 */

export const PORTAL_PLAN = { downPaymentPercent: 10, instalments: 36, dueDay: 10, bookedMonthsAgo: 15, dueWindowDays: 30 } as const;
export const PORTAL_SECTION = 'portal';

/** Statuses that accept a proof upload or the simulated online payment. */
const PAYABLE: readonly InstalmentStatus[] = ['due', 'overdue', 'needs_information', 'upcoming'];

// ---------------------------------------------------------------------------------------------
// Money and calendar helpers
// ---------------------------------------------------------------------------------------------

export function toPaisa(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [whole = '0', frac = ''] = amount.replace('-', '').split('.');
  const paisa = BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
  return negative ? -paisa : paisa;
}

export function fromPaisa(paisa: bigint): string {
  const negative = paisa < 0n;
  const digits = (negative ? -paisa : paisa).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const pkr = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const sum = (amounts: Money[]) => amounts.reduce((total, m) => total + toPaisa(m.amount), 0n);

/** Calendar date `months` from the fixture month, on `day`. */
function monthDate(months: number, day: number): string {
  return new Date(Date.UTC(FIXTURE_NOW.getUTCFullYear(), FIXTURE_NOW.getUTCMonth() + months, day)).toISOString().slice(0, 10);
}

function addDays(calendarDate: string, days: number): string {
  const d = new Date(`${calendarDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` (calendar date) to `to` (calendar date). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const TODAY = FIXTURE_NOW.toISOString().slice(0, 10);

export function instalmentStatus(evidence: EvidenceStatus, dueDate: string, today = TODAY): InstalmentStatus {
  if (evidence === 'verified') return 'paid';
  if (evidence === 'submitted' || evidence === 'under_review') return 'awaiting_verification';
  if (evidence === 'needs_information') return 'needs_information';
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  return days <= PORTAL_PLAN.dueWindowDays ? 'due' : 'upcoming';
}

export const isPayable = (status: InstalmentStatus) => PAYABLE.includes(status);

// ---------------------------------------------------------------------------------------------
// Static portfolio for one owner
// ---------------------------------------------------------------------------------------------

/** Mirrors the Larkspur Heights milestones on the management dashboard (same fictional project). */
const HEIGHTS_MILESTONES: ProjectMilestone[] = [
  { key: 'land', progress: 1, date: '2024-03-15' },
  { key: 'foundation', progress: 1, date: '2024-12-20' },
  { key: 'structure', progress: 0.82, date: '2026-12-31' },
  { key: 'facade', progress: 0.34, date: '2027-06-30' },
  { key: 'interiors', progress: 0.08, date: '2027-12-31' },
  { key: 'handover', progress: 0, date: '2028-06-30' },
];

const TECHNICIAN_PHONE = '+923994418207';

interface Portfolio {
  /** The verified liability the portfolio is built from (flat, billing account, site, legal entity). */
  link: PartyLink;
  owner: PortalOwner;
  property: PortalProperty;
  /** Fixture schedule with evidence (statuses are derived on read). */
  schedule: InstalmentItem[];
  construction: PortalConstruction;
  documents: PortalDocument[];
  requests: ServiceRequest[];
  passes: VisitorPass[];
}

function buildSchedule(unitRef: string, price: string, bookedOn: string): InstalmentItem[] {
  const rnd = createRandom(36_0101);
  const down = percentOf(price, PORTAL_PLAN.downPaymentPercent);
  const remaining = toPaisa(price) - toPaisa(down);
  const regular = toPaisa(percentOf(price, (100 - PORTAL_PLAN.downPaymentPercent) / PORTAL_PLAN.instalments));
  const last = remaining - regular * BigInt(PORTAL_PLAN.instalments - 1);
  const of = PORTAL_PLAN.instalments;
  const methods: ReadonlyArray<readonly [PaymentMethod, number]> = [['bank_transfer', 6], ['cheque', 2], ['cash_deposit', 1]];
  const refBase = unitRef.replace(/^LH-/, '');

  const items: InstalmentItem[] = [
    {
      id: 'ins_00',
      ref: `INS-${refBase}-00`,
      number: 0,
      of,
      kind: 'down_payment',
      dueDate: bookedOn,
      amount: { amount: down, currency: 'PKR' },
      status: 'paid',
      evidence: 'verified',
    },
  ];
  for (let n = 1; n <= of; n++) {
    items.push({
      id: `ins_${pad(n, 2)}`,
      ref: `INS-${refBase}-${pad(n, 2)}`,
      number: n,
      of,
      kind: 'instalment',
      dueDate: monthDate(n - PORTAL_PLAN.bookedMonthsAgo, PORTAL_PLAN.dueDay),
      amount: pkr(n === of ? last : regular),
      status: 'upcoming',
      evidence: 'none',
    });
  }

  // Everything due before the most recent past due date is verified; that one is waiting for a clearer proof.
  const past = items.filter((i) => daysBetween(TODAY, i.dueDate) < 0);
  const latestPast = past.at(-1);
  for (const item of past) {
    if (item === latestPast && item.kind === 'instalment') {
      const submitted = addDays(item.dueDate, -1);
      item.evidence = 'needs_information';
      item.financeNoteKey = 'portal:payments.financeNote.unclear';
      item.proof = {
        submittedAt: `${submitted}T07:40:00.000Z`,
        method: 'bank_transfer',
        amount: item.amount,
        reference: `FT26${pad(rnd.int(10000000, 99999999), 8)}`,
        paidOn: submitted,
        fileName: 'transfer-slip.jpg',
        simulated: false,
      };
      continue;
    }
    const paidOn = item.kind === 'down_payment' ? item.dueDate : addDays(item.dueDate, -rnd.int(0, 4));
    item.evidence = 'verified';
    item.paidOn = paidOn;
    item.method = item.kind === 'down_payment' ? 'cheque' : rnd.weighted(methods);
    item.receiptId = `rcp_${pad(item.number, 2)}`;
  }
  return items;
}

function buildPortfolio(d: TenantDataset, partyId: string, link: PartyLink): Portfolio | null {
  const unit = d.units.find((u) => u.id === link.unitId);
  const party = d.parties.find((p) => p.id === partyId);
  const persona = PERSONAS.find((p) => p.tenantId === d.tenantId && p.partyId === partyId);
  if (!unit || !party) return null;
  const project = d.projects.find((p) => p.id === unit.projectId);
  if (!project || project.siteId !== link.siteId || project.legalEntityId !== link.legalEntityId) return null;
  const tower = d.towers.find((t) => t.id === unit.towerId);
  const floor = d.floors.find((f) => f.id === unit.floorId);
  const bookedOn = monthDate(-PORTAL_PLAN.bookedMonthsAgo, 7);

  const owner: PortalOwner = {
    partyId,
    customerRef: party.ref,
    displayName: persona?.displayName ?? party.displayName,
    phone: party.phone,
    email: persona?.email ?? party.email,
  };
  const property: PortalProperty = {
    unitId: unit.id,
    unitRef: unit.ref,
    projectId: project.id,
    projectName: project.name,
    city: project.city,
    towerName: tower?.name,
    floor: floor?.level,
    type: unit.type,
    areaSqft: unit.areaSqft,
    price: unit.price,
    imageKey: project.kind === 'towers' ? 'heights-dusk' : 'gardens-residences',
    bookedOn,
    possessionOn: monthDate(-4, 15),
  };

  const updates: PortalConstructionUpdate[] = [
    { id: 'cup_05', titleKey: 'portal:construction.updates.slab.title', bodyKey: 'portal:construction.updates.slab.body', params: { tower: 'B', floor: '12' }, imageKey: 'construction-cranes', at: daysFromNow(-1, 11), milestone: 'structure' },
    { id: 'cup_04', titleKey: 'portal:construction.updates.facade.title', bodyKey: 'portal:construction.updates.facade.body', params: { tower: 'B' }, imageKey: 'heights-dusk', at: daysFromNow(-19, 10), milestone: 'facade' },
    { id: 'cup_03', titleKey: 'portal:construction.updates.clubhouse.title', bodyKey: 'portal:construction.updates.clubhouse.body', params: {}, at: daysFromNow(-41, 9), milestone: 'structure' },
    { id: 'cup_02', titleKey: 'portal:construction.updates.towerC.title', bodyKey: 'portal:construction.updates.towerC.body', params: { tower: 'C', floor: '6' }, at: daysFromNow(-68, 12), milestone: 'structure' },
    { id: 'cup_01', titleKey: 'portal:construction.updates.interiors.title', bodyKey: 'portal:construction.updates.interiors.body', params: { tower: 'B' }, imageKey: 'interior-living-bright', at: daysFromNow(-96, 10), milestone: 'interiors' },
  ];

  const doc = (id: string, kind: PortalDocument['kind'], issuedAt: string, pages: number, sizeKb: number): PortalDocument => ({
    id,
    ref: `DOC-${unit.ref.replace(/^LH-/, '')}-${id.slice(4).toUpperCase()}`,
    kind,
    issuedAt,
    pages,
    sizeKb,
    isNew: daysBetween(issuedAt.slice(0, 10), TODAY) <= 30,
  });
  const documents: PortalDocument[] = [
    doc('doc_stmt', 'account_statement', daysFromNow(-25, 6), 3, 184),
    doc('doc_crpt', 'construction_report', daysFromNow(-12, 8), 6, 2140),
    doc('doc_poss', 'possession_letter', `${property.possessionOn}T06:00:00.000Z`, 2, 312),
    doc('doc_allt', 'allotment_letter', `${addDays(bookedOn, 13)}T06:00:00.000Z`, 2, 268),
    doc('doc_plan', 'payment_plan', `${bookedOn}T07:00:00.000Z`, 4, 221),
    doc('doc_book', 'booking_form', `${bookedOn}T06:30:00.000Z`, 5, 640),
  ];

  const requests: ServiceRequest[] = [
    {
      id: 'srq_0412',
      ref: 'SR-2026-0412',
      category: 'plumbing',
      description: 'Master bathroom tap keeps dripping after it is closed.',
      preferredDate: calendarDaysFromNow(1),
      status: 'scheduled',
      createdAt: daysFromNow(-2, 14),
      visitAt: daysFromNow(1, 5),
      technician: { name: 'Asif Mehmood', phone: TECHNICIAN_PHONE },
    },
    {
      id: 'srq_0377',
      ref: 'SR-2026-0377',
      category: 'electrical',
      description: 'Balcony light fitting flickers and needs replacing.',
      status: 'resolved',
      createdAt: daysFromNow(-16, 9),
      visitAt: daysFromNow(-14, 6),
      technician: { name: 'Kamran Butt', phone: '+923995530419' },
    },
  ];

  const passes: VisitorPass[] = [
    { id: 'vps_0091', ref: 'VP-2026-0091', code: 'LKS-4821', visitorName: 'Sana Iqbal', phone: '+923996601273', purpose: 'family', visitDate: calendarDaysFromNow(1), status: 'active', createdAt: daysFromNow(-1, 15) },
    { id: 'vps_0087', ref: 'VP-2026-0087', code: 'LKS-3307', visitorName: 'Demo Express courier', purpose: 'delivery', visitDate: calendarDaysFromNow(-6), status: 'used', createdAt: daysFromNow(-7, 10) },
  ];

  return {
    link,
    owner,
    property,
    schedule: buildSchedule(unit.ref, unit.price.amount, bookedOn),
    construction: { projectId: project.id, projectName: project.name, progress: 0.64, completion: '2028-06-30', milestones: HEIGHTS_MILESTONES, updates },
    documents,
    requests,
    passes,
  };
}

const portfolios = new Map<string, Portfolio | null>();

/**
 * The owner's fixture portfolio for one liability (cached: fixtures are immutable). Null when the
 * link does not match the tenant's records (unknown flat, or a site or legal entity that disagrees).
 */
export function portfolioFor(d: TenantDataset, partyId: string, link: PartyLink): Portfolio | null {
  const key = `${d.tenantId}:${partyId}:${link.billingAccountId}`;
  if (!portfolios.has(key)) portfolios.set(key, buildPortfolio(d, partyId, link));
  return portfolios.get(key)!;
}

/** Access facts of a portfolio record dated `asOf`: the full liability (flat, account, site, entity). */
export const liabilityRecord = (link: PartyLink, asOf: string): AccessRecord => ({
  unitId: link.unitId,
  billingAccountId: link.billingAccountId,
  siteId: link.siteId,
  legalEntityId: link.legalEntityId,
  asOf,
});

export type { Portfolio };

// ---------------------------------------------------------------------------------------------
// Session overlay (writes made while exploring the demo)
// ---------------------------------------------------------------------------------------------

export interface PortalSessionState {
  /** Proofs uploaded (or simulated online payments) this session, by instalment id. */
  proofs: Record<string, PaymentProof>;
  requests: ServiceRequest[];
  passes: VisitorPass[];
}

export const emptyPortalSession = (): PortalSessionState => ({ proofs: {}, requests: [], passes: [] });

// ---------------------------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------------------------

export function portalSchedule(p: Portfolio, session: PortalSessionState): InstalmentItem[] {
  return p.schedule.map((base) => {
    const proof = session.proofs[base.id];
    const item: InstalmentItem = proof
      ? { ...base, evidence: 'submitted', proof, changedInSession: true, financeNoteKey: undefined }
      : { ...base };
    if (!item.financeNoteKey) delete item.financeNoteKey;
    item.status = instalmentStatus(item.evidence, item.dueDate);
    return item;
  });
}

export function planSummary(property: PortalProperty, schedule: InstalmentItem[]): PlanSummary {
  const by = (status: InstalmentStatus) => schedule.filter((i) => i.status === status);
  const paid = sum(by('paid').map((i) => i.amount));
  const price = toPaisa(property.price.amount);
  return {
    totalPrice: property.price,
    paidToDate: pkr(paid),
    outstanding: pkr(price - paid),
    overdue: pkr(sum(by('overdue').map((i) => i.amount))),
    awaitingVerification: pkr(sum(by('awaiting_verification').map((i) => i.amount))),
    paidCount: by('paid').filter((i) => i.kind === 'instalment').length,
    instalmentCount: schedule.filter((i) => i.kind === 'instalment').length,
    paidShare: price > 0n ? Number((paid * 10000n) / price) / 10000 : 0,
  };
}

export function portalReceipts(schedule: InstalmentItem[]): PortalReceipt[] {
  const rnd = createRandom(4_2026);
  return schedule
    .filter((i) => i.status === 'paid' && i.receiptId && i.paidOn && i.method)
    .map((i) => ({
      id: i.receiptId!,
      ref: `RCP-${i.paidOn!.slice(0, 4)}-${pad(7100 + i.number, 6)}`,
      instalmentId: i.id,
      instalmentNumber: i.number,
      of: i.of,
      kind: i.kind,
      period: i.dueDate,
      amount: i.amount,
      verifiedAt: `${addDays(i.paidOn!, rnd.int(1, 2))}T0${rnd.int(5, 9)}:${pad(rnd.int(0, 59), 2)}:00.000Z`,
      paidOn: i.paidOn!,
      method: i.method!,
      bankReference: i.method === 'cheque' ? `CHQ-${pad(rnd.int(100000, 999999), 6)}` : `FT${i.paidOn!.slice(2, 4)}${pad(rnd.int(10000000, 99999999), 8)}`,
    }))
    .reverse();
}

/** First instalment that is not paid and not waiting for a new upload, in plan order. */
function nextInstalment(schedule: InstalmentItem[]): InstalmentItem | null {
  return schedule.find((i) => i.status !== 'paid' && i.status !== 'needs_information') ?? null;
}

export function buildPortalHome(p: Portfolio, session: PortalSessionState): PortalHome {
  const schedule = portalSchedule(p, session);
  const services = portalServices(p, session);
  return {
    asOf: FIXTURE_NOW.toISOString(),
    owner: p.owner,
    property: p.property,
    plan: planSummary(p.property, schedule),
    nextInstalment: nextInstalment(schedule),
    attention: schedule.filter((i) => i.status === 'needs_information' || i.status === 'overdue'),
    recentReceipts: portalReceipts(schedule).slice(0, 3),
    construction: {
      projectName: p.construction.projectName,
      progress: p.construction.progress,
      milestones: p.construction.milestones,
      latest: p.construction.updates[0] ?? null,
    },
    documents: { count: p.documents.length, newCount: p.documents.filter((d) => d.isNew).length },
    services: {
      openRequests: services.requests.filter((r) => r.status !== 'resolved').length,
      activePasses: services.passes.filter((v) => v.status === 'active').length,
    },
  };
}

export function buildPortalPayments(p: Portfolio, session: PortalSessionState): PortalPayments {
  const schedule = portalSchedule(p, session);
  return {
    asOf: FIXTURE_NOW.toISOString(),
    property: p.property,
    plan: planSummary(p.property, schedule),
    schedule,
    receipts: portalReceipts(schedule),
    collectionAccount: { ...DEMO_COLLECTION_ACCOUNT },
  };
}

export function receiptDetail(p: Portfolio, session: PortalSessionState, receiptId: string): ReceiptDetail | null {
  const receipt = portalReceipts(portalSchedule(p, session)).find((r) => r.id === receiptId);
  return receipt ? { ...receipt, owner: p.owner, property: p.property, verifiedBy: 'Farah Javed' } : null;
}

export function portalServices(p: Portfolio, session: PortalSessionState): PortalServices {
  return {
    asOf: FIXTURE_NOW.toISOString(),
    unitRef: p.property.unitRef,
    requests: [...session.requests, ...p.requests],
    passes: [...session.passes, ...p.passes],
  };
}

export function portalDocuments(p: Portfolio): PortalDocuments {
  return { asOf: FIXTURE_NOW.toISOString(), owner: p.owner, property: p.property, documents: p.documents };
}

/** Gate code for a pass created this session (deterministic per demo counter). */
export function passCode(counter: number): string {
  return `LKS-${pad(1000 + ((counter * 7919) % 9000), 4)}`;
}
