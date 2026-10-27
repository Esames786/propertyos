import type { BillingCalculation, MeterEvidence, TenantDetail, TenantUsage, UsageDimension, UsageSnapshot } from '@repo/contracts';
import { datasetFor } from '../datasets';
import { configOn, currentRecord, tenantQuantities } from './amendments';
import { TODAY } from './config';
import { notFound, type PlatformContext, type PlatformHandler } from './kit';
import { billingPeriods, fromPaisa, pricePeriod, toPaisa } from './pricing';

/**
 * Usage meters, snapshots and evidence (HQ-014, HQ-015) and the billing calculation they feed.
 * The metering job (Gate G) counts at the start of each billing month; these fixtures are what it
 * would have recorded. Evidence lists flat codes and reasons only, never personal data, and the
 * calculation runs the same pricing engine on the snapshot counts (non-authoritative until platform
 * billing exists).
 */

const MONTHS = ['2026-08', '2026-09', '2026-10'] as const;

interface MeterSeed {
  dimension: UsageDimension;
  /** Value per month (undefined = no snapshot that month). */
  values: ReadonlyArray<number | undefined>;
  source?: UsageSnapshot['source'];
  correction?: { month: string; from: number; reason: string; by: string };
}

const SEEDS: Record<string, readonly MeterSeed[]> = {
  tnt_larkspur: [
    { dimension: 'units.registered', values: [496, 496, 496] },
    { dimension: 'seats.staff_active', values: [13, 14, 14] },
    { dimension: 'sites.licensed', values: [2, 2, 2] },
  ],
  tnt_riverbend: [
    { dimension: 'units.eligible', values: [232, 232, 228], correction: { month: '2026-10', from: 232, reason: 'Four flats in Riverbend Heights were merged into two; the client disputed the count with the building plan.', by: 'Iqra Rana' } },
    { dimension: 'sites.licensed', values: [3, 3, 3] },
    { dimension: 'buildings.active', values: [5, 5, 5] },
  ],
  tnt_cedar: [
    // Suspended on 30 September: no October count was taken.
    { dimension: 'units.eligible', values: [60, 60, undefined] },
    { dimension: 'sites.licensed', values: [1, 1, undefined] },
  ],
  tnt_shalimar: [
    { dimension: 'units.eligible', values: [64, 64, 64] },
    { dimension: 'sites.licensed', values: [1, 1, 1] },
  ],
  tnt_maple: [{ dimension: 'units.eligible', values: [undefined, undefined, 40], source: 'declared' }],
  tnt_crescent: [
    { dimension: 'units.registered', values: [undefined, undefined, 66] },
    { dimension: 'seats.staff_active', values: [undefined, undefined, 6] },
    { dimension: 'sites.licensed', values: [undefined, undefined, 2] },
  ],
};

const DEFINITION: Partial<Record<UsageDimension, string>> = {
  'units.registered': 'units.registered@1',
  'units.eligible': 'units.eligible@1',
  'seats.staff_active': 'seats.staff_active@1',
  'sites.licensed': 'sites.licensed@1',
  'buildings.active': 'buildings.active@1',
};

export function snapshotsOf(tenantId: string): UsageSnapshot[] {
  return (SEEDS[tenantId] ?? []).flatMap((m) =>
    MONTHS.flatMap((period, i): UsageSnapshot[] => {
      const value = m.values[i];
      if (value === undefined) return [];
      const corrected = m.correction?.month === period ? m.correction : undefined;
      return [
        {
          id: `snp_${tenantId.slice(4)}_${m.dimension.replace('.', '_')}_${period.replace('-', '')}`,
          tenantId,
          dimension: m.dimension,
          period,
          capturedAt: `${period}-01T02:00:00Z`,
          value,
          source: m.source ?? 'counted',
          status: corrected ? 'corrected' : 'captured',
          definition: DEFINITION[m.dimension] ?? `${m.dimension}@1`,
          ...(corrected ? { correction: { from: corrected.from, to: value, reason: corrected.reason, by: corrected.by } } : {}),
        },
      ];
    }),
  );
}

// ---------------------------------------------------------------- evidence (codes and reasons only)

type Flat = { code: string; site: string; excluded?: string };

/** Flats behind a tenant's unit counts: from its own unit register when the demo has one. */
function flatsOf(t: TenantDetail): Flat[] {
  const d = datasetFor(t.id);
  if (d && d.units.length) {
    const site = (projectId: string) => t.sites.find((s) => s.id === d.projects.find((p) => p.id === projectId)?.siteId)?.name;
    return d.units.map((u) => {
      const name = site(u.projectId);
      return name ? { code: u.ref, site: name } : { code: u.ref, site: '—', excluded: 'platform:usage.excluded.noSite' };
    });
  }
  // Generated codes for tenants without a demo unit register (fictional, deterministic).
  const flats: Flat[] = [];
  for (const s of t.sites) {
    const prefix = s.name.split(/\s+/).map((w) => w[0]).join('').toUpperCase();
    const perBuilding = Math.ceil(s.declaredUnits / Math.max(1, s.buildings));
    for (let b = 0; b < Math.max(1, s.buildings); b++) {
      const block = String.fromCharCode(65 + b);
      if (t.id === 'tnt_shalimar') flats.push({ code: `${prefix}-${block}-G01`, site: s.name, excluded: b === 0 ? 'platform:usage.excluded.office' : 'platform:usage.excluded.guardRoom' });
      for (let n = 0; n < perBuilding && flats.filter((f) => f.site === s.name && !f.excluded).length < s.declaredUnits; n++) {
        flats.push({ code: `${prefix}-${block}-${String(Math.floor(n / 4) + 1).padStart(2, '0')}${String((n % 4) + 1).padStart(2, '0')}`, site: s.name });
      }
    }
  }
  if (t.id === 'tnt_riverbend') {
    // October: four flats merged into two (the corrected count excludes the merged halves).
    flats.slice(0, 4).forEach((f, i) => {
      if (i % 2 === 1) f.excluded = 'platform:usage.excluded.merged';
    });
    flats.slice(4, 6).forEach((f) => (f.excluded = 'platform:usage.excluded.merged'));
  }
  return flats;
}

export function evidenceOf(t: TenantDetail, snapshot: UsageSnapshot): MeterEvidence {
  const unitMeter = snapshot.dimension.startsWith('units.');
  const flats = unitMeter && snapshot.source === 'counted' ? flatsOf(t) : [];
  // Riverbend's merged flats only left the count in October (the corrected snapshot).
  const effective = flats.map((f) => (t.id === 'tnt_riverbend' && snapshot.period !== '2026-10' && f.excluded === 'platform:usage.excluded.merged' ? { ...f, excluded: undefined } : f));
  const counted = effective.filter((f) => !f.excluded).slice(0, snapshot.value);
  const excluded = effective.filter((f) => f.excluded).map((f) => ({ code: f.code, site: f.site, reasonKey: f.excluded! }));
  const registered = effective.length || snapshot.value;
  const d = datasetFor(t.id);
  const occupied = d?.units.length ? d.units.filter((u) => ['occupied', 'handed_over'].includes(u.status)).length : Math.round(snapshot.value * 0.86);
  return {
    snapshotId: snapshot.id,
    dimension: snapshot.dimension,
    definition: snapshot.definition,
    definitionTextKey: `platform:usage.definitions.${snapshot.dimension.replace('.', '_')}`,
    counted: counted.map((f) => ({ code: f.code, site: f.site })),
    excluded,
    sideBySide: unitMeter
      ? [
          { dimension: 'units.registered', value: registered },
          { dimension: 'units.active', value: registered - excluded.length },
          { dimension: 'units.occupied', value: occupied },
          { dimension: 'units.eligible', value: snapshot.dimension === 'units.eligible' ? snapshot.value : registered - excluded.length },
        ]
      : [{ dimension: snapshot.dimension, value: snapshot.value }],
  };
}

// ---------------------------------------------------------------- billing calculation

function billing(ctx: PlatformContext, t: TenantDetail, snapshots: readonly UsageSnapshot[]): BillingCalculation | null {
  if (!['active', 'trial', 'grace'].includes(t.status)) return null;
  const record = currentRecord(ctx.store, t.id);
  if (!record) return null;
  const contract = record.contract;
  const periods = billingPeriods(contract.terms.start, contract.terms.billingFrequency, 36);
  const period = periods.find((p) => p.start <= TODAY && TODAY < p.end);
  if (!period) return null;
  const month = period.start.slice(0, 7);
  const declared = tenantQuantities(t);
  const latest = (dim: UsageDimension) => snapshots.filter((s) => s.dimension === dim && s.period <= month).sort((a, b) => b.period.localeCompare(a.period))[0];
  const dims = [...new Set(snapshots.map((s) => s.dimension))];
  const quantities = { ...declared, ...Object.fromEntries(dims.map((d) => [d, latest(d)?.value ?? declared[d] ?? 0])) };
  const priced = pricePeriod(contract, period, quantities);
  const config = configOn(ctx.store, period.start);
  return {
    period: { start: period.start, end: period.end },
    lines: priced.lines,
    net: priced.net,
    tax: priced.tax,
    total: priced.total,
    quantities: dims.map((d) => ({ dimension: d, value: latest(d)?.value ?? declared[d] ?? 0, snapshotId: latest(d)?.id ?? null, declared: declared[d] ?? null })),
    evaluatedWith: { contract: `${contract.id} v${contract.version}`, rateCard: config.labels.rateCard, policy: config.labels.policy },
    nonAuthoritative: true,
  };
}

export function usageOf(ctx: PlatformContext, t: TenantDetail): TenantUsage {
  const snapshots = snapshotsOf(t.id);
  const used = new Set(t.quote?.quantities.map((q) => q.dimension) ?? []);
  const dims = [...new Set([...snapshots.map((s) => s.dimension), ...used])];
  const declared = tenantQuantities(t);
  return {
    tenantId: t.id,
    status: t.status,
    meters: dims.map((dimension) => ({
      dimension,
      latest: snapshots.filter((s) => s.dimension === dimension).sort((a, b) => b.period.localeCompare(a.period))[0] ?? null,
      declared: declared[dimension] ?? null,
      priced: used.has(dimension),
    })),
    snapshots: [...snapshots].sort((a, b) => b.period.localeCompare(a.period) || a.dimension.localeCompare(b.dimension)),
    billing: billing(ctx, t, snapshots),
  };
}

export const USAGE_HANDLERS: PlatformHandler[] = [
  {
    method: 'GET',
    pattern: /^\/platform\/tenants\/(?<id>[\w-]+)\/usage$/,
    permission: 'platform.usage.view',
    handle: (ctx) => usageOf(ctx, ctx.store.tenant(ctx.params.id!) ?? notFound(ctx)),
  },
  {
    method: 'GET',
    pattern: /^\/platform\/usage\/snapshots\/(?<id>[\w-]+)\/evidence$/,
    permission: 'platform.usage.view',
    handle: (ctx): MeterEvidence => {
      for (const t of ctx.store.tenants()) {
        const s = snapshotsOf(t.id).find((x) => x.id === ctx.params.id);
        if (s) return evidenceOf(t, s);
      }
      return notFound(ctx);
    },
  },
];

/** Sum of a money list in paisa (kept for callers that total calculations). */
export const sumMoney = (xs: ReadonlyArray<{ amount: string; currency: 'PKR' }>) => fromPaisa(xs.reduce((s, m) => s + toPaisa(m), 0));
