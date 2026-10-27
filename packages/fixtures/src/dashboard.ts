import {
  DASHBOARD_RANGES,
  type AttentionItem,
  type AttentionKind,
  type CollectionsPoint,
  type DashboardKpi,
  type DashboardRange,
  type DashboardSummary,
  type FunnelStage,
  type InventoryBucket,
  type InventoryRow,
  type KpiId,
  type Permission,
  type ProjectMilestone,
  type ProjectShowcase,
  type ResidenceSummary,
  type Unit,
  type UnitStatus,
  type UnitType,
} from '@repo/contracts';
import type { TenantDataset } from './dataset-types';
import { FIXTURE_NOW, createRandom, daysFromNow } from './seed';

/**
 * HOME-001 dashboard read model. Snapshot figures (inventory, prices, holds, follow-ups, proofs)
 * come straight from the other fixtures; flows over time (enquiries, bookings, collections) are a
 * deterministic 24-month synthetic history per project, so every range has a comparison period.
 * Built from the signed-in tenant's own records only; inventory figures (units, availability,
 * residences, holds, project cards) cover only sites whose inventory module is licensed.
 */

const MONTHS = 24; // Nov 2024 … Oct 2026; index 23 is the current month
const CURRENT = MONTHS - 1;
const DAY_OF_MONTH = FIXTURE_NOW.getUTCDate();
const DAYS_IN_MONTH = new Date(Date.UTC(FIXTURE_NOW.getUTCFullYear(), FIXTURE_NOW.getUTCMonth() + 1, 0)).getUTCDate();
const PARTIAL = DAY_OF_MONTH / DAYS_IN_MONTH;

function monthStart(index: number): string {
  const d = new Date(Date.UTC(FIXTURE_NOW.getUTCFullYear(), FIXTURE_NOW.getUTCMonth() - (CURRENT - index), 1));
  return d.toISOString().slice(0, 10);
}

function monthEnd(index: number): string {
  if (index === CURRENT) return FIXTURE_NOW.toISOString().slice(0, 10);
  const d = new Date(Date.UTC(FIXTURE_NOW.getUTCFullYear(), FIXTURE_NOW.getUTCMonth() - (CURRENT - index) + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** [first, last] month indexes for the range and its comparison period. */
function rangeMonths(range: DashboardRange): { current: [number, number]; previous: [number, number] } {
  switch (range) {
    case '3m':
      return { current: [CURRENT - 2, CURRENT], previous: [CURRENT - 5, CURRENT - 3] };
    case '6m':
      return { current: [CURRENT - 5, CURRENT], previous: [CURRENT - 11, CURRENT - 6] };
    case 'ytd': {
      const jan = CURRENT - FIXTURE_NOW.getUTCMonth();
      return { current: [jan, CURRENT], previous: [jan - 12, CURRENT - 12] };
    }
    case '12m':
      return { current: [CURRENT - 11, CURRENT], previous: [0, CURRENT - 12] };
  }
}

interface Month {
  enquiries: number;
  contacted: number;
  visits: number;
  qualified: number;
  booked: number;
  bookingValue: number;
  scheduled: number;
  collected: number;
}

const PROFILE: Record<string, { seed: number; enquiries: number; bookings: number; avgBooking: number; scheduled: number; growth: number }> = {
  prj_heights: { seed: 3101, enquiries: 78, bookings: 4.6, avgBooking: 30_500_000, scheduled: 112_000_000, growth: 0.016 },
  prj_gardens: { seed: 3102, enquiries: 44, bookings: 3.1, avgBooking: 23_500_000, scheduled: 49_000_000, growth: 0.011 },
  prj_cb_towers: { seed: 3201, enquiries: 36, bookings: 2.4, avgBooking: 27_000_000, scheduled: 41_000_000, growth: 0.013 },
  prj_cb_plaza: { seed: 3202, enquiries: 12, bookings: 0.8, avgBooking: 21_000_000, scheduled: 9_000_000, growth: 0.006 },
};
/** A project without a profile still gets a modest, deterministic history (never a crash). */
const DEFAULT_PROFILE = { seed: 3999, enquiries: 10, bookings: 0.5, avgBooking: 15_000_000, scheduled: 5_000_000, growth: 0.005 };

const thousand = (n: number) => Math.round(n / 1000) * 1000;

function history(projectId: string): Month[] {
  const p = PROFILE[projectId] ?? DEFAULT_PROFILE;
  const rnd = createRandom(p.seed);
  return Array.from({ length: MONTHS }, (_, i) => {
    const season = 1 + 0.12 * Math.sin(((i + 2) / 12) * 2 * Math.PI);
    const g = (1 + p.growth) ** i;
    const scale = i === CURRENT ? PARTIAL : 1;
    const enquiries = Math.round(p.enquiries * season * g * (0.86 + 0.28 * rnd.next()) * scale);
    const contacted = Math.round(enquiries * (0.66 + 0.1 * rnd.next()));
    const visits = Math.round(contacted * (0.42 + 0.1 * rnd.next()));
    const qualified = Math.round(visits * (0.55 + 0.13 * rnd.next()));
    const booked = Math.min(qualified, Math.round(p.bookings * season * g * (0.8 + 0.4 * rnd.next()) * scale));
    const bookingValue = thousand(booked * p.avgBooking * (0.9 + 0.22 * rnd.next()));
    const scheduled = thousand(p.scheduled * g * (0.95 + 0.11 * rnd.next()) * scale);
    const collected = thousand(scheduled * (0.84 + 0.18 * rnd.next()));
    return { enquiries, contacted, visits, qualified, booked, bookingValue, scheduled, collected };
  });
}

const HISTORY = new Map<string, Month[]>();
const historyOf = (projectId: string): Month[] => {
  if (!HISTORY.has(projectId)) HISTORY.set(projectId, history(projectId));
  return HISTORY.get(projectId)!;
};

const BUCKET_OF: Partial<Record<UnitStatus, InventoryBucket>> = {
  available: 'available',
  held: 'onHold',
  reserved: 'onHold',
  booked: 'sold',
  allocated: 'sold',
  handover_ready: 'handedOver',
  handed_over: 'handedOver',
  occupied: 'handedOver',
};

interface Showcase {
  imageKey: string;
  progress: number;
  completion: string;
  milestones: ProjectMilestone[];
  report: { titleKey: string; bodyKey: string; params: Record<string, string> };
}

const SHOWCASE: Record<string, Showcase> = {
  prj_heights: {
    imageKey: 'heights-dusk',
    progress: 0.64,
    completion: '2028-06-30',
    milestones: [
      { key: 'land', progress: 1, date: '2024-03-15' },
      { key: 'foundation', progress: 1, date: '2024-12-20' },
      { key: 'structure', progress: 0.82, date: '2026-12-31' },
      { key: 'facade', progress: 0.34, date: '2027-06-30' },
      { key: 'interiors', progress: 0.08, date: '2027-12-31' },
      { key: 'handover', progress: 0, date: '2028-06-30' },
    ],
    report: { titleKey: 'construction.reports.heights.title', bodyKey: 'construction.reports.heights.body', params: { tower: 'B', floor: '12' } },
  },
  prj_gardens: {
    imageKey: 'gardens-residences',
    progress: 0.41,
    completion: '2027-09-30',
    milestones: [
      { key: 'land', progress: 1, date: '2024-06-30' },
      { key: 'roads', progress: 0.76, date: '2026-12-31' },
      { key: 'utilities', progress: 0.42, date: '2027-03-31' },
      { key: 'landscaping', progress: 0.12, date: '2027-06-30' },
      { key: 'possession', progress: 0, date: '2027-09-30' },
    ],
    report: { titleKey: 'construction.reports.gardens.title', bodyKey: 'construction.reports.gardens.body', params: { phase: 'Phase 2' } },
  },
  prj_cb_towers: {
    imageKey: 'heights-dusk',
    progress: 0.38,
    completion: '2028-12-31',
    milestones: [
      { key: 'land', progress: 1, date: '2025-02-28' },
      { key: 'foundation', progress: 1, date: '2025-11-30' },
      { key: 'structure', progress: 0.46, date: '2027-06-30' },
      { key: 'facade', progress: 0, date: '2028-03-31' },
      { key: 'interiors', progress: 0, date: '2028-09-30' },
      { key: 'handover', progress: 0, date: '2028-12-31' },
    ],
    report: { titleKey: 'construction.reports.heights.title', bodyKey: 'construction.reports.heights.body', params: { tower: 'A', floor: '4' } },
  },
};

const RESIDENCE_IMAGE: Record<UnitType, string | null> = {
  apartment_1bed: 'interior-living-bright',
  apartment_2bed: 'interior-living-city',
  apartment_3bed: 'interior-kitchen',
  penthouse: 'view-dusk-window',
  villa: 'gardens-residences',
  plot: null,
  shop: null,
};

const ROUTES = {
  salesHome: '/backoffice/crm/sales-home',
  collections: '/backoffice/col/collections-dashboard',
  receivables: '/backoffice/col/receivables-list',
  unitMatrix: '/backoffice/inv/unit-matrix',
  pipeline: '/backoffice/crm/opportunities-pipeline',
  verificationQueue: '/backoffice/fin/unverified-transfers-queue',
  lead: '/backoffice/crm/lead-360-workspace',
  holds: '/backoffice/crm/hold-list',
  invoice: '/backoffice/fin/invoice-workspace',
  project: '/backoffice/prj/project-360-workspace',
  constructionUpdates: '/backoffice/con/construction-update-list',
};

const money = (n: number) => ({ amount: `${Math.round(n)}.00`, currency: 'PKR' as const });
export interface DashboardContext {
  /** The signed-in tenant's own records. */
  data: TenantDataset;
  /** Permission held and its module licensed. */
  can: (permission: Permission) => boolean;
  /** Persona scope and the header project filter. */
  allowsProject: (projectId: string) => boolean;
  /** The project's site has inventory licensed (and the person may see it). */
  inventoryOn: (projectId: string) => boolean;
  /** The project's site has construction licensed. */
  constructionOn: (projectId: string) => boolean;
  range: unknown;
}

export function buildDashboard(ctx: DashboardContext): DashboardSummary {
  const range: DashboardRange = DASHBOARD_RANGES.includes(ctx.range as DashboardRange) ? (ctx.range as DashboardRange) : '6m';
  const { can, data } = ctx;
  const partyName = (id: string) => data.parties.find((p) => p.id === id)?.displayName ?? '';
  const projects = data.projects.filter((p) => ctx.allowsProject(p.id));
  const units = data.units.filter((u) => ctx.allowsProject(u.projectId) && ctx.inventoryOn(u.projectId));
  const { current, previous } = rangeMonths(range);

  /** Sum a monthly measure over allowed projects for [from, to] month indexes. */
  const sum = (key: keyof Month, [from, to]: [number, number]) =>
    projects.reduce((total, p) => total + historyOf(p.id).slice(from, to + 1).reduce((s, m) => s + m[key], 0), 0);
  const series = (key: keyof Month) =>
    Array.from({ length: 12 }, (_, k) => {
      const i = CURRENT - 11 + k;
      return projects.reduce((s, p) => s + historyOf(p.id)[i]![key], 0);
    });

  const availableNow = units.filter((u) => u.status === 'available').length;
  const openLeads = data.leads.filter((l) => ctx.allowsProject(l.projectId) && !['converted', 'lost', 'unqualified'].includes(l.status));

  const kpi: Record<KpiId, () => DashboardKpi> = {
    salesBooked: () => ({
      id: 'salesBooked', format: 'money', better: 'up', href: ROUTES.salesHome, reference: null,
      value: money(sum('bookingValue', current)).amount,
      previous: money(sum('bookingValue', previous)).amount,
      trend: series('bookingValue'),
    }),
    collected: () => ({
      id: 'collected', format: 'money', better: 'up', href: ROUTES.collections,
      value: money(sum('collected', current)).amount,
      previous: money(sum('collected', previous)).amount,
      reference: { kind: 'target', value: money(sum('scheduled', current)).amount },
      trend: series('collected'),
    }),
    available: () => {
      // Units available at the start of the range = available now + units booked during it.
      const bookedInRange = sum('booked', current);
      const booked = series('booked');
      const trend = booked.map((_, k) => availableNow + booked.slice(k + 1).reduce((s, b) => s + b, 0));
      return {
        id: 'available', format: 'count', better: 'down', href: ROUTES.unitMatrix,
        value: String(availableNow),
        previous: String(Math.min(units.length, availableNow + bookedInRange)),
        reference: { kind: 'total', value: String(units.length) },
        trend,
      };
    },
    conversion: () => {
      const rate = (r: [number, number]) => {
        const enq = sum('enquiries', r);
        return enq ? sum('booked', r) / enq : 0;
      };
      const enq = series('enquiries');
      const booked = series('booked');
      return {
        id: 'conversion', format: 'percent', better: 'up', href: ROUTES.pipeline, reference: null,
        value: rate(current).toFixed(4),
        previous: rate(previous).toFixed(4),
        trend: enq.map((e, k) => (e ? booked[k]! / e : 0)),
      };
    },
    pipeline: () => ({
      id: 'pipeline', format: 'money', better: 'up', href: ROUTES.pipeline, previous: null,
      value: money(openLeads.reduce((s, l) => s + Number(l.budget.amount), 0)).amount,
      reference: { kind: 'openLeads', value: String(openLeads.length) },
      trend: series('qualified').map((q) => q * 31_000_000),
    }),
    receivables: () => {
      const outstanding = (to: number) =>
        42_000_000 + projects.reduce((s, p) => s + historyOf(p.id).slice(Math.max(0, to - 11), to + 1).reduce((a, m) => a + Math.max(0, m.scheduled - m.collected), 0), 0);
      return {
        id: 'receivables', format: 'money', better: 'down', href: ROUTES.receivables, reference: null,
        value: money(thousand(outstanding(current[1]))).amount,
        previous: money(thousand(outstanding(previous[1]))).amount,
        trend: Array.from({ length: 12 }, (_, k) => outstanding(CURRENT - 11 + k)),
      };
    },
    verifications: () => {
      const pending = data.invoices.filter((i) => ctx.allowsProject(i.projectId) && ['submitted', 'under_review', 'needs_information'].includes(i.evidence)).length;
      return {
        id: 'verifications', format: 'count', better: 'down', href: ROUTES.verificationQueue, reference: null,
        value: String(pending), previous: null,
        trend: [3, 5, 4, 6, 5, 7, 4, 6, 8, 5, 7, pending],
      };
    },
  };

  const salesSide = can('lead.view');
  const financeSide = can('invoice.view');
  const order: KpiId[] =
    salesSide && financeSide
      ? ['salesBooked', 'collected', 'available', 'conversion']
      : salesSide
        ? ['salesBooked', 'conversion', 'pipeline', 'available']
        : ['collected', 'receivables', 'verifications', 'salesBooked'];
  const permitted: Record<KpiId, boolean> = {
    salesBooked: can('booking.view') || salesSide,
    collected: financeSide,
    available: can('unit.view'),
    conversion: salesSide,
    pipeline: salesSide,
    receivables: financeSide,
    verifications: can('finance.evidence.review'),
  };

  const collections: CollectionsPoint[] | null = financeSide
    ? Array.from({ length: current[1] - current[0] + 1 }, (_, k) => {
        const i = current[0] + k;
        return {
          period: monthStart(i),
          collected: money(sum('collected', [i, i])).amount,
          scheduled: money(sum('scheduled', [i, i])).amount,
          partial: i === CURRENT,
        };
      })
    : null;

  const inventory: InventoryRow[] | null = can('unit.view')
    ? [
        ...data.towers.filter((t) => ctx.allowsProject(t.projectId) && ctx.inventoryOn(t.projectId)).map((t) => inventoryRow(t.id, t.projectId, t.name, 'tower', units.filter((u) => u.towerId === t.id))),
        ...data.blocks
          .filter((b) => ctx.allowsProject(b.projectId) && ctx.inventoryOn(b.projectId))
          .map((b) => inventoryRow(b.id, b.projectId, b.label, 'phase', units.filter((u) => u.projectId === b.projectId && u.block === b.label))),
      ]
    : null;

  const funnel = salesSide
    ? (['enquiries', 'contacted', 'visits', 'qualified', 'booked'] as const).map((stage) => ({
        stage: stage as FunnelStage,
        count: sum(stage, current),
      }))
    : null;

  // Project cards show unit figures, so only projects on sites with licensed inventory get one.
  const carded = projects.filter((p) => ctx.inventoryOn(p.id) && SHOWCASE[p.id]);
  const showcase: ProjectShowcase[] = carded.map((p) => {
    const own = data.units.filter((u) => u.projectId === p.id);
    const sold = own.filter((u) => BUCKET_OF[u.status] === 'sold' || BUCKET_OF[u.status] === 'handedOver');
    const available = own.filter((u) => u.status === 'available');
    const s = SHOWCASE[p.id]!;
    const built = ctx.constructionOn(p.id);
    return {
      // A commercial building is presented like a tower block (floors and units).
      id: p.id, ref: p.ref, name: p.name, city: p.city, kind: p.kind === 'plots' ? 'plots' : 'towers',
      imageKey: s.imageKey, progress: built ? s.progress : 0, completion: s.completion, milestones: built ? s.milestones : [],
      units: { total: own.length, available: available.length, sold: sold.length },
      salesValue: money(sold.reduce((sum, u) => sum + Number(u.price.amount), 0)),
      fromPrice: money(available.length ? Math.min(...available.map((u) => Number(u.price.amount))) : 0),
      href: `${ROUTES.project}?record=${p.id}`,
    };
  });

  const residences: ResidenceSummary[] | null = can('unit.view')
    ? (['apartment_1bed', 'apartment_2bed', 'apartment_3bed', 'penthouse', 'villa', 'plot'] as const).flatMap((type): ResidenceSummary[] => {
          const ofType = units.filter((u) => u.type === type);
          if (!ofType.length) return [];
          const available = ofType.filter((u) => u.status === 'available');
          const pool = available.length ? available : ofType;
          const project = data.projects.find((p) => p.id === ofType[0]!.projectId)!;
          return [{
            type, projectId: project.id, projectName: project.name,
            total: ofType.length, available: available.length,
            fromPrice: money(Math.min(...pool.map((u) => Number(u.price.amount)))),
            avgArea: Math.round(ofType.reduce((s, u) => s + u.areaSqft, 0) / ofType.length),
            imageKey: RESIDENCE_IMAGE[type],
            href: `${ROUTES.unitMatrix}?record=${type}`,
          }];
        })
    : null;

  const attention: Partial<Record<AttentionKind, AttentionItem[]>> = {};
  const now = FIXTURE_NOW.getTime();
  if (can('finance.evidence.review')) {
    attention.verification = data.invoices.filter((i) => ctx.allowsProject(i.projectId) && ['submitted', 'under_review', 'needs_information'].includes(i.evidence)).map((i, k) => ({
      id: `att_v_${i.id}`, kind: 'verification', ref: i.ref, name: partyName(i.partyId),
      amount: i.total, at: daysFromNow(-(k % 3), 8 + ((k * 3) % 7)), urgent: i.evidence === 'needs_information',
      href: `${ROUTES.verificationQueue}?record=${i.id}`,
    }));
  }
  if (salesSide) {
    attention.followUp = data.leads.filter((l) => ctx.allowsProject(l.projectId) && l.nextFollowUp && new Date(l.nextFollowUp).getTime() <= now + 36 * 3600_000)
      .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!))
      .slice(0, 8)
      .map((l) => ({
        id: `att_f_${l.id}`, kind: 'followUp', ref: l.ref, name: partyName(l.partyId), amount: l.budget,
        at: l.nextFollowUp!, urgent: new Date(l.nextFollowUp!).getTime() < now, href: `${ROUTES.lead}?record=${l.id}`,
      }));
  }
  if (can('unit.hold')) {
    attention.hold = units.filter((u) => u.status === 'held')
      .map((u, k) => ({ u, hours: ((k * 7) % 46) + 2 }))
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 8)
      .map(({ u, hours }) => ({
        id: `att_h_${u.id}`, kind: 'hold', ref: u.ref, name: u.ref, amount: u.price,
        at: new Date(now + hours * 3600_000).toISOString(), urgent: hours < 12, href: `${ROUTES.holds}?record=${u.id}`,
      }));
  }
  if (financeSide) {
    const today = FIXTURE_NOW.toISOString().slice(0, 10);
    attention.overdue = data.invoices.filter((i) => ctx.allowsProject(i.projectId) && i.settlement !== 'paid' && i.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8)
      .map((i) => ({
        id: `att_o_${i.id}`, kind: 'overdue', ref: i.ref, name: partyName(i.partyId),
        amount: money(Number(i.total.amount) - Number(i.paid.amount)), at: `${i.dueDate}T00:00:00.000Z`, urgent: true,
        href: `${ROUTES.invoice}?record=${i.id}`,
      }));
  }

  // The latest site report comes from the first project whose site has construction licensed.
  const lead = projects.find((p) => SHOWCASE[p.id] && ctx.constructionOn(p.id));
  const construction = lead
    ? {
        id: `upd_${lead.id}`,
        projectId: lead.id,
        projectName: lead.name,
        titleKey: SHOWCASE[lead.id]!.report.titleKey,
        bodyKey: SHOWCASE[lead.id]!.report.bodyKey,
        params: SHOWCASE[lead.id]!.report.params,
        imageKey: 'construction-cranes',
        at: daysFromNow(-1, 11),
        progress: SHOWCASE[lead.id]!.progress,
        href: `${ROUTES.constructionUpdates}?record=${lead.id}`,
      }
    : null;

  return {
    range,
    asOf: FIXTURE_NOW.toISOString(),
    period: { start: monthStart(current[0]), end: monthEnd(current[1]), previousStart: monthStart(previous[0]), previousEnd: monthEnd(previous[1]) },
    kpis: order.filter((id) => permitted[id]).map((id) => kpi[id]()),
    collections,
    inventory,
    funnel,
    projects: showcase,
    residences,
    attention,
    construction,
  };
}

function inventoryRow(id: string, projectId: string, label: string, kind: 'tower' | 'phase', units: readonly Unit[]): InventoryRow {
  const counts: Record<InventoryBucket, number> = { available: 0, onHold: 0, sold: 0, handedOver: 0 };
  let other = 0;
  for (const u of units) {
    const bucket = BUCKET_OF[u.status];
    if (bucket) counts[bucket]++;
    else other++;
  }
  return { id, projectId, label, kind, counts, other, href: `${ROUTES.unitMatrix}?record=${id}` };
}
